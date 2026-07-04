// scales.js — pure scale and tick math for trajectory charts.
// No DOM, no formatting beyond numbers; unit-tested directly (D-10's
// complexity guardrail: geometry lives here, the Lit component only stamps).

/**
 * Linear y scale mapping [0, domainMax] onto [rangeBottom, rangeTop].
 * SVG y grows downward, so rangeBottom > rangeTop.
 */
export function linearScale(domainMax, rangeBottom, rangeTop) {
  const span = rangeBottom - rangeTop;
  return (v) => rangeBottom - (v / domainMax) * span;
}

/**
 * Time x scale: positions dates proportionally to real elapsed time across
 * [rangeStart, rangeEnd] (LTR — older on the left, D-10).
 *
 * A single date (or all-identical dates) anchors at rangeStart: the empty
 * right side reads as "future" (AGGREGATE_SPEC §5.4).
 */
export function timeScale(dates, rangeStart, rangeEnd) {
  const min = Math.min(...dates.map(d => d.getTime()));
  const max = Math.max(...dates.map(d => d.getTime()));
  if (max === min) return () => rangeStart;
  return (d) => rangeStart + ((d.getTime() - min) / (max - min)) * (rangeEnd - rangeStart);
}

/**
 * Tick values for a [0, max] axis: a step of 1/2/5×10ⁿ giving 3–7 ticks,
 * always including 0 and never exceeding max.
 */
export function yTickValues(max) {
  if (!(max > 0)) return [0];
  const targetCount = 5;
  const rawStep = max / targetCount;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => max / s <= targetCount + 2) ?? 10 * pow;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Round max up to the next tick boundary so the top of the chart is a
 * labelled line rather than an arbitrary value.
 */
export function niceMax(max) {
  if (!(max > 0)) return 1;
  const ticks = yTickValues(max);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  return Math.ceil(max / step) * step;
}
