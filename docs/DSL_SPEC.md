# Sequence & Navigation Specification

**Version:** 1.1  
**Status:** Draft  
**Scope:** Sequence runner, engine navigation, orchestrator navigation, session identity model

---

## 1. Motivation

The assessment system needs to support:
- **Branching** at both the item level (within a questionnaire) and the battery level (between questionnaires), based on answers or scores evaluated at runtime
- **Back navigation** that lets patients revisit and change answers, including answers that affect branch conditions
- **Repetition** of the same questionnaire definition multiple times in a single session (e.g. pre/post), with explicit naming to keep slots independent
- **Randomization** of questionnaire or item order (future — not implemented in v1)

The design must accommodate all of these without requiring a rewrite when new capabilities are added.

---

## 2. Session Key Model

Every questionnaire slot in a session is identified by a **session key** — the string used to store and retrieve that slot's answers, scores, and alerts from session state.

### 2.1 Default: questionnaireId as session key

By default, a battery node uses the questionnaire's own ID as its session key:

```json
{ "questionnaireId": "phq9" }
```

Session key → `"phq9"`. Answers stored at `session.answers["phq9"]`.

### 2.2 Explicit instanceId

When the same questionnaire definition is used more than once, each occurrence must declare a unique `instanceId`:

```json
{ "questionnaireId": "phq9", "instanceId": "phq9_pre" }
{ "questionnaireId": "phq9", "instanceId": "phq9_post" }
```

Session keys → `"phq9_pre"` and `"phq9_post"`. These are fully independent slots.

The `instanceId` follows the same ID pattern as all other IDs: `^[a-zA-Z0-9][a-zA-Z0-9_]*$`.

### 2.3 Session key resolution

The session key for a battery leaf node is always:

```js
node.instanceId ?? node.questionnaireId
```

### 2.4 Duplicate session key validation

The config loader validates that all session keys within a battery are unique at load time. If the same questionnaire ID appears more than once without explicit `instanceId` values — or if two nodes produce the same resolved session key — the loader throws a descriptive error.

This is a post-AJV validation step (AJV cannot enforce cross-node uniqueness).

### 2.5 DSL references

Battery-level DSL conditions reference session keys directly:

```
score.phq9_pre >= 10
score.phq9_post < score.phq9_pre
```

No aliasing or indirection — authors write the session key they defined.

---

## 3. Session State

```js
{
  answers: {
    [sessionKey]: { [itemId]: number }
  },
  scores: {
    [sessionKey]: { total: number | null, subscales: {}, category: string | null }
  },
  alerts: {
    [sessionKey]: Alert[]
  },
}
```

**Orphaned answers** — when a patient goes back past a branch point and re-routes, some session keys may no longer be in the active resolved path. Their data remains in session state **completely unchanged** — answers, scores, and alerts are all preserved. If the patient re-routes back onto the same questionnaire, their previous answers are still there and the engine resumes from where they left off. Orphaned slots are excluded from the results screen and PDF by checking against the current resolved path at render time. The runner, engine, and orchestrator **never** clear answers or scores.

---

## 4. Sequence Runner

The sequence runner is a shared, context-agnostic module used by both the orchestrator (battery level) and the engine (item level). It contains all control-flow resolution logic.

### 4.1 Responsibilities

- Walk a sequence of nodes, yielding resolved leaf nodes one at a time
- Resolve `if` nodes lazily at the moment `advance()` reaches them
- Maintain a **resolved path** — the ordered list of leaf nodes yielded so far
- Support back navigation by tracking current position in the resolved path
- On re-advance, replay already-resolved path entries where the path is still valid; re-evaluate from the point of divergence if a branch resolves differently

### 4.2 What the Runner Does NOT Do

- Does not evaluate scoring, alerts, or answers
- Does not construct or validate DSL contexts
- Does not clear or modify session state
- Does not know whether it operates at battery or item level

### 4.3 Interface

```js
const runner = createSequenceRunner(sequence);

runner.advance(context)        // → leaf node; throws if no nodes remain
runner.back()                  // → leaf node; throws if at first node
runner.canGoBack()             // → boolean
runner.hasNext()               // → boolean
runner.currentNode()           // → leaf node | null (null before first advance)
runner.resolvedPath()          // → readonly array of leaf nodes yielded so far
runner.isSequenceDeterminate() // → boolean (no pending if nodes)
runner.remainingCount()        // → number | null
```

