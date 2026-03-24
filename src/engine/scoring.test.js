import { describe, it, expect } from 'vitest';
import { score } from './scoring.js';
import phq9Fixture from '../../tests/fixtures/phq9.json' with { type: 'json' };
import pcl5Fixture from '../../tests/fixtures/pcl5.json' with { type: 'json' };
import ocirFixture from '../../tests/fixtures/ocir.json' with { type: 'json' };
import top3Fixture from '../../tests/fixtures/top3.json' with { type: 'json' };

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
describe('top3 (3-problem questionnaire)', () => runFixture(top3Fixture));

// ─── Unit tests for scoring mechanics ────────────────────────────────────────

const baseQ = (overrides = {}) => ({
  id: 'test',
  title: 'Test',
  items: [
    { id: '1', type: 'select', text: 'q1' },
    { id: '2', type: 'select', text: 'q2' },
    { id: '3', type: 'select', text: 'q3' },
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


describe('scoring.exclude', () => {
  it('excluded item is not counted in sum', () => {
    const q = baseQ({
      scoring: { method: 'sum', exclude: ['1'] },
    });
    // item '1' answered as 5 but excluded — only '2' and '3' count
    expect(score(q, { '1': 5, '2': 2, '3': 1 }).total).toBe(3);
  });

  it('excluded item does not affect average denominator', () => {
    const q = baseQ({
      scoring: { method: 'average', exclude: ['1'] },
    });
    // item '1'=9 excluded, items '2'=2 and '3'=4 averaged → 3
    expect(score(q, { '1': 9, '2': 2, '3': 4 }).total).toBeCloseTo(3);
  });

  it('excluded item with no answer has no effect', () => {
    const q = baseQ({
      scoring: { method: 'sum', exclude: ['1'] },
    });
    // item '1' not even answered — result same as without it
    expect(score(q, { '2': 2, '3': 1 }).total).toBe(3);
  });

  it('empty exclude array has no effect', () => {
    const q = baseQ({
      scoring: { method: 'sum', exclude: [] },
    });
    expect(score(q, { '1': 1, '2': 2, '3': 3 }).total).toBe(6);
  });

  it('excluded item is still available — answer present in DSL context', () => {
    // This is a scoring test, not a DSL test, but we verify the excluded item
    // answer is not accidentally zeroed out by checking total excludes it
    const q = baseQ({
      scoring: { method: 'sum', exclude: ['1'] },
    });
    const result = score(q, { '1': 99, '2': 1, '3': 1 });
    expect(result.total).toBe(2); // '1' excluded regardless of its value
  });

  it('exclude also applies to subscale scoring — item is excluded everywhere', () => {
    // exclude removes an item from both sum/average totals AND subscale scoring.
    // To exclude an item only from the total, omit it from subscale arrays instead.
    const q = baseQ({
      scoring: {
        method: 'subscales',
        exclude: ['1'],
        subscales: { a: ['1', '2'], b: ['3'] },
      },
    });
    const result = score(q, { '1': 2, '2': 3, '3': 1 });
    expect(result.subscales.a).toBe(3); // '1' excluded — only '2'=3 counts
    expect(result.total).toBe(4);       // subscale a=3, subscale b=1
  });

  it('pc-ptsd5 pattern: exposure gate item excluded, 5 symptom items scored 0-5', () => {
    // Models the PC-PTSD-5: exposure is answered (yes=1) but not scored.
    // Items 1-5 are the symptom items scored 0-5.
    const q = {
      id: 'pc_ptsd5',
      title: 'PC-PTSD-5',
      items: [
        { id: 'exposure', type: 'binary', text: 'Trauma exposure?' },
        { id: '1', type: 'binary', text: 'Symptom 1' },
        { id: '2', type: 'binary', text: 'Symptom 2' },
        { id: '3', type: 'binary', text: 'Symptom 3' },
        { id: '4', type: 'binary', text: 'Symptom 4' },
        { id: '5', type: 'binary', text: 'Symptom 5' },
      ],
      scoring: { method: 'sum', exclude: ['exposure'] },
      interpretations: {
        target: 'total',
        ranges: [
          { min: 0, max: 3, label: 'Low probability' },
          { min: 4, max: 5, label: 'High probability' },
        ],
      },
    };

    // Positive screen: exposure=yes, 4 symptoms present
    const positive = score(q, { exposure: 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 0 });
    expect(positive.total).toBe(4);
    expect(positive.category).toBe('High probability');

    // Negative screen: exposure=yes, only 2 symptoms
    const negative = score(q, { exposure: 1, '1': 1, '2': 1, '3': 0, '4': 0, '5': 0 });
    expect(negative.total).toBe(2);
    expect(negative.category).toBe('Low probability');

    // No exposure: all zeros including exposure
    const noExposure = score(q, { exposure: 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
    expect(noExposure.total).toBe(0);
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

describe('subscaleMethod: mean', () => {
  const q = baseQ({
    scoring: {
      method: 'subscales',
      subscaleMethod: 'mean',
      subscales: { a: ['1', '2'], b: ['3'] },
    },
  });

  it('computes subscale scores as means', () => {
    const result = score(q, { '1': 2, '2': 4, '3': 3 });
    expect(result.subscales).toEqual({ a: 3, b: 3 });
  });

  it('total is sum of subscale means', () => {
    const result = score(q, { '1': 2, '2': 4, '3': 3 });
    expect(result.total).toBe(6);
  });

  it('mean excludes unanswered items from denominator', () => {
    // subscale a: only item 1 answered → mean = 2/1 = 2 (not 2/2)
    const result = score(q, { '1': 2, '3': 3 });
    expect(result.subscales.a).toBe(2);
    expect(result.subscales.b).toBe(3);
  });

  it('mean of fully-unanswered subscale is 0', () => {
    const result = score(q, { '3': 3 });
    expect(result.subscales.a).toBe(0);
  });

  it('defaults to sum when subscaleMethod is absent', () => {
    const qSum = baseQ({
      scoring: {
        method: 'subscales',
        subscales: { a: ['1', '2'] },
      },
    });
    const result = score(qSum, { '1': 2, '2': 4 });
    expect(result.subscales.a).toBe(6);  // sum, not mean (3)
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
        { id: '1', type: 'select', text: 'q1', reverse: true },
        { id: '2', type: 'select', text: 'q2' },
        { id: '3', type: 'select', text: 'q3' },
      ],
    });
    // item 1 raw=1 → reversed=4-1=3; item 2=2; item 3=0 → total=5
    expect(score(q, { '1': 1, '2': 2, '3': 0 }).total).toBe(5);
  });

  it('throws when reverse=true but maxPerItem is missing', () => {
    const q = baseQ({
      scoring: { method: 'sum' },
      items: [{ id: '1', type: 'select', text: 'q1', reverse: true }],
    });
    expect(() => score(q, { '1': 1 })).toThrow(/maxPerItem/);
  });
});

describe('item weight', () => {
  it('multiplies item value by weight', () => {
    const q = baseQ({
      scoring: { method: 'sum' },
      items: [
        { id: '1', type: 'select', text: 'q1', weight: 2 },
        { id: '2', type: 'select', text: 'q2' },
        { id: '3', type: 'select', text: 'q3' },
      ],
    });
    // item 1: 3×2=6; item 2: 1×1=1; item 3: 0 → total=7
    expect(score(q, { '1': 3, '2': 1, '3': 0 }).total).toBe(7);
  });

  it('combines reverse and weight correctly', () => {
    const q = baseQ({
      scoring: { method: 'sum', maxPerItem: 4 },
      items: [
        { id: '1', type: 'select', text: 'q1', reverse: true, weight: 2 },
        { id: '2', type: 'select', text: 'q2' },
        { id: '3', type: 'select', text: 'q3' },
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
        { id: '2', type: 'select', text: 'q2' },
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
        { id: '1', type: 'select', text: 'q1', weight: 10 },
        { id: '2', type: 'select', text: 'q2' },
        { id: '3', type: 'select', text: 'q3' },
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

describe('slider items contribute to scoring like select', () => {
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

  it('mixed slider and select items are both summed', () => {
    const q = {
      id: 'mixed',
      items: [
        { id: 's1', type: 'slider', text: 'slider', min: 0, max: 10 },
        { id: 'l1', type: 'select', text: 'select',
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

// ── totalMethod: sum_of_items ─────────────────────────────────────────────────

describe('scoring.totalMethod = sum_of_items', () => {
  const q = {
    items: [
      { id: 'i1', type: 'select', options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
      { id: 'i2', type: 'select', options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
      { id: 'i3', type: 'select', options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
      { id: 'i4', type: 'select', options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
    ],
    scoring: {
      method: 'subscales',
      subscaleMethod: 'mean',
      totalMethod: 'sum_of_items',
      subscales: { a: ['i1', 'i2'], b: ['i3', 'i4'] },
    },
    alerts: [],
  };
  const answers = { i1: 2, i2: 0, i3: 1, i4: 2 };

  it('total is raw item sum, not sum of means', () => {
    const result = score(q, answers);
    // raw sum: 2+0+1+2 = 5
    // sum of means would be: mean(2,0) + mean(1,2) = 1 + 1.5 = 2.5
    expect(result.total).toBe(5);
  });

  it('subscales are still means', () => {
    const result = score(q, answers);
    expect(result.subscales.a).toBe(1);    // mean(2,0)
    expect(result.subscales.b).toBe(1.5);  // mean(1,2)
  });

  it('without totalMethod defaults to sum of subscale means', () => {
    const qNoTotal = { ...q, scoring: { ...q.scoring, totalMethod: undefined } };
    const result = score(qNoTotal, answers);
    expect(result.total).toBe(2.5); // 1 + 1.5
  });
});

// ── subscale mean rounding in buildScoresLine ─────────────────────────────────
// (tested via report.test.js — coverage here is via scoring.js)
