import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSequenceRunner } from './sequence-runner.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const q    = (id) => ({ questionnaireId: id });
const item = (id) => ({ id, type: 'select', text: `item ${id}` });
const ifNode = (condition, then_, else_) =>
  ({ type: 'if', condition, then: then_, else: else_ });

const ctx     = {};
const itemCtx = (answers) => ({ item: answers, subscale: {} });
const scoreCtx = (scores) => ({ score: scores, subscale: {} });

const drainAll = (runner, context = ctx) => {
  const result = [];
  while (runner.hasNext()) result.push(runner.advance(context));
  return result;
};

// ─── Linear sequence ──────────────────────────────────────────────────────────

describe('linear sequence', () => {
  it('advances through leaf nodes in order', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    expect(runner.advance(ctx)).toEqual(q('a'));
    expect(runner.advance(ctx)).toEqual(q('b'));
    expect(runner.advance(ctx)).toEqual(q('c'));
  });

  it('hasNext returns true while nodes remain', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    expect(runner.hasNext()).toBe(true);
    runner.advance(ctx);
    expect(runner.hasNext()).toBe(true);
    runner.advance(ctx);
    expect(runner.hasNext()).toBe(false);
  });

  it('throws when advance called on empty sequence', () => {
    expect(() => createSequenceRunner([]).advance(ctx)).toThrow();
  });

  it('throws when advance called after exhausted', () => {
    const runner = createSequenceRunner([q('a')]);
    runner.advance(ctx);
    expect(() => runner.advance(ctx)).toThrow();
  });

  it('returns null when all remaining nodes are if nodes that resolve to empty', () => {
    const runner = createSequenceRunner([
      ifNode('item.x >= 1', [q('a')], []),
    ]);
    // x=0 → else branch is empty → no leaves → null
    expect(runner.advance({ item: { x: 0 }, subscale: {} })).toBeNull();
  });

  it('works with item-level leaf nodes', () => {
    const runner = createSequenceRunner([item('1'), item('2')]);
    expect(runner.advance(ctx).id).toBe('1');
    expect(runner.advance(ctx).id).toBe('2');
  });

  it('currentNode() is null before first advance', () => {
    expect(createSequenceRunner([q('a')]).currentNode()).toBeNull();
  });

  it('currentNode() returns current leaf after advance', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx);
    expect(runner.currentNode()).toEqual(q('a'));
    runner.advance(ctx);
    expect(runner.currentNode()).toEqual(q('b'));
  });

  it('resolvedPath() reflects advance history', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx);
    runner.advance(ctx);
    expect(runner.resolvedPath()).toEqual([q('a'), q('b')]);
  });
});

// ─── if nodes ─────────────────────────────────────────────────────────────────

describe('if nodes', () => {
  it('splices then branch when condition is true', () => {
    const runner = createSequenceRunner([ifNode('item.x >= 1', [q('yes')], [q('no')])]);
    expect(runner.advance(itemCtx({ x: 2 }))).toEqual(q('yes'));
  });

  it('splices else branch when condition is false', () => {
    const runner = createSequenceRunner([ifNode('item.x >= 1', [q('yes')], [q('no')])]);
    expect(runner.advance(itemCtx({ x: 0 }))).toEqual(q('no'));
  });

  it('handles empty else branch', () => {
    const runner = createSequenceRunner([
      ifNode('item.x >= 1', [q('yes')], []),
      q('after'),
    ]);
    expect(drainAll(runner, itemCtx({ x: 0 }))).toEqual([q('after')]);
  });

  it('spliced branch continues with remaining sequence', () => {
    const runner = createSequenceRunner([
      q('first'),
      ifNode('item.x >= 1', [q('yes')], [q('no')]),
      q('last'),
    ]);
    expect(drainAll(runner, itemCtx({ x: 1 }))).toEqual([q('first'), q('yes'), q('last')]);
  });

  it('handles nested if nodes', () => {
    const runner = createSequenceRunner([
      ifNode('item.x >= 1',
        [ifNode('item.x >= 2', [q('high')], [q('mid')])],
        [q('low')]
      ),
    ]);
    expect(runner.advance(itemCtx({ x: 3 }))).toEqual(q('high'));
    const runner2 = createSequenceRunner([
      ifNode('item.x >= 1',
        [ifNode('item.x >= 2', [q('high')], [q('mid')])],
        [q('low')]
      ),
    ]);
    expect(runner2.advance(itemCtx({ x: 1 }))).toEqual(q('mid'));
  });

  it('handles battery-level score conditions', () => {
    const runner = createSequenceRunner([
      ifNode('score.phq9 >= 10', [q('pcl5')], []),
      q('ocir'),
    ]);
    expect(drainAll(runner, scoreCtx({ phq9: 15 }))).toEqual([q('pcl5'), q('ocir')]);
  });

  it('skips then branch when score is below threshold', () => {
    const runner = createSequenceRunner([
      ifNode('score.phq9 >= 10', [q('pcl5')], []),
      q('ocir'),
    ]);
    expect(drainAll(runner, scoreCtx({ phq9: 5 }))).toEqual([q('ocir')]);
  });
});

