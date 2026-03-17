import { describe, it, expect } from 'vitest';
import { score } from './scoring.js';
import phq9Fixture from '../../tests/fixtures/phq9.json' with { type: 'json' };
import pcl5Fixture from '../../tests/fixtures/pcl5.json' with { type: 'json' };
import ocirFixture from '../../tests/fixtures/ocir.json' with { type: 'json' };

// ─── Fixture-driven tests ─────────────────────────────────────────────────────

function runFixture(fixture) {
  for (const c of fixture.cases) {
    it(c.description, () => {
      const result = score(fixture.questionnaire, c.answers);
      expect(result.total).toBe(c.expected.total);
      expect(result.subscales).toEqual(c.expected.subscales);
      expect(result.category).toBe(c.expected.category);
    });
  }
}

describe('PHQ-9', () => runFixture(phq9Fixture));
describe('PCL-5', () => runFixture(pcl5Fixture));
describe('OCI-R', () => runFixture(ocirFixture));

// ─── Unit tests for scoring mechanics ────────────────────────────────────────

const baseQ = (overrides = {}) => ({
  id: 'test',
  title: 'Test',
  items: [
    { id: '1', type: 'likert', text: 'q1' },
    { id: '2', type: 'likert', text: 'q2' },
    { id: '3', type: 'likert', text: 'q3' },
    { id: 'intro', type: 'instructions', text: 'instructions' },
  ],
  ...overrides,
});

describe('method: none', () => {
  it('returns null total when no scoring spec', () => {
    const result = score(baseQ(), { '1': 2, '2': 3, '3': 1 });
    expect(result.total).toBeNull();
    expect(result.subscales).toEqual({});
    expect(result.category).toBeNull();
  });

  it('returns null total when method is none', () => {
    const result = score(baseQ({ scoring: { method: 'none' } }), { '1': 2 });
    expect(result.total).toBeNull();
  });
});

describe('method: sum', () => {
  const q = baseQ({ scoring: { method: 'sum' } });

  it('sums answerable items', () => {
    expect(score(q, { '1': 2, '2': 3, '3': 1 }).total).toBe(6);
  });

  it('excludes instruction items from sum', () => {
    // instructions item 'intro' has no answer — should not affect total
    expect(score(q, { '1': 1, '2': 1, '3': 1 }).total).toBe(3);
  });

  it('skips missing answers (does not treat as 0)', () => {
    // only item '1' answered — items '2' and '3' skipped
    expect(score(q, { '1': 2 }).total).toBe(2);
  });
});

describe('method: average', () => {
  const q = baseQ({ scoring: { method: 'average' } });

  it('averages answerable items', () => {
    expect(score(q, { '1': 3, '2': 0, '3': 0 }).total).toBeCloseTo(1);
  });

  it('averages only answered items — denominator excludes missing', () => {
    // only item '1' answered — average of [2] = 2, not 2/3
    expect(score(q, { '1': 2 }).total).toBeCloseTo(2);
  });
});

describe('method: subscales', () => {
  const q = baseQ({
    scoring: {
      method: 'subscales',
      subscales: { a: ['1', '2'], b: ['3'] },
    },
  });

  it('computes subscale scores', () => {
    const result = score(q, { '1': 2, '2': 3, '3': 1 });
    expect(result.subscales).toEqual({ a: 5, b: 1 });
  });

  it('total is sum of all subscales', () => {
    const result = score(q, { '1': 2, '2': 3, '3': 1 });
    expect(result.total).toBe(6);
  });

  it('skips missing subscale answers (does not treat as 0)', () => {
    const result = score(q, { '1': 2 });
    expect(result.subscales).toEqual({ a: 2, b: 0 });
    expect(result.total).toBe(2);
  });
});

describe('method: custom', () => {
  it('evaluates customFormula via DSL', () => {
    const q = baseQ({
      scoring: {
        method: 'custom',
        customFormula: 'sum(item.1, item.2) * 2',
      },
    });
    expect(score(q, { '1': 3, '2': 2, '3': 0 }).total).toBe(10);
  });

  it('custom formula can reference subscales', () => {
    const q = baseQ({
      scoring: {
        method: 'custom',
        subscales: { a: ['1', '2'] },
        customFormula: 'subscale.a + item.3',
      },
    });
    expect(score(q, { '1': 3, '2': 2, '3': 4 }).total).toBe(9);
  });
});

describe('reverse scoring', () => {
  it('reverses item value: reversed = maxPerItem - raw', () => {
    const q = baseQ({
      scoring: {
        method: 'sum',
        maxPerItem: 4,
      },
      items: [
        { id: '1', type: 'likert', text: 'q1', reverse: true },
        { id: '2', type: 'likert', text: 'q2' },
        { id: '3', type: 'likert', text: 'q3' },
      ],
    });
    // item 1 raw=1 → reversed=4-1=3; item 2=2; item 3=0 → total=5
    expect(score(q, { '1': 1, '2': 2, '3': 0 }).total).toBe(5);
  });

  it('throws when reverse=true but maxPerItem is missing', () => {
    const q = baseQ({
      scoring: { method: 'sum' },
      items: [{ id: '1', type: 'likert', text: 'q1', reverse: true }],
    });
    expect(() => score(q, { '1': 1 })).toThrow(/maxPerItem/);
  });
});