### 4.4 Internal State

```
sequence:      [ ...original nodes, unchanged ]
pending:       [ ...nodes not yet reached ]
resolvedPath:  [ leaf, leaf, leaf, ... ]
position:      integer  // index of current node in resolvedPath; -1 before first advance
```

`pending` is initialized to a copy of `sequence`. As control-flow nodes are resolved, their branches are spliced into `pending` in place.

### 4.5 Internal state

Each entry in `resolvedPath` stores both the resolved leaf node and a `pendingBefore` snapshot — the state of `pending` captured immediately before that leaf was pulled. This snapshot always includes the leaf itself (and any preceding control-flow nodes), so restoring it and re-advancing will re-yield the same leaf and re-evaluate any `if` nodes before it.

```
resolvedPath[i] = { node: <leaf>, pendingBefore: <snapshot of pending before node was pulled> }
```

A `replayFrom` index (−1 when not replaying) tracks whether the runner is in replay mode after a `back()` call, and which resolved entry it is currently comparing against.

### 4.6 advance(context)

1. Snapshot `pending` as `pendingBefore`.
2. Pull the next leaf from `pending`, resolving control-flow inline:
   - `if` node: evaluate condition, splice matching branch into front of `pending`, repeat.
   - `randomize` node: v1 — throw `NotImplementedError`.
   - Empty `pending`: throw.
3. **If in replay mode** (`replayFrom >= 0`):
   - Compare the leaf against `resolvedPath[replayFrom].node` (by reference).
   - **Match**: overwrite that entry with the new `{ node, pendingBefore }`, set `position = replayFrom`, advance `replayFrom`. If `replayFrom` reaches the end of `resolvedPath`, clear replay mode. Return leaf.
   - **Diverge**: truncate `resolvedPath` from `replayFrom` onward, clear replay mode, fall through to step 4.
4. Append `{ node, pendingBefore }` to `resolvedPath`, set `position` to last index. Return leaf.

"Matches" means the same node object — since nodes come from parsed config, reference equality is correct.

### 4.7 back()

1. If `position <= 0`: throw.
2. Decrement `position`.
3. Restore `pending` to `resolvedPath[position + 1].pendingBefore` — the snapshot taken just before the node we are leaving was resolved. This re-encounters any `if` nodes that sit between the current node and the one we left, without re-yielding the current node itself.
4. Set `replayFrom = position + 1`.
5. Return `resolvedPath[position].node` (the new current node).

**Key invariant**: after `back()`, calling `advance()` moves *forward* from the current node — it does not re-yield the current node. The next `advance()` re-evaluates any control-flow nodes between current and the next leaf.

The resolved path beyond `position` is retained as a replay cache and only truncated by a diverging re-advance (§4.6).

### 4.8 hasNext()

Returns `true` if `pending` is non-empty.

After `back()`, `pending` is set to `resolvedPath[position + 1].pendingBefore`, which always contains at least one reachable node (the one we just left), so `hasNext()` correctly returns `true`.

### 4.9 isSequenceDeterminate() and remainingCount()

`isSequenceDeterminate()` returns `true` if `pending` contains no `if` nodes (recursing into `randomize.ids`).

`remainingCount()` returns `null` if indeterminate. Otherwise returns the count of leaf nodes reachable from `pending` (recursing into `randomize.ids` blocks). After `back()`, `pending` reflects exactly the nodes still to be visited, so no additional adjustment is needed.

---

## 5. Control-Flow Nodes

### 5.1 if node

```json
{
  "type": "if",
  "condition": "<DSL expression>",
  "then": [ /* sequence nodes */ ],
  "else": [ /* sequence nodes */ ]
}
```

- `condition` evaluated against caller-provided context at the moment `advance()` reaches this node
- `then` and `else` are arrays of sequence nodes — may contain further `if` or `randomize` nodes
- `else` may be empty
- No `rewind` flag — re-evaluation on re-advance is always the behavior (§4.5)

### 5.2 randomize node (v1: not implemented)

```json
{
  "type": "randomize",
  "ids": [ /* sequence nodes */ ]
}
```

- `ids` is an array of sequence nodes to shuffle
- Shuffle performed once, at the moment the node is reached; fixed for the session
- Re-advancing after back() does not re-shuffle — the shuffled order is stored in the resolved path
- v1: throws `NotImplementedError`

