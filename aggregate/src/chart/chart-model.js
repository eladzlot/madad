// chart-model.js — pure render-model builder for a trajectory chart.
//
// Input: an instrument's points (from store.series()), its config-declared
// overlays (interpretations — AGG-1/D-12), a visible window, and dimensions.
// Output: plain data the Lit component stamps into SVG verbatim. All layout
// decisions live here so they can be pinned by unit tests (D-10 guardrail).
//
// Coordinate system: SVG viewBox units, y grows downward, time flows
// left-to-right (D-10 — supersedes the spec's original RTL axis).

import { linearScale, timeScale, paddedTimeDomain, yTickValues, niceMax } from './scales.js';

// The axis always spans at least this many session-slots (§5.4 / D-13):
// few sessions cluster left with visible "future"; beyond that the series
// simply grows denser — every session is always on screen.
export const MIN_TIME_SLOTS = 5;

// At most ~this many x-axis date labels; thinned when denser, the newest
// always keeps its label. Narrow plots get fewer: one label per
// X_LABEL_SPACING units of plot width, never fewer than two.
const X_LABEL_TARGET = 8;
const X_LABEL_SPACING = 56;

export const DIMS = {
  width: 800,
  height: 300,
  margin: { top: 18, right: 18, bottom: 30, left: 48 },
};

// On-screen chart geometry for a card `px` CSS pixels wide.
//
// The chart's text is sized in viewBox units (9–10), so the viewBox width
// sets the text size on screen. A fixed 800-unit viewBox rendered labels at
// ~4 px on a phone. Instead the scale (CSS px per unit) never drops below
// MIN_SCALE: wide cards keep the 800-unit layout and simply scale up, as
// before; narrower cards get a narrower viewBox with fewer x labels, a
// shorter plot and a slimmer y-axis margin. `px` of 0 (not yet measured)
// falls back to DIMS. Exports don't use this; they have their own frame.
export const MIN_SCALE = 1.2;
const NARROW_WIDTH = 560;   // viewBox units below which the compact layout applies

export function chartDims(px) {
  if (!(px > 0)) return { ...DIMS, scale: 1 };
  const scale = Math.max(MIN_SCALE, px / DIMS.width);
  const width = Math.round(px / scale);
  if (width >= NARROW_WIDTH) return { ...DIMS, width, scale };
  return {
    width,
    height: Math.max(200, Math.round(width * 0.8)),
    margin: { ...DIMS.margin, left: 36, right: 12 },
    scale,
  };
}

// Horizontal inset for data points inside the plot: keeps the first marker
// clear of the y-axis labels and the last marker clear of the right edge.
export const X_INSET = 16;

// Warm severity ramp, lowest → highest (lifted from the PDF's palette
// family). Bands sample this ramp evenly by index; the item heatmap reuses
// it so cell colors and band colors speak the same language.
//
// The ramp descends in LIGHTNESS as well as travelling green → red, so the
// sequence stays readable without hue perception. The previous ramp was flat
// (all five steps within L* 96–98) and leaned entirely on the red–green axis:
// adjacent steps sat ΔE 1.9–4.1 apart for *normal* vision, and closer still
// under deuteranopia. Adjacent steps now clear ΔE 8.6 under protanopia and
// deuteranopia. The heatmap prints each cell's value on top, so colour is a
// redundant cue there — except in compact mode, where the cell is blank.
export const SEVERITY_RAMP = ['#EBF7ED', '#E8E6BE', '#F6CA98', '#F6AD96', '#E99794'];

// Default date label: day.month in local time, year appended when the
// visible points span more than one year. Injectable for tests (UTC).
function defaultFormatDate(date, { withYear = false } = {}) {
  const label = `${date.getDate()}.${date.getMonth() + 1}`;
  return withYear ? `${label}.${String(date.getFullYear()).slice(2)}` : label;
}

// Date labels for a UI language. Hebrew keeps the compact day.month above.
// Other languages name the month ("3 Aug"): a numeric day/month reads
// backwards to half of English readers, and en-GB pads it to "03/08".
export function axisDateFormat(lang, locale) {
  if (lang === 'he') return defaultFormatDate;
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' });
  return (date, { withYear = false } = {}) => (withYear ? long : short).format(date);
}

// Full dates (the table, file list, export range), on the same rule.
export function fullDateFormat(lang, locale) {
  const opts = lang === 'he'
    ? { day: 'numeric', month: 'numeric', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, opts);
}

/**
 * @param {object}   args
 * @param {Array}    args.points           — [{date, total, category, alerts, ...}] sorted ascending
 * @param {object}   [args.interpretations] — the instrument's interpretations block (or undefined)
 * @param {[Date,Date]} [args.domain]      — shared x-domain across charts. All instruments render
 *                                           on the same time scale so same-date points align
 *                                           vertically between charts; when absent the chart
 *                                           derives its own domain from its points.
 * @param {object}   [args.dims]
 * @param {Function} [args.formatDate]
 * @param {string}   [args.dir]        — 'rtl' | 'ltr', the UI language's direction; sets
 *                                       label anchors and is echoed back as `dir` for the renderers
 * @returns {object} render model
 */
