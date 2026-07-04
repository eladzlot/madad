// Tests for chart-model.js + scales.js — the pure chart geometry layer.
// Every layout rule the SVG component relies on is pinned here as data.

import { describe, it, expect } from 'vitest';
import { linearScale, timeScale, yTickValues, niceMax } from './scales.js';
import { buildChartModel, DIMS } from './chart-model.js';

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
  it('positions dates proportionally to elapsed time', () => {
    const x = timeScale([D('2026-01-01'), D('2026-01-11')], 0, 100);
    expect(x(D('2026-01-01'))).toBe(0);
    expect(x(D('2026-01-11'))).toBe(100);
    expect(x(D('2026-01-06'))).toBe(50);
  });

  it('anchors a single date at the left edge (future to the right)', () => {
    const x = timeScale([D('2026-01-01')], 40, 100);
    expect(x(D('2026-01-01'))).toBe(40);
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
    expect(m.markers[0].x).toBe(m.plot.x);           // anchored left
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
  it('severity interpretations render one band per range, spanning the y scale', () => {
    const m = model([pt('2026-07-01T10:00:00Z', 12)], { interpretations: PHQ9_INTERP });
    expect(m.bands).toHaveLength(5);
    expect(m.bands[0].label).toBe('מינימלי');
    // Bands tile the plot: total band height ≈ plot height (yMax = niceMax(27) = 30 > 27, so not full)
    const totalH = m.bands.reduce((s, b) => s + b.h, 0);
    expect(totalH).toBeLessThanOrEqual(m.plot.h + 0.001);
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
});

// ── chart model: windowing & pagination ───────────────────────────────────────

describe('buildChartModel — window & pagination', () => {
  const twelve = Array.from({ length: 12 }, (_, i) =>
    pt(`2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`, i));

  it('≤5 sessions: no pagination, all visible', () => {
    const m = model(twelve.slice(0, 5));
    expect(m.pagination).toBeNull();
    expect(m.markers).toHaveLength(5);
  });

  it('default window shows the most recent 5 of 12', () => {
    const m = model(twelve);
    expect(m.markers.map(k => k.total)).toEqual([7, 8, 9, 10, 11]);
    expect(m.pagination).toEqual({ from: 8, to: 12, total: 12, hasOlder: true, hasNewer: false });
  });

  it('offset pages backwards through history', () => {
    const m = model(twelve, { windowOffset: 1 });
    expect(m.markers.map(k => k.total)).toEqual([2, 3, 4, 5, 6]);
    expect(m.pagination).toEqual({ from: 3, to: 7, total: 12, hasOlder: true, hasNewer: true });
  });

  it('oldest page clamps to the start and marks the baseline', () => {
    const m = model(twelve, { windowOffset: 99 });
    expect(m.markers.map(k => k.total)).toEqual([0, 1]);
    expect(m.pagination).toEqual({ from: 1, to: 2, total: 12, hasOlder: false, hasNewer: true });
    expect(m.markers[0].baseline).toBe(true);
  });

  it('baseline is not marked on windows that exclude the first session', () => {
    const m = model(twelve);
    expect(m.markers.every(k => !k.baseline)).toBe(true);
  });

  it('marker geometry stays inside the plot area', () => {
    const m = model(twelve);
    for (const k of m.markers) {
      expect(k.x).toBeGreaterThanOrEqual(m.plot.x);
      expect(k.x).toBeLessThanOrEqual(m.plot.x + m.plot.w);
      expect(k.y).toBeGreaterThanOrEqual(m.plot.y);
      expect(k.y).toBeLessThanOrEqual(m.plot.y + m.plot.h);
    }
  });

  it('uses the default DIMS viewBox', () => {
    const m = model(twelve);
    expect(m.width).toBe(DIMS.width);
    expect(m.height).toBe(DIMS.height);
  });
});
