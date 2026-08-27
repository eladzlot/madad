/**
 * mock-report.js
 *
 * Pure scenario → session-state logic behind the mock report generator.
 * No pdfmake, no CLI, no file writing — everything here is testable in
 * isolation (scripts/lib/mock-report.test.js). The wrapper that actually
 * renders PDFs is scripts/generate-test-pdfs.mjs.
 *
 * A scenario names instruments and, per session, how each one was answered.
 * Two forms are accepted per instrument:
 *
 *   "phq9": 18                              — target TOTAL; answers derived
 *                                             greedily (see answersForTotal).
 *   "phq9": { "answers": { "1": 3, ... } }  — explicit per-item answers, used
 *                                             verbatim and scored by the real
 *                                             engine. An optional "total": N
 *                                             asserts what they should score.
 *
 * The explicit form is the one to reach for when the symptom profile matters:
 * the writer picks clinically coherent answers and the engine reports what
 * they actually score — no solver in the middle to be wrong about. The number
 * form stays because the committed E2E fixture scenario uses it.
 *
 * Scope: `select` and `binary` items only. Control-flow nodes (`if`,
 * `randomize`) and the other scored types (`slider`, `rated_text`) are
 * rejected by name rather than silently mis-scored.
 */

import { readFileSync } from 'fs';
import { resolve, join } from 'path';

import { score } from '../../src/engine/scoring.js';
import { evaluateAlerts } from '../../src/engine/alerts.js';
import { resolveItemOptions } from '../../shared/config/options.js';
import { isScored } from '../../shared/config/item-types.js';

/** Item types the generator can answer. Everything else is rejected by name. */
export const SUPPORTED_ITEM_TYPES = ['select', 'binary'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A scenario-authoring problem, as opposed to a bug. Carries the individual
 * `problems` so a caller can render them however it likes; the message already
 * contains them as a bulleted list.
 */
export class ScenarioError extends Error {
  constructor(message, problems = []) {
    super(problems.length ? `${message}\n  - ${problems.join('\n  - ')}` : message);
    this.name = 'ScenarioError';
    this.problems = problems;
  }
}

// ─── Scenario shape ───────────────────────────────────────────────────────────

/**
 * Accepts a bare patient object, a `{ patients: [...] }` wrapper, or a bare
 * array of patients, and returns a validated patient array. One file can
 * therefore describe a whole slide set.
 */
export function normalizeScenario(raw) {
  const patients = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.patients)
      ? raw.patients
      : [raw];

  const problems = [];
  if (patients.length === 0) problems.push('the scenario contains no patients');

  patients.forEach((p, i) => {
    const where = `patient ${i}${p?.pid ? ` ("${p.pid}")` : ''}`;
    if (!p || typeof p !== 'object') {
      problems.push(`${where}: not an object`);
      return;
    }
    if (!Array.isArray(p.sessions) || p.sessions.length === 0) {
      problems.push(`${where}: "sessions" must be a non-empty array`);
      return;
    }
    p.sessions.forEach((s, j) => {
      if (!DATE_RE.test(s?.date ?? '')) {
        problems.push(`${where} session ${j}: "date" must be YYYY-MM-DD, got ${JSON.stringify(s?.date)}`);
      }
      if (!s?.instruments || typeof s.instruments !== 'object' || Object.keys(s.instruments).length === 0) {
        problems.push(`${where} session ${j}: "instruments" must be a non-empty object`);
      }
    });
  });

  if (problems.length) throw new ScenarioError('Invalid scenario:', problems);

  return patients.map((p) => ({
    pid: p.pid ?? null,
    name: p.name ?? null,
    out: p.out ?? null,
    sessions: p.sessions,
  }));
}

/**
 * Where one patient's PDFs are written, given the run's base output directory.
 *
 * A single patient writes straight into `baseOut` (the fixture case and the
 * common demo case); a set fans out into per-patient subdirectories so the
 * Aggregate can be fed one profile at a time.
 *
 * Exported because the shot generator has to predict these paths without
 * re-running the PDF build — the two must agree by construction, not by two
 * copies of the same expression.
 */
export function patientOutDir(patient, index, patientCount, baseOut) {
  if (patientCount === 1) return baseOut;
  return join(baseOut, patient.out ?? patient.pid ?? `patient-${index}`);
}

/** Every instrument id named anywhere in the scenario, deduped. */
export function collectInstrumentIds(patients) {
  return [...new Set(patients.flatMap((p) => p.sessions.flatMap((s) => Object.keys(s.instruments))))];
}

/**
 * Loads the named instruments from a config directory.
 *
 * Item IDs are addresses: every questionnaire lives at <configDir>/<id>.json,
 * filename = entity id — the same expansion src/app.js does with `items=`.
 * Batteries are not supported (they define no questionnaire of their own id).
 */
