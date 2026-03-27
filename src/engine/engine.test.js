import { describe, it, expect } from 'vitest';
import { createEngine } from './engine.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const select = (id, text = `Q${id}`) => ({ id, type: 'select', text });
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
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    expect(engine.advance()).toEqual(select('q1'));
  });

  it('returns subsequent items', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance();
    expect(engine.advance()).toEqual(select('q2'));
  });

  it('returns null when complete', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance();
    expect(engine.advance()).toBeNull();
  });

  it('throws if called after complete', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance();
    engine.advance(); // complete
    expect(() => engine.advance()).toThrow('already complete');
  });

  it('advances through instructions without requiring an answer', () => {
    const engine = createEngine(makeQ([instr('i1'), select('q1')]), SESSION_KEY);
    expect(engine.advance()).toEqual(instr('i1'));
    expect(engine.advance()).toEqual(select('q1'));
  });
});

// ─── back() ───────────────────────────────────────────────────────────────────

describe('back()', () => {
  it('throws before any advance', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    expect(() => engine.back()).toThrow();
  });

  it('throws at first item', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance();
    expect(() => engine.back()).toThrow('first item');
  });

  it('returns previous item', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.back()).toEqual(select('q1'));
  });

  it('re-entering after completion returns last item', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance(); engine.advance(); engine.advance(); // complete
    expect(engine.isComplete()).toBe(true);
    expect(engine.back()).toEqual(select('q2'));
    expect(engine.isComplete()).toBe(false);
  });

  it('back through instruction item', () => {
    const engine = createEngine(makeQ([select('q1'), instr('i1'), select('q2')]), SESSION_KEY);
    engine.advance(); engine.advance(); engine.advance();
    engine.back();
    expect(engine.currentItem()).toEqual(instr('i1'));
  });
});

// ─── canGoBack() ──────────────────────────────────────────────────────────────

describe('canGoBack()', () => {
  it('false before any advance', () => {
    expect(createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY).canGoBack()).toBe(false);
  });

  it('false at first item', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance();
    expect(engine.canGoBack()).toBe(false);
  });

  it('true at second item', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.canGoBack()).toBe(true);
  });

  it('true when complete (can re-enter)', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance(); engine.advance();
    expect(engine.canGoBack()).toBe(true);
  });
});

// ─── recordAnswer() ───────────────────────────────────────────────────────────

describe('recordAnswer()', () => {
  it('stores answer', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 2);
    expect(engine.answers()).toEqual({ q1: 2 });
  });

  it('overwrites previous answer', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 1);
    engine.recordAnswer('q1', 3);
    expect(engine.answers().q1).toBe(3);
  });

  it('stores non-numeric values for future item types', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 'some text');
    expect(engine.answers().q1).toBe('some text');
  });

  it('answers are not cleared on back()', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    engine.advance();
    engine.recordAnswer('q1', 2);
    engine.advance();
    engine.back();
    expect(engine.answers().q1).toBe(2);
  });

  it('pre-loaded answers from existingAnswers are available immediately', () => {
    const engine = createEngine(makeQ([select('q1')]), SESSION_KEY, { q1: 3 });
    expect(engine.answers()).toEqual({ q1: 3 });
  });
});

// ─── completion, scoring, alerts ──────────────────────────────────────────────

describe('completion', () => {
  const sumQ = makeQ(
    [select('q1'), select('q2'), select('q3')],
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
    const engine = createEngine(makeQ([select('q1'), select('q2')]), SESSION_KEY);
    expect(engine.progress().current).toBe(0);
  });

  it('current increments with each advance', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2'), select('q3')]), SESSION_KEY);
    engine.advance();
    expect(engine.progress().current).toBe(1);
    engine.advance();
    expect(engine.progress().current).toBe(2);
  });

  it('total is item count for determinate sequence', () => {
    const engine = createEngine(makeQ([select('q1'), select('q2'), select('q3')]), SESSION_KEY);
    engine.advance();
    expect(engine.progress().total).toBe(3);
  });

  it('total is null for indeterminate sequence', () => {
    const engine = createEngine(
      makeQ([select('q1'), ifNode('item.q1 >= 1', [select('q2')])]),
      SESSION_KEY
    );
    engine.advance();
    engine.recordAnswer('q1', 1);
    // before advancing through if — still indeterminate
    expect(engine.progress().total).toBeNull();
  });

  it('instructions items are not counted in current or total', () => {
    const engine = createEngine(
      makeQ([instr('intro'), select('q1'), select('q2')]),
      SESSION_KEY
    );
    // Before any advance
    expect(engine.progress()).toEqual({ current: 0, total: 2 });
    // Advance through instructions — current stays 0
    engine.advance();
    expect(engine.progress()).toEqual({ current: 0, total: 2 });
    // Advance to q1 — current becomes 1
    engine.advance();
    expect(engine.progress()).toEqual({ current: 1, total: 2 });
    // Advance to q2 — current becomes 2
    engine.advance();
    expect(engine.progress()).toEqual({ current: 2, total: 2 });
  });

  it('instructions mid-sequence are transparent to progress', () => {
    const engine = createEngine(
      makeQ([select('q1'), instr('mid'), select('q2')]),
      SESSION_KEY
    );
    engine.advance(); // q1
    expect(engine.progress()).toEqual({ current: 1, total: 2 });
    engine.advance(); // mid (instructions)
    expect(engine.progress()).toEqual({ current: 1, total: 2 });
    engine.advance(); // q2
    expect(engine.progress()).toEqual({ current: 2, total: 2 });
  });
});

