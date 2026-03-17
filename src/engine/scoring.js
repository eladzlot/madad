// Scoring Engine
// Computes total score, subscale scores, and category interpretation
// for a completed questionnaire.
// See Implementation Spec §5.4, §5.5

import { evaluate } from './dsl.js';
import { isScored } from '../item-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true for item types that contribute to scoring.
 */
function isAnswerable(item) {
  return isScored(item);
}

/**
 * Applies reverse scoring and weight to a single raw response value.
 * reversedValue = maxPerItem - rawValue
 */
function adjustValue(rawValue, item, maxPerItem) {
  let value = rawValue;
  if (item.reverse) {
    if (maxPerItem == null)
      throw new Error(`Reverse scoring for item "${item.id}" requires maxPerItem on the scoring spec`);
    value = maxPerItem - value;
  }
  return value * (item.weight ?? 1);
}

/**
 * Finds the first interpretation range that contains the given score.
 * Returns the label or null if no range matches.
 */
function interpret(ranges, score) {
  if (!ranges) return null;
  for (const range of ranges) {
    if (score >= range.min && score <= range.max) return range.label;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a completed questionnaire.
 *
 * @param {object} questionnaire  - Questionnaire definition from config
 * @param {object} answers        - { [itemId]: any } — non-numeric values are skipped during scoring
 * @returns {{
 *   total:     number | null,
 *   subscales: { [subscaleId]: number },
 *   category:  string | null,
 * }}
 */
export function score(questionnaire, answers) {
  const { items, scoring, interpretations } = questionnaire;

  // No scoring spec — return nulls
  if (!scoring || scoring.method === 'none') {
    return { total: null, subscales: {}, category: null };
  }

  const answerableItems = items.filter(isAnswerable);
  const { method, maxPerItem, subscales: subscaleDefs, customFormula } = scoring;

  // ── Subscales ────────────────────────────────────────────────────────────────

  const subscales = {};
  if (subscaleDefs) {
    for (const [subscaleId, itemIds] of Object.entries(subscaleDefs)) {
      subscales[subscaleId] = itemIds.reduce((sum, id) => {
        const raw = answers[id];
        if (typeof raw !== 'number') return sum;
        const item = items.find(i => i.id === id);
        return sum + adjustValue(raw, item ?? {}, maxPerItem);
      }, 0);
    }
  }

  // ── Total ────────────────────────────────────────────────────────────────────

  let total;

  if (method === 'custom' && customFormula) {
    const context = {
      item:     answers,
      subscale: subscales,
    };
    total = evaluate(customFormula, context, 'number');

  } else if (method === 'subscales') {
    // Total is sum of all subscale scores
    total = Object.values(subscales).reduce((a, b) => a + b, 0);

  } else {
    // sum or average — only include items with a numeric response
    const values = answerableItems
      .filter(item => typeof answers[item.id] === 'number')
      .map(item => adjustValue(answers[item.id], item, maxPerItem));

    total = values.reduce((a, b) => a + b, 0);
    if (method === 'average') total = values.length > 0 ? total / values.length : 0;
  }

  // ── Interpretation ────────────────────────────────────────────────────────────

  let category = null;
  if (interpretations) {
    const target = interpretations.target ?? 'total';
    const targetScore = target === 'total' ? total : (subscales[target] ?? null);
    if (targetScore != null) {
      category = interpret(interpretations.ranges, targetScore);
    }
  }

  return { total, subscales, category };
}
