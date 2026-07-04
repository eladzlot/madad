// chart-model.js — pure render-model builder for a trajectory chart.
//
// Input: an instrument's points (from store.series()), its config-declared
// overlays (interpretations — AGG-1/D-12), a visible window, and dimensions.
// Output: plain data the Lit component stamps into SVG verbatim. All layout
// decisions live here so they can be pinned by unit tests (D-10 guardrail).
//
// Coordinate system: SVG viewBox units, y grows downward, time flows
// left-to-right (D-10 — supersedes the spec's original RTL axis).

import { linearScale, timeScale, yTickValues, niceMax } from './scales.js';

export const DEFAULT_WINDOW_SIZE = 5;   // AGGREGATE_SPEC §5.4

export const DIMS = {
  width: 800,
  height: 300,
  margin: { top: 18, right: 18, bottom: 30, left: 42 },
};

// Warm severity ramp, lowest → highest band (lifted from the PDF's palette
// family). Bands sample this ramp evenly by index.
const SEVERITY_RAMP = ['#F4F7F4', '#FDFBEF', '#FDF3DF', '#FCE9E1', '#FBE0E0'];

// Default date label: day.month in local time, year appended when the
// visible points span more than one year. Injectable for tests (UTC).
function defaultFormatDate(date, { withYear = false } = {}) {
  const label = `${date.getDate()}.${date.getMonth() + 1}`;
  return withYear ? `${label}.${String(date.getFullYear()).slice(2)}` : label;
}

/**
 * @param {object}   args
 * @param {Array}    args.points           — [{date, total, category, alerts, ...}] sorted ascending
 * @param {object}   [args.interpretations] — the instrument's interpretations block (or undefined)
 * @param {number}   [args.windowOffset]   — 0 = newest window; 1 = one page older; …
 * @param {number}   [args.windowSize]
 * @param {object}   [args.dims]
 * @param {Function} [args.formatDate]
 * @returns {object} render model
 */
export function buildChartModel({
  points,
  interpretations,
  windowOffset = 0,
  windowSize = DEFAULT_WINDOW_SIZE,
  dims = DIMS,
  formatDate = defaultFormatDate,
}) {
  const { width, height, margin } = dims;
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };

  if (!points || points.length === 0) {
    return { width, height, plot, empty: true, bands: [], cutoffs: [], markers: [], linePath: null, xTicks: [], yTicks: [], pagination: null };
  }

  // ── Visible window: anchored to the newest end, paged backwards ──────────
  const total = points.length;
  const pageCount = Math.max(1, Math.ceil(total / windowSize));
  const offset = Math.min(Math.max(0, windowOffset), pageCount - 1);
  const end = total - offset * windowSize;             // exclusive
  const start = Math.max(0, end - windowSize);
  const visible = points.slice(start, end);

  const pagination = total > windowSize
    ? { from: start + 1, to: end, total, hasOlder: start > 0, hasNewer: end < total }
    : null;

  // ── Scales ────────────────────────────────────────────────────────────────
  const bandRanges = interpretations?.type === 'severity' ? (interpretations.ranges ?? []) : [];
  const cutoffDefs = interpretations?.cutoffs ?? [];

  // Y spans 0 → the largest of: observed totals, band tops, cutoff values —
  // so overlays are always inside the chart without reimplementing each
  // scoring method's theoretical max.
  const rawMax = Math.max(
    ...visible.map(p => p.total),
    ...bandRanges.map(r => r.max),
    ...cutoffDefs.map(c => c.value),
  );
  const yMax = niceMax(rawMax);
  const y = linearScale(yMax, plot.y + plot.h, plot.y);
  const x = timeScale(visible.map(p => p.date), plot.x, plot.x + plot.w);

  // ── Overlays ──────────────────────────────────────────────────────────────
  const bands = bandRanges.map((r, i) => {
    const topValue = Math.min(r.max, yMax);
    const bottomValue = Math.max(r.min, 0);
    const rampIdx = bandRanges.length === 1 ? 0
      : Math.round((i / (bandRanges.length - 1)) * (SEVERITY_RAMP.length - 1));
    return {
      y: y(topValue),
      h: y(bottomValue) - y(topValue),
      label: r.label,
      fill: SEVERITY_RAMP[rampIdx],
    };
  });

  const cutoffs = cutoffDefs.map(c => ({ y: y(c.value), label: c.label ?? null }));

  // ── Points ────────────────────────────────────────────────────────────────
  const withYear = new Set(visible.map(p => p.date.getFullYear())).size > 1;
  const markers = visible.map((p, i) => ({
    x: x(p.date),
    y: y(p.total),
    date: p.date,
    label: formatDate(p.date, { withYear }),
    total: p.total,
    category: p.category ?? null,
    alerts: p.alerts ?? [],
    // Baseline = first session of the uploaded set (§5.3), marked only
    // when it is actually visible in the current window.
    baseline: start === 0 && i === 0,
  }));

  const linePath = markers.length > 1
    ? 'M ' + markers.map(m => `${round(m.x)} ${round(m.y)}`).join(' L ')
    : null;

  // ── Ticks ─────────────────────────────────────────────────────────────────
  const yTicks = yTickValues(yMax).map(v => ({ y: y(v), label: String(v) }));
  const xTicks = markers.map(m => ({ x: m.x, label: m.label }));

  return { width, height, plot, empty: false, bands, cutoffs, markers, linePath, xTicks, yTicks, pagination };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
