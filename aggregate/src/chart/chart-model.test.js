// Tests for chart-model.js + scales.js — the pure chart geometry layer.
// Every layout rule the SVG component relies on is pinned here as data.

import { describe, it, expect } from 'vitest';
import { linearScale, timeScale, paddedTimeDomain, yTickValues, niceMax } from './scales.js';
import { buildChartModel, DIMS, X_INSET } from './chart-model.js';

// UTC formatter so tests are timezone-independent.
const utcFormat = (d, { withYear = false } = {}) => {
  const label = `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
  return withYear ? `${label}.${String(d.getUTCFullYear()).slice(2)}` : label;
};

const D = (iso) => new Date(iso);

function pt(iso, total, extra = {}) {
  return { date: D(iso), total, ...extra };
}

function model(points, extra = {}) {
  return buildChartModel({ points, formatDate: utcFormat, ...extra });
}

// ── scales ────────────────────────────────────────────────────────────────────

describe('linearScale', () => {
  it('maps 0 to the bottom and max to the top (SVG y grows downward)', () => {
    const y = linearScale(10, 270, 18);
    expect(y(0)).toBe(270);
    expect(y(10)).toBe(18);
    expect(y(5)).toBe(144);
  });
});

describe('timeScale', () => {
  it('positions dates proportionally to elapsed time within the domain', () => {
    const x = timeScale([D('2026-01-01'), D('2026-01-11')], 0, 100);
    expect(x(D('2026-01-01'))).toBe(0);
    expect(x(D('2026-01-11'))).toBe(100);
    expect(x(D('2026-01-06'))).toBe(50);
  });

  it('a degenerate domain anchors at the range start', () => {
    const x = timeScale([D('2026-01-01'), D('2026-01-01')], 40, 100);
    expect(x(D('2026-01-01'))).toBe(40);
  });
});

describe('paddedTimeDomain', () => {
  const WEEK = 7 * 24 * 3600 * 1000;

  it('≥5 sessions: domain is simply first→last', () => {
    const dates = Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i * 7)));
    expect(paddedTimeDomain(dates)).toEqual([dates[0], dates[4]]);
  });

  it('a single session pads 4 default weeks of future', () => {
    const d = D('2026-01-01');
    const [start, end] = paddedTimeDomain([d]);
    expect(start).toBe(d);
    expect(end.getTime() - d.getTime()).toBe(4 * WEEK);
  });

  it('sparse sessions pad using the median observed interval', () => {
    const dates = [D('2026-01-01'), D('2026-01-08')];   // one week apart
    const [, end] = paddedTimeDomain(dates);
    // 5 slots of one week from the first session.
    expect(end.getTime() - dates[0].getTime()).toBe(4 * WEEK);
  });

  it('padding scales with the cadence: 2 sessions always sit in the first of 4 slots', () => {
    const dates = [D('2026-01-01'), D('2026-06-01')];   // 5-month cadence
    const [, end] = paddedTimeDomain(dates);
    const gap = dates[1].getTime() - dates[0].getTime();
    expect(end.getTime() - dates[0].getTime()).toBe(4 * gap);
  });

  it('never truncates the real span when one gap dwarfs the median', () => {
    const dates = [D('2026-01-01'), D('2026-01-08'), D('2026-01-15'), D('2027-01-01')];
    const [, end] = paddedTimeDomain(dates);
    // Median interval is a week → padding would end far before the real
    // last session; the domain must still reach it.
    expect(end).toEqual(dates[3]);
  });
});

describe('yTickValues / niceMax', () => {
  it('produces 0-based ticks with a 1/2/5 step', () => {
    expect(yTickValues(27)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(yTickValues(21)).toEqual([0, 5, 10, 15, 20]);
    expect(yTickValues(10)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('degenerate max still yields a tick', () => {
    expect(yTickValues(0)).toEqual([0]);
    expect(niceMax(0)).toBe(1);
  });

  it('niceMax rounds up to a tick boundary', () => {
    expect(niceMax(27)).toBe(30);
    expect(niceMax(20)).toBe(20);
  });
});

// ── chart model: basics ───────────────────────────────────────────────────────

describe('buildChartModel — basics', () => {
  it('returns an empty model for no points', () => {
    const m = model([]);
    expect(m.empty).toBe(true);
    expect(m.markers).toEqual([]);
    expect(m.linePath).toBeNull();
  });

  it('a single session renders as a real chart: one marker, no line (§5.4)', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)]);
    expect(m.empty).toBe(false);
    expect(m.markers).toHaveLength(1);
    // Anchored left, inset so the marker clears the y-axis labels.
    expect(m.markers[0].x).toBe(m.plot.x + X_INSET);
    expect(m.markers[0].baseline).toBe(true);
    expect(m.linePath).toBeNull();
    expect(m.xTicks).toHaveLength(1);
  });

  it('two points connect with an LTR line (older on the left)', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12), pt('2026-07-08T10:00:00Z', 8)]);
    expect(m.markers[0].date.getTime()).toBeLessThan(m.markers[1].date.getTime());
    expect(m.markers[0].x).toBeLessThan(m.markers[1].x);
    expect(m.linePath).toMatch(/^M /);
    // Improvement (12 → 8) slopes downward: later point has larger SVG y.
    expect(m.markers[1].y).toBeGreaterThan(m.markers[0].y);
  });

  it('x positions reflect real time gaps, not even spacing', () => {
    const m = model([
      pt('2026-01-01T00:00:00Z', 5),
      pt('2026-01-02T00:00:00Z', 5),   // 1 day later
      pt('2026-01-11T00:00:00Z', 5),   // 9 days later
    ]);
    const [a, b, c] = m.markers.map(k => k.x);
    expect(b - a).toBeCloseTo((c - a) / 10, 5);
  });

  it('marks the baseline only on the first uploaded session', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12), pt('2026-07-08T10:00:00Z', 8)]);
    expect(m.markers.map(k => k.baseline)).toEqual([true, false]);
  });

  it('date labels include the year only when points span years', () => {
    const single = model([pt('2026-07-01T10:00:00Z', 1), pt('2026-08-01T10:00:00Z', 2)]);
    expect(single.markers.map(k => k.label)).toEqual(['1.7', '1.8']);
    const spanning = model([pt('2025-12-30T10:00:00Z', 1), pt('2026-01-05T10:00:00Z', 2)]);
    expect(spanning.markers.map(k => k.label)).toEqual(['30.12.25', '5.1.26']);
  });
});

// ── chart model: overlays ─────────────────────────────────────────────────────

const PHQ9_INTERP = {
  target: 'total',
  type: 'severity',
  ranges: [
    { min: 0, max: 4, label: 'מינימלי' },
    { min: 5, max: 9, label: 'קל' },
    { min: 10, max: 14, label: 'בינוני' },
    { min: 15, max: 19, label: 'בינוני-חמור' },
    { min: 20, max: 27, label: 'חמור' },
  ],
};

describe('buildChartModel — overlays', () => {
  it('severity bands tile the entire plot — the top band extends to the axis top', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)], { interpretations: PHQ9_INTERP });
    expect(m.bands).toHaveLength(5);
    expect(m.bands[0].label).toBe('מינימלי');
    // The topmost band reaches the top of the plot even when the axis is
    // nice-rounded above the instrument max (yMax 30 > PHQ-9 max 27).
    const top = m.bands.find(b => b.label === 'חמור');
    expect(top.y).toBeCloseTo(m.plot.y, 5);
    // And the bands jointly cover the full plot height.
    const totalH = m.bands.reduce((s, b) => s + b.h, 0);
    expect(totalH).toBeCloseTo(m.plot.h, 5);
    // Highest band gets the warmest fill, lowest the coolest.
    expect(m.bands[0].fill).not.toBe(m.bands[4].fill);
  });

  it('screening-typed interpretations render no bands', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)], {
      interpretations: { type: 'screening', ranges: [{ min: 0, max: 20, label: 'a' }, { min: 21, max: 72, label: 'b' }] },
    });
    expect(m.bands).toEqual([]);
  });

  it('cutoffs render as lines at their literal values', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)], {
      interpretations: { ranges: [{ min: 0, max: 20, label: 'a' }], cutoffs: [{ value: 21, label: 'סף סינון' }] },
    });
    expect(m.cutoffs).toHaveLength(1);
    expect(m.cutoffs[0].label).toBe('סף סינון');
    // The cutoff sits inside the plot area (y scale includes it).
    expect(m.cutoffs[0].y).toBeGreaterThanOrEqual(m.plot.y);
    expect(m.cutoffs[0].y).toBeLessThanOrEqual(m.plot.y + m.plot.h);
  });

  it('y scale covers observed totals, band maxima, and cutoff values', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 3)], {
      interpretations: { ranges: [{ min: 0, max: 20, label: 'a' }], cutoffs: [{ value: 21 }] },
    });
    // yMax must be ≥ 21 (cutoff), so the top tick is at least that.
    const topTick = Math.max(...m.yTicks.map(t => Number(t.label)));
    expect(topTick).toBeGreaterThanOrEqual(21);
  });

  it('no interpretations → no overlays', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)]);
    expect(m.bands).toEqual([]);
    expect(m.cutoffs).toEqual([]);
  });

  it('band labels anchor inside-right, cutoff labels inside-left', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)], {
      interpretations: {
        type: 'severity',
        ranges: [{ min: 0, max: 20, label: 'a' }],
        cutoffs: [{ value: 10, label: 'סף' }],
      },
    });
    // Anchors are rtl-relative: 'end' extends rightward from x, 'start'
    // extends leftward (the labels render with direction:rtl).
    expect(m.bands[0].labelX).toBe(m.plot.x + m.plot.w - 6);
    expect(m.bands[0].labelAnchor).toBe('start');
    expect(m.cutoffs[0].labelX).toBe(m.plot.x + 6);
    expect(m.cutoffs[0].labelAnchor).toBe('end');
  });

  it('markers carry the point payload the tooltip and detail panel need', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12, {
      subscales: { washing: 2.5 },
      sessionId: 3,
      fileName: 'report.pdf',
      category: 'בינוני',
    })]);
    expect(m.markers[0].subscales).toEqual({ washing: 2.5 });
    expect(m.markers[0].sessionId).toBe(3);
    expect(m.markers[0].fileName).toBe('report.pdf');
    expect(m.markers[0].category).toBe('בינוני');
  });
});

// ── chart model: full series (D-13 — no windowing) ────────────────────────────

describe('buildChartModel — full series', () => {
  const many = (n) => Array.from({ length: n }, (_, i) =>
    pt(new Date(Date.UTC(2026, 0, 1 + i * 7, 10)).toISOString(), i));

  it('every session is always on screen — 12, 30, 52 sessions alike', () => {
    for (const n of [12, 30, 52]) {
      const m = model(many(n));
      expect(m.markers).toHaveLength(n);
      expect(m.linePath).not.toBeNull();
    }
  });

  it('the baseline is always the first session', () => {
    const m = model(many(12));
    expect(m.markers[0].baseline).toBe(true);
    expect(m.markers.slice(1).every(k => !k.baseline)).toBe(true);
  });

  it('sparse histories cluster left: 2 weekly sessions occupy the first of ~4 week-slots', () => {
    const m = model([
      pt('2026-01-01T10:00:00Z', 5),
      pt('2026-01-08T10:00:00Z', 4),
    ]);
    const innerW = m.plot.w - 2 * X_INSET;
    const secondX = m.markers[1].x - (m.plot.x + X_INSET);
    expect(secondX).toBeCloseTo(innerW / 4, 5);   // 1 of 4 intervals — future to the right
  });

  it('dense series thin their date labels, newest always labelled', () => {
    const m = model(many(52));
    expect(m.xTicks.length).toBeLessThanOrEqual(8);
    expect(m.xTicks.at(-1).x).toBe(m.markers.at(-1).x);
  });

  it('≤8 sessions keep a label per session', () => {
    const m = model(many(8));
    expect(m.xTicks).toHaveLength(8);
  });

  it('marker geometry stays inside the plot area even when dense', () => {
    const m = model(many(52));
    for (const k of m.markers) {
      expect(k.x).toBeGreaterThanOrEqual(m.plot.x);
      expect(k.x).toBeLessThanOrEqual(m.plot.x + m.plot.w);
      expect(k.y).toBeGreaterThanOrEqual(m.plot.y);
      expect(k.y).toBeLessThanOrEqual(m.plot.y + m.plot.h);
    }
  });

  it('uses the default DIMS viewBox', () => {
    const m = model(many(12));
    expect(m.width).toBe(DIMS.width);
    expect(m.height).toBe(DIMS.height);
  });
});