// ─── randomize ────────────────────────────────────────────────────────────────

describe('randomize nodes', () => {
  afterEach(() => vi.restoreAllMocks());

  const rnd = (ids) => ({ type: 'randomize', ids });

  it('yields all nodes in the randomize set', () => {
    const runner = createSequenceRunner([rnd([q('a'), q('b'), q('c')])]);
    const result = drainAll(runner);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([q('a'), q('b'), q('c')]));
  });

  it('shuffles using Math.random', () => {
    // Force a known shuffle order: Math.random returns 0 → Fisher-Yates always
    // swaps with index 0, reversing a 2-element array.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const runner = createSequenceRunner([rnd([q('a'), q('b')])]);
    const result = drainAll(runner);
    expect(result).toEqual([q('b'), q('a')]);
  });

  it('different runs may produce different orders', () => {
    // Run 20 times with real Math.random — at least one should differ.
    const orders = new Set();
    for (let i = 0; i < 20; i++) {
      const runner = createSequenceRunner([rnd([q('a'), q('b'), q('c')])]);
      orders.add(drainAll(runner).map(n => n.questionnaireId).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('interleaves correctly with surrounding leaf nodes', () => {
    const runner = createSequenceRunner([q('x'), rnd([q('a'), q('b')]), q('y')]);
    const result = drainAll(runner);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(q('x'));
    expect(result[3]).toEqual(q('y'));
    expect([result[1], result[2]]).toEqual(expect.arrayContaining([q('a'), q('b')]));
  });

  it('back() within randomized set preserves the shuffled order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces [b, a] order
    const runner = createSequenceRunner([rnd([q('a'), q('b')])]);
    runner.advance(ctx);                  // q('b')
    const second = runner.advance(ctx);   // q('a')
    runner.back();                        // back to q('b'), pending = [q('a')]
    expect(runner.advance(ctx)).toEqual(second); // q('a') — same order preserved
  });

  it('back() past the randomize node preserves the original shuffle order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces [b, a] order
    const runner = createSequenceRunner([q('pre'), rnd([q('a'), q('b')])]);
    runner.advance(ctx);               // q('pre')
    const first = runner.advance(ctx); // q('b') — first shuffled node
    runner.advance(ctx);               // q('a')
    runner.back();                     // back to q('b'), pending = [q('a')]
    runner.back();                     // back to q('pre'), pending = [rnd(...)]
    // advance() replays via WeakMap cache — gives q('b') without re-shuffling
    expect(runner.advance(ctx)).toEqual(first); // q('b') — same order
  });

  it('remainingCount counts nodes inside randomize', () => {
    const runner = createSequenceRunner([q('x'), rnd([q('a'), q('b'), q('c')])]);
    expect(runner.remainingCount()).toBe(4); // q('x') + 3 randomized nodes
  });

  it('isSequenceDeterminate is true when randomize has no if nodes inside', () => {
    const runner = createSequenceRunner([rnd([q('a'), q('b')])]);
    expect(runner.isSequenceDeterminate()).toBe(true);
  });

  it('isSequenceDeterminate is false when randomize contains an if node', () => {
    const runner = createSequenceRunner([
      rnd([q('a'), { type: 'if', condition: 'true', then: [q('b')], else: [] }]),
    ]);
    expect(runner.isSequenceDeterminate()).toBe(false);
  });

  it('hasNext() is false after all randomized nodes are consumed', () => {
    const runner = createSequenceRunner([rnd([q('a'), q('b')])]);
    drainAll(runner);
    expect(runner.hasNext()).toBe(false);
  });

  it('empty randomize node yields nothing and runner completes', () => {
    const runner = createSequenceRunner([rnd([])]);
    expect(runner.advance(ctx)).toBeNull();
  });
});

// ─── back() ───────────────────────────────────────────────────────────────────

describe('back()', () => {
  it('throws when called before first advance', () => {
    expect(() => createSequenceRunner([q('a'), q('b')]).back()).toThrow();
  });

  it('throws when called on the first node', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx);
    expect(() => runner.back()).toThrow();
  });

  it('returns the previous leaf node', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx);
    runner.advance(ctx);
    expect(runner.back()).toEqual(q('a'));
  });

  it('re-queues current node so advance returns it again', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx); // a
    runner.advance(ctx); // b
    runner.back();       // → a, b re-queued
    expect(runner.advance(ctx)).toEqual(q('b'));
  });

  it('can back multiple steps', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx);
    runner.advance(ctx);
    runner.advance(ctx);
    runner.back();
    runner.back();
    expect(runner.advance(ctx)).toEqual(q('b'));
  });

  it('hasNext is true after back', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx); // a — pending: [b]
    runner.advance(ctx); // b — pending: []
    runner.back();       // → a, pending restored to [b]
    expect(runner.hasNext()).toBe(true);
  });
});