export function loadQuestionnaires(ids, configDir) {
  const questionnaires = new Map();
  for (const id of ids) {
    const path = resolve(configDir, `${id}.json`);
    let configData;
    try {
      configData = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new ScenarioError(`Cannot load config for instrument "${id}" (${path}): ${err.message}`);
    }
    for (const q of configData.questionnaires ?? []) {
      // Mirror the loader's annotation: with one entity per file the config
      // short name is the instrument id itself.
      questionnaires.set(q.id, { ...q, configFile: id });
    }
    if (!questionnaires.has(id)) {
      throw new ScenarioError(
        `Config ${id}.json defines no questionnaire "${id}" — batteries are not supported by the mock generator.`
      );
    }
  }
  return questionnaires;
}

// ─── Items and options ────────────────────────────────────────────────────────

/**
 * The scored leaf items of a questionnaire, in presentation order — the items
 * that need an answer. Items in `scoring.exclude` ARE included: they are
 * answered and shown in the PDF, just kept out of the total.
 *
 * Throws on anything the generator cannot answer, rather than skipping it and
 * producing a report that is quietly wrong.
 */
export function answerableItems(questionnaire) {
  const items = [];
  for (const node of questionnaire.items ?? []) {
    if (node.type === 'if' || node.type === 'randomize') {
      throw new ScenarioError(
        `"${questionnaire.id}" contains a "${node.type}" node — branching instruments are not supported by the mock generator yet.`
      );
    }
    if (!isScored(node)) continue;
    if (!SUPPORTED_ITEM_TYPES.includes(node.type)) {
      throw new ScenarioError(
        `"${questionnaire.id}" has a scored "${node.type}" item ("${node.id}") — only ` +
          `${SUPPORTED_ITEM_TYPES.join(' and ')} items are supported yet.`
      );
    }
    items.push(node);
  }
  if (items.length === 0) {
    throw new ScenarioError(`"${questionnaire.id}" has no scored select/binary items — nothing to answer.`);
  }
  return items;
}

/** The legal answer values for an item, in config order. */
export function optionValues(item, questionnaire) {
  return resolveItemOptions(item, questionnaire).map((o) => o.value);
}

/**
 * Item ids, prompts and legal options for an instrument — what `--describe`
 * prints so answers can be authored without opening the config JSON.
 */
export function describeInstrument(questionnaire) {
  return answerableItems(questionnaire).map((item) => ({
    id: item.id,
    type: item.type,
    prompt: item.prompt ?? item.text ?? '',
    excluded: (questionnaire.scoring?.exclude ?? []).includes(item.id),
    options: resolveItemOptions(item, questionnaire).map((o) => ({ label: o.label, value: o.value })),
  }));
}

// ─── Answer derivation ────────────────────────────────────────────────────────

/**
 * Greedy fill: walk scored items in order, assigning each the largest available
 * option value that doesn't overshoot the target. Front-loading keeps late
 * items at 0 — which for PHQ-9 keeps item 9 (suicidality alert) quiet unless
 * the target is high enough to force it.
 *
 * The resulting response pattern is obviously synthetic (maxed items, then
 * zeros). That is fine for chart fixtures and wrong for a slide showing the
 * PDF's response table — use the explicit `{ answers }` form there.
 *
 * Reverse-scored items are NOT accounted for; buildSessionState's engine check
 * catches the resulting mismatch and says so.
 */
export function answersForTotal(questionnaire, target) {
  if (!Number.isInteger(target) || target < 0) {
    throw new ScenarioError(`Target total for "${questionnaire.id}" must be a non-negative integer, got ${JSON.stringify(target)}.`);
  }
  const excluded = new Set(questionnaire.scoring?.exclude ?? []);
  const items = answerableItems(questionnaire).filter((it) => !excluded.has(it.id));

  const answers = {};
  let remaining = target;
  for (const item of items) {
    const values = optionValues(item, questionnaire).slice().sort((a, b) => b - a);
    const pick = values.find((v) => v <= remaining) ?? 0;
    answers[item.id] = pick;
    remaining -= pick;
  }
  if (remaining !== 0) {
    throw new ScenarioError(
      `Cannot reach total ${target} for "${questionnaire.id}" (short by ${remaining}). ` +
        `Use the explicit { "answers": … } form to say exactly what was answered.`
    );
  }
  return answers;
}

/**
 * Validates author-supplied answers against the instrument and returns them.
 *
 * Every problem is collected before throwing, so one run surfaces all of them.
 * The checks exist because the failure they prevent — a typo'd item id silently
 * scoring 0 — puts a wrong number on a slide with nothing to notice.
 */
