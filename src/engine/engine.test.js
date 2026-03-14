import { describe, it, expect } from 'vitest';
import { createEngine } from './engine.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const likert = (id, text = `Q${id}`) => ({ id, type: 'likert', text });
const instr  = (id, text = `Instr${id}`) => ({ id, type: 'instructions', text });
const ifNode = (condition, then_, else_ = []) => ({ type: 'if', condition, then: then_, else: else_ });

const makeQ = (items, extras = {}) => ({
  id: 'test_q',
  title: 'Test',
  items,
  scoring: { method: 'none' },
  alerts: [],
  ...extras,
});

const SESSION_KEY = 'test_q';

// ─── Basic navigation ─────────────────────────────────────────────────────────

describe('advance()', () => {
  it('returns first item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    expect(engine.advance()).toEqual(likert('q1'));
  });

  it('returns subsequent items', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance();
    expect(engine.advance()).toEqual(likert('q2'));
  });

  it('returns null when complete', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance();
    expect(engine.advance()).toBeNull();
  });

  it('throws if called after complete', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance();
    engine.advance(); // complete
    expect(() => engine.advance()).toThrow('already complete');
  });

  it('advances through instructions without requiring an answer', () => {
    const engine = createEngine(makeQ([instr('i1'), likert('q1')]), SESSION_KEY);
    expect(engine.advance()).toEqual(instr('i1'));
    expect(engine.advance()).toEqual(likert('q1'));
  });
});

// ─── back() ───────────────────────────────────────────────────────────────────

describe('back()', () => {
  it('throws before any advance', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    expect(() => engine.back()).toThrow();
  });

  it('throws at first item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance();
    expect(() => engine.back()).toThrow('first item');
  });

  it('returns previous item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.back()).toEqual(likert('q1'));
  });

  it('re-entering after completion returns last item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance(); engine.advance(); engine.advance(); // complete
    expect(engine.isComplete()).toBe(true);
    expect(engine.back()).toEqual(likert('q2'));
    expect(engine.isComplete()).toBe(false);
  });

  it('back through instruction item', () => {
    const engine = createEngine(makeQ([likert('q1'), instr('i1'), likert('q2')]), SESSION_KEY);
    engine.advance(); engine.advance(); engine.advance();
    engine.back();
    expect(engine.currentItem()).toEqual(instr('i1'));
  });
});

// ─── canGoBack() ──────────────────────────────────────────────────────────────

describe('canGoBack()', () => {
  it('false before any advance', () => {
    expect(createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY).canGoBack()).toBe(false);
  });

  it('false at first item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance();
    expect(engine.canGoBack()).toBe(false);
  });

  it('true at second item', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.canGoBack()).toBe(true);
  });

  it('true when complete (can re-enter)', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.canGoBack()).toBe(true);
  });
});

// ─── recordAnswer() ───────────────────────────────────────────────────────────

describe('recordAnswer()', () => {
  it('stores answer', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 2);
    expect(engine.answers()).toEqual({ q1: 2 });
  });

  it('overwrites previous answer', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 1);
    engine.recordAnswer('q1', 3);
    expect(engine.answers().q1).toBe(3);
  });

  it('stores non-numeric values for future item types', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 'some text');
    expect(engine.answers().q1).toBe('some text');
  });

  it('answers are not cleared on back()', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 2);
    engine.advance();
    engine.back();
    expect(engine.answers().q1).toBe(2);
  });

  it('pre-loaded answers from existingAnswers are available immediately', () => {
    const engine = createEngine(makeQ([likert('q1')]), SESSION_KEY, { q1: 3 });
    expect(engine.answers()).toEqual({ q1: 3 });
  });
});

// ─── completion, scoring, alerts ──────────────────────────────────────────────

