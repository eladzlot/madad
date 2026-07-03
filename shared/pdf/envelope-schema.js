// envelope-schema.js
// The embedded-JSON envelope: the machine-readable representation of one
// session, attached to every generated PDF as `data.json`.
//
// This is the single source of truth for the envelope shape. The PDF
// generator (src/pdf/report.js) builds payloads with buildEnvelope();
// the future Aggregate surface validates inbound payloads with
// validateEnvelope(). They share this module so they cannot drift.
//
// Versioning contract (docs/AGGREGATE_SPEC.md §3.2, §3.4):
//   ENVELOPE_VERSION bumps when the top-level shape changes. Every shipped
//   version must remain readable forever — readers migrate old payloads
//   forward via explicit migration code, never by rejecting them.

export const ENVELOPE_VERSION = 1;

// ── Build ─────────────────────────────────────────────────────────────────────

/**
 * Builds the envelope object embedded in the PDF.
 *
 * @param {object} args
 * @param {object} args.sessionState — orchestrator state: { answers, scores,
 *                 alerts, questionnaireIds }, each keyed by sessionKey.
 *                 Embedded as-is; questionnaireIds is required to resolve
 *                 instanceId-based session keys back to questionnaires.
 * @param {object} args.config       — merged QuestionnaireSet (loadConfig output)
 * @param {object} [args.session]    — { name?, pid? } from app.js
 * @param {string} [args.appVersion] — forensic only; never used for routing
 * @param {Date}   [args.now]        — timestamp source, injectable for tests
 * @returns {object} envelope (plain JSON-serializable object)
 */
export function buildEnvelope({ sessionState, config, session = {}, appVersion = null, now = new Date() }) {
  const answers = sessionState?.answers ?? {};

  // One entry per completed session key, in answer order — same resolution
  // rule as the PDF detail sections: instanceId keys map to questionnaires
  // via the questionnaireIds map, plain keys are questionnaire IDs already.
  const instruments = Object.keys(answers).map(sessionKey => {
    const qId = sessionState.questionnaireIds?.[sessionKey] ?? sessionKey;
    const q   = config?.questionnaires?.find(q => q.id === qId);
    return {
      questionnaireId: qId,
      title:           q?.title ?? null,
      configFile:      q?.configFile ?? null,
    };
  });

  return {
    schemaVersion: ENVELOPE_VERSION,
    generatedAt:   now.toISOString(),
    appVersion,
    pid:           session?.pid ?? null,
    name:          session?.name ?? null,
    instruments,
    sessionState: {
      answers,
      scores:           sessionState?.scores ?? {},
      alerts:           sessionState?.alerts ?? {},
      questionnaireIds: sessionState?.questionnaireIds ?? {},
    },
  };
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Structural validation for inbound payloads (the Aggregate read path).
 * Deliberately hand-rolled and shallow: Aggregate treats unknown extra
 * fields as forward-compatible, so only the fields it relies on are checked.
 *
 * @param {*} payload — parsed JSON from a PDF's data.json attachment
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEnvelope(payload) {
  const errors = [];

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['payload must be a JSON object'] };
  }

  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1) {
    errors.push('schemaVersion must be a positive integer');
  } else if (payload.schemaVersion > ENVELOPE_VERSION) {
    errors.push(`schemaVersion ${payload.schemaVersion} is newer than this build supports (${ENVELOPE_VERSION})`);
  }

  if (typeof payload.generatedAt !== 'string' || Number.isNaN(Date.parse(payload.generatedAt))) {
    errors.push('generatedAt must be an ISO 8601 date string');
  }

  if (payload.pid !== null && payload.pid !== undefined && typeof payload.pid !== 'string') {
    errors.push('pid must be a string or null');
  }
  if (payload.name !== null && payload.name !== undefined && typeof payload.name !== 'string') {
    errors.push('name must be a string or null');
  }

  if (!Array.isArray(payload.instruments)) {
    errors.push('instruments must be an array');
  } else {
    payload.instruments.forEach((inst, i) => {
      if (inst === null || typeof inst !== 'object') {
        errors.push(`instruments[${i}] must be an object`);
      } else if (typeof inst.questionnaireId !== 'string' || inst.questionnaireId === '') {
        errors.push(`instruments[${i}].questionnaireId must be a non-empty string`);
      }
    });
  }

  const ss = payload.sessionState;
  if (ss === null || typeof ss !== 'object' || Array.isArray(ss)) {
    errors.push('sessionState must be an object');
  } else {
    for (const field of ['answers', 'scores', 'alerts']) {
      const v = ss[field];
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`sessionState.${field} must be an object`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
