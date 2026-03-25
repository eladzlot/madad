// Alert Evaluator
// Evaluates alert conditions for a completed questionnaire and returns
// the alerts whose conditions evaluated to true.
// See Implementation Spec §5.6, §6.3

import { evaluate, DSLSyntaxError, DSLReferenceError, DSLTypeError } from './dsl.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all alerts for a completed questionnaire.
 *
 * @param {object}   questionnaire           - Questionnaire definition from config
 * @param {object}   answers                 - { [itemId]: number } for this questionnaire
 * @param {{ total: number|null, subscales: object }} scoreResult - from scoring.js
 * @returns {Array<{ id: string, message: string, severity?: string }>}
 */
export function evaluateAlerts(questionnaire, answers, scoreResult) {
  const alertDefs = questionnaire.alerts;
  if (!alertDefs || alertDefs.length === 0) return [];

  const context = {
    item:     answers,
    subscale: scoreResult.subscales ?? {},
    // Populate score so conditions like 'score.pcl5 >= 33' resolve correctly.
    // Keyed by questionnaire id so the DSL reference score.<id> matches.
    score:    { [questionnaire.id]: scoreResult.total ?? null },
  };

  const fired = [];

  for (const alertDef of alertDefs) {
    let triggered;
    try {
      triggered = evaluate(alertDef.condition, context, 'boolean');
    } catch (err) {
      if (err instanceof DSLSyntaxError || err instanceof DSLReferenceError || err instanceof DSLTypeError) {
        // Condition is malformed or references missing data — treat as non-firing
        // but surface a warning so the clinician knows something went wrong
        console.warn(`Alert "${alertDef.id}" condition error: ${err.message}`);
        continue;
      }
      throw err;
    }

    if (triggered) {
      const alert = { id: alertDef.id, message: alertDef.message };
      if (alertDef.severity != null) alert.severity = alertDef.severity;
      fired.push(alert);
    }
  }

  return fired;
}
