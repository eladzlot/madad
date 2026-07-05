// heatmap-model.js — pure render-model builder for the per-item heatmap.
//
// Answers "which symptoms are moving?": rows are the instrument's scored
// items in questionnaire order, columns are sessions in date order, and
// each cell's fill encodes the answer as a fraction of that item's maximum
// — sampled from the same warm severity ramp the chart bands use.
//
// Requires the config questionnaire (item texts, option values); the
// caller hides the heatmap entirely when no config is loaded. Items whose
// answers aren't numeric (free text, multiselect) are skipped — this is a
// severity map, not a transcript.

import { SEVERITY_RAMP } from './chart-model.js';

// Past this many sessions the heatmap drops in-cell numbers and renders
// compact color chips — a year of weekly sessions must fit in the card
// without horizontal scrolling, or the "whole story at a glance" property
// is lost. Values stay reachable via cell tooltips.
export const COMPACT_THRESHOLD = 12;

// In compact mode only ~this many column headers keep their date label;
// the rest render empty to avoid collisions.
const COMPACT_LABEL_TARGET = 8;

// Default date label: day.month, year appended when sessions span years.
function defaultFormatDate(date, { withYear = false } = {}) {
  const label = `${date.getDate()}.${date.getMonth() + 1}`;
  return withYear ? `${label}.${String(date.getFullYear()).slice(2)}` : label;
}

// Walks the questionnaire's item tree (if/then/else, nested arrays) and
// returns scored leaf items in document order.
function leafItems(questionnaire) {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      if (node.id && ['select', 'binary', 'slider', 'multiselect'].includes(node.type)) out.push(node);
      walk(node.then);
      walk(node.else);
      walk(node.items);
    }
  };
  walk(questionnaire?.items);
  return out;
}

// The largest value an item can score — from its options (select/binary)
// or its slider max. Null when indeterminate.
function itemMax(item, questionnaire) {
  if (item.type === 'slider') return item.max ?? null;
  const options = item.options
    ?? questionnaire?.optionSets?.[item.optionSetId ?? questionnaire?.defaultOptionSetId];
  if (!options?.length) return null;
  return Math.max(...options.map(o => o.value));
}

/**
 * @param {object} args
 * @param {Array}  args.points        — store.series() points, sorted by date
 * @param {object} args.questionnaire — config questionnaire (required)
 * @param {Function} [args.formatDate]
 * @returns {{ compact: boolean,
 *             columns: [{label, displayLabel}],
 *             rows: [{itemId, text, cells: [{value, fill}|null]}] }}
 *   `label` is always the full date (cell tooltips); `displayLabel` is what
 *   the header shows — thinned to every Nth in compact mode, anchored so
 *   the newest column always keeps its label.
 */
export function buildHeatmapModel({ points, questionnaire, formatDate = defaultFormatDate }) {
  const count = points?.length ?? 0;
  const compact = count > COMPACT_THRESHOLD;
  const step = compact ? Math.ceil(count / COMPACT_LABEL_TARGET) : 1;
  const withYear = new Set((points ?? []).map(p => p.date.getFullYear())).size > 1;
  const columns = (points ?? []).map((p, i) => {
    const label = formatDate(p.date, { withYear });
    const show = (count - 1 - i) % step === 0;
    return { label, displayLabel: show ? label : '' };
  });

  const rows = [];
  for (const item of leafItems(questionnaire)) {
    const max = itemMax(item, questionnaire);
    const cells = (points ?? []).map(p => {
      const value = p.answers?.[item.id];
      if (typeof value !== 'number') return null;   // unanswered / non-numeric
      const frac = max > 0 ? Math.min(value / max, 1) : 0;
      return {
        value,
        fill: SEVERITY_RAMP[Math.round(frac * (SEVERITY_RAMP.length - 1))],
      };
    });
    // An item no session answered contributes nothing (e.g. untaken branch).
    if (cells.some(c => c !== null)) {
      rows.push({ itemId: item.id, text: item.text ?? item.id, cells });
    }
  }

  return { compact, columns, rows };
}