describe('completion', () => {
  const sumQ = makeQ(
    [likert('q1'), likert('q2'), likert('q3')],
    {
      scoring: { method: 'sum' },
      alerts: [{ id: 'high', condition: 'item.q1 >= 3', message: 'High q1' }],
    }
  );

  it('isComplete false initially', () => {
    expect(createEngine(sumQ, SESSION_KEY).isComplete()).toBe(false);
  });

  it('isComplete true after last advance', () => {
    const engine = createEngine(sumQ, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 1);
    engine.advance(); engine.recordAnswer('q2', 2);
    engine.advance(); engine.recordAnswer('q3', 0);
    engine.advance(); // complete
    expect(engine.isComplete()).toBe(true);
  });

  it('scoreResult null before complete', () => {
    expect(createEngine(sumQ, SESSION_KEY).scoreResult()).toBeNull();
  });

  it('scoreResult populated after complete', () => {
    const engine = createEngine(sumQ, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 1);
    engine.advance(); engine.recordAnswer('q2', 2);
    engine.advance(); engine.recordAnswer('q3', 3);
    engine.advance();
    expect(engine.scoreResult().total).toBe(6);
  });

  it('alertResults null before complete', () => {
    expect(createEngine(sumQ, SESSION_KEY).alertResults()).toBeNull();
  });

  it('alertResults populated after complete', () => {
    const engine = createEngine(sumQ, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); engine.recordAnswer('q2', 0);
    engine.advance(); engine.recordAnswer('q3', 0);
    engine.advance();
    expect(engine.alertResults()).toHaveLength(1);
    expect(engine.alertResults()[0].id).toBe('high');
  });

  it('scoreResult cleared on re-entry after back', () => {
    const engine = createEngine(sumQ, SESSION_KEY);
    engine.advance(); engine.advance(); engine.advance(); engine.advance();
    engine.back(); // re-enter
    expect(engine.scoreResult()).toBeNull();
    expect(engine.alertResults()).toBeNull();
  });
});

// ─── progress() ───────────────────────────────────────────────────────────────

describe('progress()', () => {
  it('current is 0 before any advance', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2')]), SESSION_KEY);
    expect(engine.progress().current).toBe(0);
  });

  it('current increments with each advance', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2'), likert('q3')]), SESSION_KEY);
    engine.advance();
    expect(engine.progress().current).toBe(1);
    engine.advance();
    expect(engine.progress().current).toBe(2);
  });

  it('total is item count for determinate sequence', () => {
    const engine = createEngine(makeQ([likert('q1'), likert('q2'), likert('q3')]), SESSION_KEY);
    engine.advance();
    expect(engine.progress().total).toBe(3);
  });

  it('total is null for indeterminate sequence', () => {
    const engine = createEngine(
      makeQ([likert('q1'), ifNode('item.q1 >= 1', [likert('q2')])]),
      SESSION_KEY
    );
    engine.advance();
    engine.recordAnswer('q1', 1);
    // before advancing through if — still indeterminate
    expect(engine.progress().total).toBeNull();
  });
});

// ─── if-node branching at item level ─────────────────────────────────────────

describe('item-level branching', () => {
  it('takes then branch when condition true', () => {
    const engine = createEngine(
      makeQ([likert('q1'), ifNode('item.q1 >= 2', [likert('follow')], [])]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 3);
    expect(engine.advance()).toEqual(likert('follow'));
  });

  it('skips then branch when condition false', () => {
    const engine = createEngine(
      makeQ([likert('q1'), ifNode('item.q1 >= 2', [likert('follow')], []), likert('end')]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 0);
    expect(engine.advance()).toEqual(likert('end'));
  });

  it('re-evaluates branch on back + re-advance', () => {
    const engine = createEngine(
      makeQ([likert('q1'), ifNode('item.q1 >= 2', [likert('follow')], [likert('alt')]), likert('end')]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); // follow
    engine.back();    // → q1
    engine.recordAnswer('q1', 0);
    expect(engine.advance()).toEqual(likert('alt'));
  });
});
