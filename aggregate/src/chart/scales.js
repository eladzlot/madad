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
 * Time x scale over an explicit [domainStart, domainEnd] onto
 * [rangeStart, rangeEnd] (LTR — older on the left, D-10).
 */
export function timeScale([domainStart, domainEnd], rangeStart, rangeEnd) {
  const min = domainStart.getTime();
  const max = domainEnd.getTime();
  if (max === min) return () => rangeStart;
  return (d) => rangeStart + ((d.getTime() - min) / (max - min)) * (rangeEnd - rangeStart);
}

/**
 * X-axis time domain: real session span, padded so the axis always covers
 * at least `minSlots` session-intervals (AGGREGATE_SPEC §5.4 as revised —
 * D-13). With fewer sessions than that, the points cluster left and the
 * empty right side reads as "future"; with enough sessions the domain is
 * simply first→last. The slot width is the median observed inter-session
 * interval (robust to one long gap), defaulting to a week when there are
 * not yet two sessions.
 */
export function paddedTimeDomain(dates, minSlots = 5) {
  const WEEK = 7 * 24 * 3600 * 1000;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (dates.length >= minSlots) return [first, last];

  let interval = WEEK;
  if (dates.length >= 2) {
    const gaps = dates.slice(1).map((d, i) => d.getTime() - dates[i].getTime()).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    if (median > 0) interval = median;
  }
  const paddedEnd = first.getTime() + (minSlots - 1) * interval;
  return [first, new Date(Math.max(last.getTime(), paddedEnd))];
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