// ─── if-node branching at item level ─────────────────────────────────────────

describe('item-level branching', () => {
  it('takes then branch when condition true', () => {
    const engine = createEngine(
      makeQ([select('q1'), ifNode('item.q1 >= 2', [select('follow')], [])]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 3);
    expect(engine.advance()).toEqual(select('follow'));
  });

  it('skips then branch when condition false', () => {
    const engine = createEngine(
      makeQ([select('q1'), ifNode('item.q1 >= 2', [select('follow')], []), select('end')]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 0);
    expect(engine.advance()).toEqual(select('end'));
  });

  it('re-evaluates branch on back + re-advance', () => {
    const engine = createEngine(
      makeQ([select('q1'), ifNode('item.q1 >= 2', [select('follow')], [select('alt')]), select('end')]),
      SESSION_KEY
    );
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); // follow
    engine.back();    // → q1
    engine.recordAnswer('q1', 0);
    expect(engine.advance()).toEqual(select('alt'));
  });
});

// ─── trailing empty if-node completion (Bug 1.1) ──────────────────────────────

describe('completion via empty trailing if-node', () => {
  // When the last node in a sequence is an if-node whose branch resolves to
  // nothing, runner.advance() returns null. The engine must treat this as
  // normal completion: isComplete(), scoreResult(), and alertResults() must
  // all be set correctly.

  it('isComplete() is true when trailing if-node resolves to empty', () => {
    const q = makeQ(
      [select('q1'), ifNode('item.q1 >= 10', [select('extra')], [])],
      { scoring: { method: 'sum' } }
    );
    const engine = createEngine(q, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 0);
    const result = engine.advance(); // if-node condition false → empty → null
    expect(result).toBeNull();
    expect(engine.isComplete()).toBe(true);
  });

  it('scoreResult() is populated (not null) after empty-branch completion', () => {
    const q = makeQ(
      [select('q1'), ifNode('item.q1 >= 10', [select('extra')], [])],
      { scoring: { method: 'sum' } }
    );
    const engine = createEngine(q, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 2);
    engine.advance();
    expect(engine.scoreResult()).not.toBeNull();
    expect(engine.scoreResult().total).toBe(2);
  });

  it('alertResults() is populated (not null) after empty-branch completion', () => {
    const q = makeQ(
      [select('q1'), ifNode('item.q1 >= 10', [select('extra')], [])],
      {
        scoring: { method: 'sum' },
        alerts: [{ id: 'low', condition: 'item.q1 >= 1', message: 'Answered' }],
      }
    );
    const engine = createEngine(q, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance();
    expect(engine.alertResults()).not.toBeNull();
    expect(engine.alertResults()).toHaveLength(1);
    expect(engine.alertResults()[0].id).toBe('low');
  });

  it('advance() after empty-branch completion throws (already complete)', () => {
    const q = makeQ(
      [select('q1'), ifNode('item.q1 >= 10', [select('extra')], [])],
      { scoring: { method: 'none' } }
    );
    const engine = createEngine(q, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 0);
    engine.advance(); // completes via empty branch
    expect(() => engine.advance()).toThrow('already complete');
  });

  it('canGoBack() is true after empty-branch completion (re-entry allowed)', () => {
    const q = makeQ(
      [select('q1'), ifNode('item.q1 >= 10', [select('extra')], [])],
      { scoring: { method: 'none' } }
    );
    const engine = createEngine(q, SESSION_KEY);
    engine.advance(); engine.recordAnswer('q1', 0);
    engine.advance();
    expect(engine.canGoBack()).toBe(true);
  });
});