// ─── canGoBack() ──────────────────────────────────────────────────────────────

describe('canGoBack()', () => {
  it('is false before any advance', () => {
    expect(createSequenceRunner([q('a'), q('b')]).canGoBack()).toBe(false);
  });

  it('is false on the first node', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx);
    expect(runner.canGoBack()).toBe(false);
  });

  it('is true after second advance', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx);
    runner.advance(ctx);
    expect(runner.canGoBack()).toBe(true);
  });

  it('is false again after backing to first node', () => {
    const runner = createSequenceRunner([q('a'), q('b')]);
    runner.advance(ctx);
    runner.advance(ctx);
    runner.back();
    expect(runner.canGoBack()).toBe(false);
  });
});

// ─── branch re-evaluation on re-advance ───────────────────────────────────────

describe('branch re-evaluation', () => {
  it('same branch — reuses resolved path entry', () => {
    const runner = createSequenceRunner([
      q('intro'),
      ifNode('item.x >= 1', [q('yes')], [q('no')]),
      q('outro'),
    ]);
    runner.advance(itemCtx({ x: 1 })); // intro
    runner.advance(itemCtx({ x: 1 })); // yes
    runner.back();                      // → intro
    // advance() moves forward from intro, re-evaluating the if node
    expect(runner.advance(itemCtx({ x: 1 }))).toEqual(q('yes'));
  });

  it('different branch — truncates resolved path and takes new branch', () => {
    const runner = createSequenceRunner([
      q('intro'),
      ifNode('item.x >= 1', [q('yes')], [q('no')]),
      q('outro'),
    ]);
    runner.advance(itemCtx({ x: 1 })); // intro
    runner.advance(itemCtx({ x: 1 })); // yes (resolved path: [intro, yes])
    runner.back();                      // → intro
    // x=0 now — takes else branch, resolved path truncated
    expect(runner.advance(itemCtx({ x: 0 }))).toEqual(q('no'));
  });

  it('sequence continues correctly after branch change', () => {
    const runner = createSequenceRunner([
      q('intro'),
      ifNode('item.x >= 1', [q('yes')], [q('no')]),
      q('outro'),
    ]);
    runner.advance(itemCtx({ x: 1 })); // intro
    runner.advance(itemCtx({ x: 1 })); // yes
    runner.back();                      // → intro
    runner.advance(itemCtx({ x: 0 })); // no
    expect(runner.advance(itemCtx({ x: 0 }))).toEqual(q('outro'));
    expect(runner.hasNext()).toBe(false);
  });

  it('resolvedPath reflects new branch after divergence', () => {
    const runner = createSequenceRunner([
      q('a'),
      ifNode('item.x >= 1', [q('yes')], [q('no')]),
    ]);
    runner.advance(itemCtx({ x: 1 })); // a
    runner.advance(itemCtx({ x: 1 })); // yes
    runner.back();                      // → a
    runner.advance(itemCtx({ x: 0 })); // no
    expect(runner.resolvedPath()).toEqual([q('a'), q('no')]);
  });

  it('gender question scenario — back, change, re-route', () => {
    // Simulates: intro → gender-if → [male_q or female_q] → outro
    const genderIf = ifNode('item.gender == 0', [q('male_q')], [q('female_q')]);
    const runner = createSequenceRunner([q('intro'), genderIf, q('outro')]);

    runner.advance(itemCtx({ gender: 0 })); // intro
    runner.advance(itemCtx({ gender: 0 })); // male_q
    runner.back();                           // → intro
    // gender now 1 — advance re-evaluates if and takes female branch
    expect(runner.advance(itemCtx({ gender: 1 }))).toEqual(q('female_q'));
    expect(runner.advance(itemCtx({ gender: 1 }))).toEqual(q('outro'));
  });
});