export function explicitAnswers(questionnaire, provided, { describeHint = true } = {}) {
  if (!provided || typeof provided !== 'object' || Array.isArray(provided)) {
    throw new ScenarioError(`"answers" for "${questionnaire.id}" must be an object keyed by item id.`);
  }
  const items = answerableItems(questionnaire);
  const byId = new Map(items.map((it) => [it.id, it]));
  const problems = [];

  for (const [itemId, value] of Object.entries(provided)) {
    const item = byId.get(itemId);
    if (!item) {
      problems.push(`unknown item "${itemId}"`);
      continue;
    }
    const legal = optionValues(item, questionnaire);
    if (!legal.includes(value)) {
      problems.push(`item "${itemId}" = ${JSON.stringify(value)} is not a legal option (allowed: ${legal.join(', ')})`);
    }
  }

  const missing = items.filter((it) => !(it.id in provided)).map((it) => it.id);
  if (missing.length) {
    problems.push(`unanswered ${missing.length === 1 ? 'item' : 'items'}: ${missing.join(', ')}`);
  }

  if (problems.length) {
    const hint = describeHint
      ? `\n  (run \`npm run demo -- --describe ${questionnaire.id}\` to list item ids and legal values)`
      : '';
    throw new ScenarioError(`Bad answers for "${questionnaire.id}":`, problems.concat(hint ? [hint.trim()] : []));
  }
  return { ...provided };
}

/**
 * Dispatches one instrument's scenario value to the right derivation.
 * Returns the answers plus the total the author asserted, if any.
 */
export function resolveInstrumentAnswers(questionnaire, spec) {
  if (typeof spec === 'number') {
    return { answers: answersForTotal(questionnaire, spec), expectedTotal: spec, derived: true };
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    if (spec.answers !== undefined) {
      return {
        answers: explicitAnswers(questionnaire, spec.answers),
        expectedTotal: typeof spec.total === 'number' ? spec.total : null,
        derived: false,
      };
    }
    if (typeof spec.total === 'number') {
      return { answers: answersForTotal(questionnaire, spec.total), expectedTotal: spec.total, derived: true };
    }
  }
  throw new ScenarioError(
    `Instrument "${questionnaire.id}": expected a target total (a number) or { "answers": { … } }, got ${JSON.stringify(spec)}.`
  );
}

// ─── Session assembly ─────────────────────────────────────────────────────────

/**
 * Builds the session state the PDF generator consumes — the same shape the
 * patient app produces, scored and alerted by the real engine.
 */
export function buildSessionState(questionnaires, instruments) {
  const state = { answers: {}, scores: {}, alerts: {}, questionnaireIds: {} };

  for (const [qId, spec] of Object.entries(instruments)) {
    const q = questionnaires.get(qId);
    if (!q) throw new ScenarioError(`Questionnaire "${qId}" not found in the loaded configs.`);

    const { answers, expectedTotal, derived } = resolveInstrumentAnswers(q, spec);
    const scoreResult = score(q, answers);

    if (expectedTotal != null && scoreResult.total !== expectedTotal) {
      throw new ScenarioError(
        `"${qId}" scored ${scoreResult.total}, expected ${expectedTotal}.` +
          (derived
            ? ' The greedy fill does not account for reverse-scored items — use the explicit { "answers": … } form.'
            : ' The supplied answers do not add up to the asserted "total".')
      );
    }

    state.answers[qId] = answers;
    state.scores[qId] = scoreResult;
    state.alerts[qId] = evaluateAlerts(q, answers, scoreResult);
    state.questionnaireIds[qId] = qId;
  }
  return state;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

/**
 * One line per instrument: total, category, subscales and fired alerts — the
 * confirmation that the generated profile is the one that was asked for.
 */
export function summarizeSession(sessionState) {
  return Object.keys(sessionState.scores).map((qId) => {
    const s = sessionState.scores[qId];
    const parts = [`${qId}: ${s.total}`];

    // scoring.js's interpret() returns the range's label, not the range.
    if (s.category) parts.push(`(${s.category})`);

    const subs = Object.entries(s.subscales ?? {});
    if (subs.length) {
      parts.push(`[${subs.map(([k, v]) => `${k} ${Number.isInteger(v) ? v : v.toFixed(1)}`).join(', ')}]`);
    }

    const alerts = sessionState.alerts[qId] ?? [];
    if (alerts.length) {
      parts.push(`⚠ ${alerts.map((a) => `${a.id}${a.severity ? `/${a.severity}` : ''}`).join(', ')}`);
    }

    return parts.join(' ');
  });
}
