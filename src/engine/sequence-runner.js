// Sequence Runner
// See SEQUENCE_SPEC.md for full design rationale.

import { evaluate } from './dsl.js';

// Cache of randomize node → shuffled ids. Keyed by node identity so the same
// node object always produces the same order, even if re-encountered after back().
const _shuffleCache = new WeakMap();

export function createSequenceRunner(sequence) {
  let pending = [...sequence];

  // resolved[i] = { node, pendingBefore }
  // pendingBefore is the snapshot of pending BEFORE resolved[i].node was pulled —
  // i.e. it still contains resolved[i].node (or the if-node that precedes it).
  // Restoring resolved[i].pendingBefore and re-advancing re-yields resolved[i].node.
  const resolved = [];

  // position: index of current node in resolved[]. -1 before first advance().
  let position = -1;

  // replayFrom: the resolved[] index we're trying to replay from.
  // -1 means not replaying. Set by back(), cleared when we diverge or exhaust replay.
  let replayFrom = -1;

  // ── advance(context) ──────────────────────────────────────────────────────

  function advance(context) {
    if (!hasNext()) {
      throw new Error('SequenceRunner: advance() called but no nodes remain');
    }

    const pendingBefore = [...pending];
    const leaf = pullNextLeaf(context);

    if (leaf === null) {
      // All remaining nodes were control-flow that resolved to empty branches
      return null;
    }

    if (replayFrom >= 0 && replayFrom < resolved.length) {
      const expected = resolved[replayFrom].node;
      if (leaf === expected) {
        // Same branch — overwrite in place (pendingBefore may differ slightly but node is same)
        resolved[replayFrom] = { node: leaf, pendingBefore };
        position = replayFrom;
        replayFrom++;
        if (replayFrom >= resolved.length) replayFrom = -1;
        return leaf;
      } else {
        // Branch diverged — truncate from replayFrom onward
        resolved.splice(replayFrom);
        replayFrom = -1;
      }
    }

    resolved.push({ node: leaf, pendingBefore });
    position = resolved.length - 1;
    return leaf;
  }

  function pullNextLeaf(context) {
    while (pending.length > 0) {
      const node = pending.shift();

      if (isIfNode(node)) {
        const branch = evaluate(node.condition, context, 'boolean')
          ? node.then
          : node.else;
        pending.unshift(...branch);
        continue;
      }

      if (isRandomizeNode(node)) {
        if (!_shuffleCache.has(node)) {
          _shuffleCache.set(node, shuffle([...node.ids]));
        }
        pending.unshift(..._shuffleCache.get(node));
        continue;
      }

      return node; // leaf
    }
    return null; // no nodes remain
  }

  // ── back() ────────────────────────────────────────────────────────────────

  function back() {
    if (!canGoBack()) {
      throw new Error('SequenceRunner: back() called but already at first node');
    }
    position--;
    // Restore pending to before the node AFTER the target was resolved.
    // This re-encounters any if-nodes between the target and what follows it,
    // without re-yielding the target itself (it's already current).
    pending = [...resolved[position + 1].pendingBefore];
    replayFrom = position + 1; // compare from the node we just left
    return resolved[position].node;
  }

  // ── interface ─────────────────────────────────────────────────────────────

  function canGoBack() { return position > 0; }

  function hasNext() { return pending.length > 0; }

  function currentNode() { return position >= 0 ? resolved[position].node : null; }

  function resolvedPath() { return resolved.slice(0, position + 1).map(e => e.node); }

  function isSequenceDeterminate() { return !containsIfNode(pending); }

  function remainingCount() {
    if (!isSequenceDeterminate()) return null;
    return countLeaves(pending);
  }

  return { advance, back, canGoBack, hasNext, currentNode, resolvedPath,
           isSequenceDeterminate, remainingCount };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fisher-Yates in-place shuffle. Returns the same array.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isIfNode(n)        { return n != null && n.type === 'if'; }
function isRandomizeNode(n) { return n != null && n.type === 'randomize'; }
function isControlFlow(n)   { return isIfNode(n) || isRandomizeNode(n); }

function containsIfNode(nodes) {
  for (const n of nodes) {
    if (isIfNode(n)) return true;
    if (isRandomizeNode(n) && containsIfNode(n.ids)) return true;
  }
  return false;
}

function countLeaves(nodes) {
  let count = 0;
  for (const n of nodes) {
    if (isRandomizeNode(n)) count += countLeaves(n.ids);
    else if (!isControlFlow(n) && n.type !== 'instructions') count++;
  }
  return count;
}