**Future randomization variants** (not specced, listed for awareness):
- Randomize questionnaire order in battery
- Randomize item order within questionnaire  
- Random assignment to condition (A/B)
- Counterbalancing (Latin square)

---

## 6. Engine (Item-Level Navigation)

The engine manages navigation within a single questionnaire instance.

### 6.1 Responsibilities

- Create a sequence runner from the questionnaire's item array
- Drive `advance(context)` and `back()` on the runner
- Record answers by item ID (never cleared)
- Expose `currentItem`, `canGoBack()`, and progress info to the renderer
- On completion: run scoring and alert evaluation, store results
- Signal the orchestrator when the questionnaire is complete

### 6.2 Item-Level Context

Built fresh on each `advance()` call:

```js
{
  item:     session.answers[sessionKey] ?? {},
  subscale: session.scores[sessionKey]?.subscales ?? {},
}
```

### 6.3 Completion

When `hasNext()` returns false, the engine:
1. Calls `score(questionnaire, answers)` and stores the result
2. Calls `evaluateAlerts(questionnaire, answers, scoreResult)` and stores the results
3. Returns `null` from `advance()` to signal completion to the orchestrator

Scoring and alert results are cleared if the user navigates back into a completed questionnaire and are recomputed when it completes again.

### 6.4 Answer Recording

`recordAnswer(itemId, value)` writes to the engine's internal answer map. Answers are never cleared — not on `back()`, not on re-entry. Instructions items have no `itemId` and require no `recordAnswer` call before `advance()`.

### 6.5 Back Across Questionnaire Boundary

When `back()` is called on the first item of a questionnaire (`runner.canGoBack()` is false), the engine signals the orchestrator to handle cross-boundary back navigation (§7.3).

The orchestrator manages the full session flow at the battery level.

### 7.1 Responsibilities

- Resolve the battery (named or constructed from URL params)
- Create a sequence runner from the battery sequence
- Initialize the engine for each questionnaire instance as it is reached
- On engine completion: score, evaluate alerts, advance battery runner
- Signal session completion when the battery runner's `hasNext()` is false

### 7.2 Battery-Level Context

Built from completed scores, keyed by session key:

```js
{
  score: {
    [sessionKey]: scores[sessionKey].total
  },
  subscale: {
    [sessionKey]: scores[sessionKey].subscales
  },
}
```

Only completed questionnaire instances are included. An `if` condition referencing a score that hasn't been computed yet will throw a `DSLReferenceError`.

### 7.3 Back Navigation Across Questionnaire Boundary

When the engine signals a cross-boundary back:

1. Orchestrator calls `back()` on the battery runner → gets previous questionnaire node
2. Re-initializes the engine for that questionnaire instance, pre-loading existing answers from `session.answers[sessionKey]`
3. Engine restores position to the last item (its `advance()` is called until `hasNext()` is false, then `back()` once to land on the last item)
4. UI resumes from the last item of the previous questionnaire

---

## 8. Progress Tracking

| Value | Source |
|---|---|
| Current item index (1-based) | `runner.position + 1` |
| Total items | `runner.remainingCount() + runner.position + 1` if determinate; `null` if not |
| Back button visible | `engine.canGoBack()` OR cross-boundary back is available |
| Questionnaire name | from config, via current battery node's `questionnaireId` |

---

## 9. v1 Scope

**Implemented in v1:**
- Linear sequences (no control-flow)
- `if` nodes at battery level
- `if` nodes at item level (runner supports; engine may defer)
- Explicit `instanceId` on battery nodes
- Back navigation within a questionnaire
- Back navigation across questionnaire boundary
- Duplicate session key validation at load time

**Not implemented in v1 (runner throws `NotImplementedError`):**
- `randomize` nodes
- Dynamic question content
- Repeated questionnaire without explicit `instanceId`

---

## 10. Open Questions

- **Orphaned answer pruning** — the results screen and PDF need to know which session keys are currently in the resolved path. The orchestrator should expose a `activeSessionKeys()` method (or equivalent) returning the session keys of the current resolved path in order. This is the rendering layer's filter — not a state mutation.

~~**Cross-boundary back and scores**~~ — resolved: scores are never cleared. When re-entering a questionnaire after going back, existing answers are pre-loaded and the old score remains until the questionnaire completes again and overwrites it. This is correct behavior — see OCI-R example in §3.