export function buildChartModel({
  points,
  interpretations,
  domain,
  dims = DIMS,
  formatDate = defaultFormatDate,
  dir = 'rtl',
}) {
  const { width, height, margin } = dims;
  const rtl = dir !== 'ltr';
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };

  if (!points || points.length === 0) {
    return { width, height, plot, dir, empty: true, bands: [], cutoffs: [], markers: [], linePath: null, xTicks: [], yTicks: [] };
  }

  // Every session is always on screen (D-13 — no windowing, no pagination);
  // the axis just spans at least MIN_TIME_SLOTS session-intervals so sparse
  // histories cluster left with visible "future".
  const visible = points;

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
  const xDomain = domain ?? paddedTimeDomain(visible.map(p => p.date), MIN_TIME_SLOTS);
  const x = timeScale(xDomain, plot.x + X_INSET, plot.x + plot.w - X_INSET);

  // ── Overlays ──────────────────────────────────────────────────────────────
  // Band labels sit inside the right edge of the plot, cutoff labels inside
  // the left edge — opposite corners so they cannot collide with each other
  // or with the y-axis ticks (left, outside the plot).
  //
  // Anchor semantics: labels are rendered with an explicit direction (`dir`,
  // the UI language's — see trajectory-chart), and SVG text-anchor is
  // direction-relative. In rtl 'end' puts the text's LEFT edge at x (extends
  // rightward) and 'start' its RIGHT edge (extends leftward); ltr is the
  // mirror image, so the anchors swap to keep the labels inside the plot.
  // Ranges are integer-inclusive (0–4, 5–9, …), so naive rendering leaves
  // 1-unit gaps between bands in continuous space. Bands tile instead:
  // each band's bottom chains to the previous band's top, the first starts
  // at 0, and the topmost extends to the axis top (scores above the
  // instrument max are impossible; a bare strip up there reads as an
  // unlabelled zone).
  const sortedRanges = [...bandRanges].sort((a, b) => a.min - b.min);
  const bands = sortedRanges.map((r, i) => {
    const topValue = i === sortedRanges.length - 1 ? yMax : Math.min(r.max, yMax);
    const bottomValue = i === 0 ? 0 : Math.min(sortedRanges[i - 1].max, yMax);
    const rampIdx = sortedRanges.length === 1 ? 0
      : Math.round((i / (sortedRanges.length - 1)) * (SEVERITY_RAMP.length - 1));
    return {
      y: y(topValue),
      h: y(bottomValue) - y(topValue),
      label: r.label,
      labelX: plot.x + plot.w - 6,
      labelAnchor: rtl ? 'start' : 'end',   // extends leftward into the plot
      fill: SEVERITY_RAMP[rampIdx],
    };
  });

  const cutoffs = cutoffDefs.map(c => ({
    y: y(c.value),
    label: c.label ?? null,
    labelX: plot.x + 6,
    labelAnchor: rtl ? 'end' : 'start',   // extends rightward into the plot
  }));

  // ── Points ────────────────────────────────────────────────────────────────
  const withYear = new Set(visible.map(p => p.date.getFullYear())).size > 1;
  const markers = visible.map((p, i) => ({
    x: x(p.date),
    y: y(p.total),
    date: p.date,
    label: formatDate(p.date, { withYear }),
    total: p.total,
    category: p.category ?? null,
    subscales: p.subscales ?? {},
    alerts: p.alerts ?? [],
    sessionId: p.sessionId ?? null,
    sessionKey: p.sessionKey ?? null,
    fileName: p.fileName ?? null,
    // Baseline = first session of the uploaded set (§5.3).
    baseline: i === 0,
  }));

  const linePath = markers.length > 1
    ? 'M ' + markers.map(m => `${round(m.x)} ${round(m.y)}`).join(' L ')
    : null;

  // ── Ticks ─────────────────────────────────────────────────────────────────
  // Dense series thin their date labels to ~labelTarget, anchored so the
  // newest session always keeps its label (same rule as the heatmap).
  const yTicks = yTickValues(yMax).map(v => ({ y: y(v), label: String(v) }));
  const labelTarget = Math.min(X_LABEL_TARGET, Math.max(2, Math.floor(plot.w / X_LABEL_SPACING)));
  const step = Math.max(1, Math.ceil(markers.length / labelTarget));
  const xTicks = markers
    .filter((_, i) => (markers.length - 1 - i) % step === 0)
    .map(m => ({ x: m.x, label: m.label }));

  return { width, height, plot, dir, empty: false, bands, cutoffs, markers, linePath, xTicks, yTicks };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
