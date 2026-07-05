// Tests for heatmap-model.js — the per-item change map.

import { describe, it, expect } from 'vitest';
import { buildHeatmapModel, COMPACT_THRESHOLD } from './heatmap-model.js';
import { SEVERITY_RAMP } from './chart-model.js';

const utcFormat = (d, { withYear = false } = {}) => {
  const label = `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
  return withYear ? `${label}.${String(d.getUTCFullYear()).slice(2)}` : label;
};

const QUESTIONNAIRE = {
  id: 'phq9',
  defaultOptionSetId: 'freq',
  optionSets: { freq: [{ label: 'a', value: 0 }, { label: 'b', value: 1 }, { label: 'c', value: 3 }] },
  items: [
    { id: 'intro', type: 'instructions', text: 'הוראות' },
    { id: '1', type: 'select', text: 'שאלה ראשונה' },
    { id: '2', type: 'select', text: 'שאלה שנייה' },
    { type: 'if', condition: 'x', then: [{ id: '3', type: 'select', text: 'שאלה מותנית' }] },
    { id: 'notes', type: 'text', text: 'הערות' },
    { id: 'sl', type: 'slider', text: 'סרגל', min: 0, max: 10 },
  ],
};

function pt(iso, answers) {
  return { date: new Date(iso), answers };
}

function model(points, questionnaire = QUESTIONNAIRE) {
  return buildHeatmapModel({ points, questionnaire, formatDate: utcFormat });
}

describe('buildHeatmapModel', () => {
  it('rows follow questionnaire order; columns follow session order', () => {
    const m = model([
      pt('2026-07-01T10:00:00Z', { 2: 1, 1: 3, sl: 5 }),
      pt('2026-07-08T10:00:00Z', { 1: 0, 2: 0, sl: 0 }),
    ]);
    expect(m.columns.map(c => c.label)).toEqual(['1.7', '8.7']);
    expect(m.rows.map(r => r.itemId)).toEqual(['1', '2', 'sl']);
    expect(m.rows[0].text).toBe('שאלה ראשונה');
  });

  it('cell fill encodes value as a fraction of the item max on the severity ramp', () => {
    const m = model([pt('2026-07-01T10:00:00Z', { 1: 3, 2: 0, sl: 5 })]);
    const [r1, r2, rSl] = m.rows;
    expect(r1.cells[0]).toEqual({ value: 3, fill: SEVERITY_RAMP.at(-1) });   // 3/3 → hottest
    expect(r2.cells[0]).toEqual({ value: 0, fill: SEVERITY_RAMP[0] });       // 0/3 → coolest
    expect(rSl.cells[0].value).toBe(5);                                       // 5/10 → middle
    expect(rSl.cells[0].fill).toBe(SEVERITY_RAMP[2]);
  });

  it('items inside if-branches appear when answered, in order', () => {
    const m = model([pt('2026-07-01T10:00:00Z', { 1: 1, 3: 3 })]);
    expect(m.rows.map(r => r.itemId)).toEqual(['1', '3']);
    expect(m.rows[1].text).toBe('שאלה מותנית');
  });

  it('unanswered sessions leave null cells; never-answered items drop out', () => {
    const m = model([
      pt('2026-07-01T10:00:00Z', { 1: 2 }),
      pt('2026-07-08T10:00:00Z', { 1: 1, 2: 1 }),
    ]);
    const r2 = m.rows.find(r => r.itemId === '2');
    expect(r2.cells).toEqual([null, expect.objectContaining({ value: 1 })]);
    expect(m.rows.find(r => r.itemId === 'sl')).toBeUndefined();
  });

  it('non-numeric answers (text, multiselect arrays) are skipped', () => {
    const m = model([pt('2026-07-01T10:00:00Z', { 1: 1, notes: 'טקסט חופשי' })]);
    expect(m.rows.map(r => r.itemId)).toEqual(['1']);
  });

  it('instructions items never appear', () => {
    const m = model([pt('2026-07-01T10:00:00Z', { intro: 0, 1: 1 })]);
    expect(m.rows.map(r => r.itemId)).toEqual(['1']);
  });

  it('empty input yields an empty model', () => {
    expect(model([])).toEqual({ compact: false, columns: [], rows: [] });
  });
});

describe('buildHeatmapModel — compact mode', () => {
  const weekly = (n) => Array.from({ length: n }, (_, i) =>
    pt(new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString(), { 1: i % 4 }));

  it(`stays regular up to ${COMPACT_THRESHOLD} sessions — every column labelled`, () => {
    const m = model(weekly(COMPACT_THRESHOLD));
    expect(m.compact).toBe(false);
    expect(m.columns.every(c => c.displayLabel === c.label)).toBe(true);
  });

  it('flips to compact past the threshold and thins the header labels', () => {
    const m = model(weekly(20));
    expect(m.compact).toBe(true);
    const shown = m.columns.filter(c => c.displayLabel !== '');
    expect(shown.length).toBeLessThan(20);
    expect(shown.length).toBeGreaterThanOrEqual(6);
  });

  it('the newest column always keeps its label', () => {
    for (const n of [13, 20, 52]) {
      const m = model(weekly(n));
      expect(m.columns.at(-1).displayLabel).toBe(m.columns.at(-1).label);
    }
  });

  it('full labels survive on every column for tooltips', () => {
    const m = model(weekly(20));
    expect(m.columns.every(c => c.label.length > 0)).toBe(true);
  });

  it('a year of weekly sessions still yields one cell per session', () => {
    const m = model(weekly(52));
    expect(m.columns).toHaveLength(52);
    expect(m.rows[0].cells).toHaveLength(52);
  });
});
