// Scoring Engine
// Computes total score, subscale scores, and category interpretation
// for a completed questionnaire.
// See Implementation Spec §5.4, §5.5

import { evaluate } from './dsl.js';
import { isScored } from '../item-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
/**
 * Recursively collects all leaf items from a sequence that may contain
 * if-nodes and randomize-nodes.
 *
 * Since scoring runs after the questionnaire completes (all answers known),
 * we don't need to evaluate conditions — we collect items from all branches
 * and let the answer map determine which ones actually have values.
 *
 * randomize nodes are expanded by recursing into node.ids. Presentation order
 * is irrelevant for scoring (sum / average / subscales are commutative).
 */
function flattenItems(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.type === 'if') {
      result.push(...flattenItems(node.then));
      result.push(...flattenItems(node.else ?? []));
    } else if (node.type === 'randomize') {
      result.push(...flattenItems(node.ids ?? []));
    } else {
      result.push(node);
    }
  }
  return result;
}

/**
 * Returns true for item types that contribute to scoring.
 */
function isAnswerable(item) {
  return isScored(item);
}

/**
 * Resolves the [min, max] response range an item can produce.
 * select/binary: min and max of the option values (inline options, the item's
 * optionSetId, or the questionnaire's defaultOptionSetId — same resolution
 * order as the renderer). slider: the item's min/max bounds.
 * Returns null when no range can be determined.
 */
function responseRange(item, questionnaire) {
  if (item.type === 'slider') {
    if (typeof item.min !== 'number' || typeof item.max !== 'number') return null;
    return [item.min, item.max];
  }
  const options = item.options
    ?? questionnaire.optionSets?.[item.optionSetId ?? questionnaire.defaultOptionSetId];
  if (!Array.isArray(options) || options.length === 0) return null;
  const values = options.map(o => o.value);
  return [Math.min(...values), Math.max(...values)];
}

/**
 * Applies reverse scoring and weight to a single raw response value.
 * reversedValue = minValue + maxValue - rawValue, so the published reversal
 * holds for any scale regardless of where it starts (0–3, 1–5, 1–7, …).
 */
function adjustValue(rawValue, item, questionnaire) {
  let value = rawValue;
  if (item.reverse) {
    const range = responseRange(item, questionnaire);
    if (range == null)
      throw new Error(`Reverse scoring for item "${item.id}" requires resolvable options or slider bounds`);
    value = range[0] + range[1] - value;
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
  const { items: rawItems, scoring, interpretations } = questionnaire;

  // No scoring spec — return nulls
  if (!scoring || scoring.method === 'none') {
    return { total: null, subscales: {}, category: null };
  }

  // Flatten if-nodes so items nested in branches are visible to scoring.
  // All branches are included — the answer map determines which have values.
  const items = flattenItems(rawItems ?? []);
  const answerableItems = items.filter(isAnswerable);
  const { method, subscaleMethod = 'sum', totalMethod, subscales: subscaleDefs, subscaleFormulas, customFormula, exclude = [] } = scoring;

  // excluded is a Set of item IDs that should not contribute to sum/average totals.
  // Excluded items still appear in the PDF response table; they are simply not scored.
  const excludedIds = new Set(exclude);

  // ── Subscales ────────────────────────────────────────────────────────────────

  const subscales = {};
  if (subscaleDefs) {
    for (const [subscaleId, itemIds] of Object.entries(subscaleDefs)) {
      const values = itemIds.reduce((acc, id) => {
        if (excludedIds.has(id)) return acc;
        const raw = answers[id];
        if (typeof raw !== 'number') return acc;
        const item = items.find(i => i.id === id);
        acc.push(adjustValue(raw, item ?? {}, questionnaire));
        return acc;
      }, []);
      const subscaleSum = values.reduce((a, b) => a + b, 0);
      subscales[subscaleId] = subscaleMethod === 'mean'
        ? (values.length > 0 ? subscaleSum / values.length : 0)
        : subscaleSum;
    }
  }

  // Formula-defined subscales — for scores that are not a plain sum of item
  // values (e.g. AQ's binary rescoring of a 4-point scale). Evaluated before
  // the total so a custom total formula can reference them via subscale.<id>.
  if (subscaleFormulas) {
    for (const [subscaleId, formula] of Object.entries(subscaleFormulas)) {
      subscales[subscaleId] = evaluate(formula, { item: answers }, 'number');
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
    if (totalMethod === 'sum_of_items') {
      // Compute total from raw item values, independent of subscale aggregation method
      const values = answerableItems
        .filter(item => !excludedIds.has(item.id) && typeof answers[item.id] === 'number')
        .map(item => adjustValue(answers[item.id], item, questionnaire));
      total = values.reduce((a, b) => a + b, 0);
    } else {
      // Default: sum of subscale scores
      total = Object.values(subscales).reduce((a, b) => a + b, 0);
    }

  } else {
    // sum or average — only include items with a numeric response that are not excluded
    const values = answerableItems
      .filter(item => !excludedIds.has(item.id) && typeof answers[item.id] === 'number')
      .map(item => adjustValue(answers[item.id], item, questionnaire));

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