// ─── isSequenceDeterminate() ─────────────────────────────────────────────────

describe('isSequenceDeterminate()', () => {
  it('is true for empty sequence', () => {
    expect(createSequenceRunner([]).isSequenceDeterminate()).toBe(true);
  });

  it('is true for linear sequence', () => {
    expect(createSequenceRunner([q('a'), q('b')]).isSequenceDeterminate()).toBe(true);
  });

  it('is false when if node is pending', () => {
    expect(createSequenceRunner([ifNode('item.x >= 1', [q('a')], [])]).isSequenceDeterminate()).toBe(false);
  });

  it('becomes true once if node is resolved', () => {
    const runner = createSequenceRunner([
      ifNode('item.x >= 1', [q('a')], [q('b')]),
      q('c'),
    ]);
    expect(runner.isSequenceDeterminate()).toBe(false);
    runner.advance(itemCtx({ x: 1 }));
    expect(runner.isSequenceDeterminate()).toBe(true);
  });
});

// ─── remainingCount() ────────────────────────────────────────────────────────

describe('remainingCount()', () => {
  it('returns 0 for empty sequence', () => {
    expect(createSequenceRunner([]).remainingCount()).toBe(0);
  });

  it('counts pending leaf nodes', () => {
    expect(createSequenceRunner([q('a'), q('b'), q('c')]).remainingCount()).toBe(3);
  });

  it('decreases as nodes are consumed', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx);
    expect(runner.remainingCount()).toBe(2);
    runner.advance(ctx);
    expect(runner.remainingCount()).toBe(1);
  });

  it('returns null when if node is pending', () => {
    expect(createSequenceRunner([ifNode('item.x >= 1', [q('a')], [])]).remainingCount()).toBeNull();
  });

  it('includes ahead-of-position resolved nodes in count', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx); // a
    runner.advance(ctx); // b
    runner.advance(ctx); // c — all consumed, pending empty
    runner.back();       // → b, pending restored to [c]
    runner.back();       // → a, pending restored to [b, c]
    expect(runner.remainingCount()).toBe(2);
  });

  it('increases after back()', () => {
    const runner = createSequenceRunner([q('a'), q('b'), q('c')]);
    runner.advance(ctx); // a
    runner.advance(ctx); // b — pending: [c]
    expect(runner.remainingCount()).toBe(1);
    runner.back();       // → a, pending restored to [b, c]
    expect(runner.remainingCount()).toBe(2);
  });

  it('does not count instructions items in the total', () => {
    const instr = { id: 'intro', type: 'instructions', text: 'intro' };
    expect(createSequenceRunner([instr, q('a'), q('b')]).remainingCount()).toBe(2);
  });

  it('instructions consumed mid-sequence do not affect remaining scored count', () => {
    const instr = { id: 'intro', type: 'instructions', text: 'intro' };
    const runner = createSequenceRunner([instr, q('a'), q('b')]);
    runner.advance(ctx); // intro
    expect(runner.remainingCount()).toBe(2);
    runner.advance(ctx); // a
    expect(runner.remainingCount()).toBe(1);
  });
});