describe('item weight', () => {
  it('multiplies item value by weight', () => {
    const q = baseQ({
      scoring: { method: 'sum' },
      items: [
        { id: '1', type: 'likert', text: 'q1', weight: 2 },
        { id: '2', type: 'likert', text: 'q2' },
        { id: '3', type: 'likert', text: 'q3' },
      ],
    });
    // item 1: 3×2=6; item 2: 1×1=1; item 3: 0 → total=7
    expect(score(q, { '1': 3, '2': 1, '3': 0 }).total).toBe(7);
  });

  it('combines reverse and weight correctly', () => {
    const q = baseQ({
      scoring: { method: 'sum', maxPerItem: 4 },
      items: [
        { id: '1', type: 'likert', text: 'q1', reverse: true, weight: 2 },
        { id: '2', type: 'likert', text: 'q2' },
        { id: '3', type: 'likert', text: 'q3' },
      ],
    });
    // item 1: raw=1 → reversed=3 → ×2=6; item 2=1; item 3=0 → total=7
    expect(score(q, { '1': 1, '2': 1, '3': 0 }).total).toBe(7);
  });
});

describe('binary items', () => {
  it('includes binary items in sum', () => {
    const q = {
      id: 'test', title: 'Test',
      items: [
        { id: '1', type: 'binary', text: 'yes/no' },
        { id: '2', type: 'likert', text: 'q2' },
      ],
      scoring: { method: 'sum' },
    };
    expect(score(q, { '1': 1, '2': 2 }).total).toBe(3);
  });
});

describe('interpretations', () => {
  const q = baseQ({
    scoring: { method: 'sum' },
    interpretations: {
      target: 'total',
      ranges: [
        { min: 0, max: 3,  label: 'low' },
        { min: 4, max: 7,  label: 'medium' },
        { min: 8, max: 12, label: 'high' },
      ],
    },
  });

  it('returns correct category label', () => {
    expect(score(q, { '1': 2, '2': 2, '3': 2 }).category).toBe('medium');
  });

  it('returns null when score is out of all ranges', () => {
    // ranges top out at 12; add a weight to push total above that
    const qHigh = baseQ({
      scoring: { method: 'sum' },
      items: [
        { id: '1', type: 'likert', text: 'q1', weight: 10 },
        { id: '2', type: 'likert', text: 'q2' },
        { id: '3', type: 'likert', text: 'q3' },
      ],
      interpretations: {
        target: 'total',
        ranges: [
          { min: 0, max: 3,  label: 'low' },
          { min: 4, max: 7,  label: 'medium' },
          { min: 8, max: 12, label: 'high' },
        ],
      },
    });
    // total = 3×10 + 0 + 0 = 30, above all ranges
    expect(score(qHigh, { '1': 3, '2': 0, '3': 0 }).category).toBeNull();
  });

  it('returns null when no interpretations defined', () => {
    const q2 = baseQ({ scoring: { method: 'sum' } });
    expect(score(q2, { '1': 1 }).category).toBeNull();
  });

  it('targets subscale when target is a subscale id', () => {
    const q2 = baseQ({
      scoring: {
        method: 'subscales',
        subscales: { a: ['1', '2'], b: ['3'] },
      },
      interpretations: {
        target: 'a',
        ranges: [{ min: 0, max: 3, label: 'low-a' }, { min: 4, max: 6, label: 'high-a' }],
      },
    });
    // subscale a = 2+3=5 → high-a
    expect(score(q2, { '1': 2, '2': 3, '3': 0 }).category).toBe('high-a');
  });
});

// ── slider items ──────────────────────────────────────────────────────────────

describe('slider items contribute to scoring like likert', () => {
  const sliderQ = {
    id: 'pain_q',
    items: [
      { id: 'pain', type: 'slider', text: 'דרגת הכאב', min: 0, max: 10 },
      { id: 'mood', type: 'slider', text: 'מצב הרוח', min: 0, max: 10 },
    ],
    scoring: { method: 'sum' },
  };

  it('sums slider answers into total', () => {
    expect(score(sliderQ, { pain: 7, mood: 3 }).total).toBe(10);
  });

  it('skips unanswered slider items', () => {
    expect(score(sliderQ, { pain: 5 }).total).toBe(5);
  });

  it('slider with reverse scoring', () => {
    const q = {
      ...sliderQ,
      items: [{ id: 'pain', type: 'slider', text: 'כאב', min: 0, max: 10, reverse: true }],
      scoring: { method: 'sum', maxPerItem: 10 },
    };
    // reverse: 10 - 3 = 7
    expect(score(q, { pain: 3 }).total).toBe(7);
  });

  it('mixed slider and likert items are both summed', () => {
    const q = {
      id: 'mixed',
      items: [
        { id: 's1', type: 'slider', text: 'slider', min: 0, max: 10 },
        { id: 'l1', type: 'likert', text: 'likert',
          options: [{ label: 'a', value: 0 }, { label: 'b', value: 3 }] },
      ],
      scoring: { method: 'sum' },
    };
    expect(score(q, { s1: 4, l1: 3 }).total).toBe(7);
  });

  it('text items in same questionnaire are excluded from sum', () => {
    const q = {
      id: 'mixed2',
      items: [
        { id: 's1', type: 'slider', text: 'slider', min: 0, max: 10 },
        { id: 'notes', type: 'text', text: 'הערות' },
      ],
      scoring: { method: 'sum' },
    };
    expect(score(q, { s1: 5, notes: 'some text' }).total).toBe(5);
  });
});
