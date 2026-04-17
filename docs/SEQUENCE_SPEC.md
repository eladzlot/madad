# SEQUENCE_SPEC.md
**Status:** Current — derived from `sequence-runner.js`, `engine.js`, `orchestrator.js` and their test files.

---

## 1. Purpose and Scope

The sequence runner (`src/engine/sequence-runner.js`) is a shared, context-agnostic module used by both the orchestrator (battery level) and the engine (item level). It walks an ordered list of nodes, resolves control-flow nodes lazily, and supports backward navigation with correct branch re-evaluation.

**The runner does not know what nodes contain.** It does not know whether it is walking questionnaire references or item definitions. It yields leaf nodes; callers decide what to do with them.

Neither the orchestrator nor the engine implement branching logic. All `if`/`randomize` resolution is delegated to the runner.

---

## 2. Node Types

A sequence is an array of nodes. Every node is either a **leaf node** or a **control-flow node**.

### 2.1 Leaf Nodes

Any node that does not have `type: 'if'` or `type: 'randomize'` is a leaf. The runner yields leaf nodes to callers unchanged and never inspects their contents.

At battery level, leaves are questionnaire references:
```json
{ "questionnaireId": "phq9" }
{ "questionnaireId": "phq9", "instanceId": "phq9_pre" }
```

At item level, leaves are item definitions:
```json
{ "id": "q1", "type": "select", "text": "..." }
{ "id": "i1", "type": "instructions", "text": "..." }
```

### 2.2 `if` Node

```json
{
  "type": "if",
  "condition": "<DSL expression>",
  "then": [ /* zero or more nodes */ ],
  "else": [ /* zero or more nodes */ ]
}
```

When encountered, the runner evaluates the condition using the DSL interpreter with the caller-supplied context. The winning branch's nodes are prepended to the front of the pending queue and the runner immediately continues looking for the next leaf. The `if` node itself is never returned.

Either branch may be empty. If after resolution no leaf remains in the queue, `advance()` returns `null`.

### 2.3 `randomize` Node

```json
{ "type": "randomize", "ids": [ /* nodes */ ] }
```

When encountered, the runner shuffles `ids` using Fisher-Yates (via `Math.random`) and prepends the shuffled nodes to the front of `pending`, then continues looking for the next leaf. The `randomize` node itself is never returned.

**Order stability:** the shuffled order is fixed for the lifetime of the node object. A module-level `WeakMap` caches each `randomize` node's shuffled `ids` on first encounter. Re-encountering the same node object — whether by going back past it or by any other means — always produces the same order. Going back *within* the shuffled set replays the same order via `pendingBefore` snapshots as usual.

**Progress:** `remainingCount()` recurses into `randomize.ids` and returns the correct count. `isSequenceDeterminate()` returns `true` for a `randomize` node whose `ids` contain no `if` nodes — the count is known even though the order is not.

---

## 3. Internal State

The runner maintains three pieces of mutable state:

**`pending`** — array of nodes not yet yielded. Initialised as a shallow copy of the input sequence. Shrinks as nodes are consumed; grows when `if` branches are prepended; is restored to a saved snapshot on `back()`.

**`resolved`** — array of `{ node, pendingBefore }` entries, one per leaf ever yielded in forward order. `pendingBefore` is a snapshot of `pending` taken immediately before that leaf was extracted (so it still contains either the leaf itself or the `if` node that preceded it). This snapshot is the mechanism for `back()`.

**`position`** — index into `resolved` pointing to the current leaf. Starts at `-1` before the first `advance()`.

There is also a transient **`replayFrom`** index used for branch re-evaluation after `back()` (see §5).

---

## 4. Public Interface

```js
const runner = createSequenceRunner(sequence);

runner.advance(context)          // → leaf | null  — throws if hasNext() false
runner.back()                    // → leaf          — throws if position <= 0
runner.canGoBack()               // → boolean
runner.hasNext()                 // → boolean
runner.currentNode()             // → leaf | null
runner.resolvedPath()            // → leaf[]        — from index 0 to position (inclusive)
runner.isSequenceDeterminate()   // → boolean
runner.remainingCount()          // → number | null
```

### `advance(context)`

Throws immediately if `hasNext()` is false.

Calls `pullNextLeaf(context)`, which iterates `pending` consuming control-flow nodes until a leaf is found or the queue empties. Returns `null` if the queue empties without yielding a leaf (all remaining nodes were `if` nodes that resolved to empty branches).

When a leaf is found, the replay optimisation (§5) may update an existing `resolved` entry in place rather than appending a new one.

`context` is provided by the caller on every call. The runner never caches or reuses a context.

### `back()`

Throws if `position <= 0` (already at the first node, or before any advance).

Decrements `position` by one, then restores `pending` from `resolved[position + 1].pendingBefore`. This restore puts the node that was current (now at `position + 1`) back at the front of the queue, so the next `advance()` will re-encounter whatever comes after the new current node, including any `if` nodes between them.

Sets `replayFrom = position + 1`.

Returns the leaf at the new `position`.

### `canGoBack()`

Returns `position > 0`. False before any advance and on the first node; true from the second node onward.

### `hasNext()`

Returns `pending.length > 0`.

### `currentNode()`

Returns `resolved[position].node`, or `null` if `position < 0`.

### `resolvedPath()`

Returns a copy of `resolved[0..position].map(e => e.node)`. Does not include entries beyond `position`.

### `isSequenceDeterminate()`

Returns `true` if `pending` contains no `if` nodes (checked shallowly — nested inside `randomize` nodes is also checked). When true, the total number of remaining nodes is known.

### `remainingCount()`

Returns `null` if `!isSequenceDeterminate()`. Otherwise returns the count of leaf nodes in `pending`, recursing into `randomize.ids` for counting (even though `randomize` throws on advance).

---

## 5. Branch Re-evaluation on Re-advance

After `back()`, `replayFrom` is set. On subsequent `advance()` calls the runner compares each newly-yielded leaf against `resolved[replayFrom]`:

**Same node (identity check `===`):** The branch resolved the same way. The existing `resolved[replayFrom]` entry is overwritten in place (updating its `pendingBefore` snapshot), `position` is set to `replayFrom`, and `replayFrom` increments. When `replayFrom` reaches the end of `resolved`, replay ends and subsequent advances append normally.

**Different node:** The branch diverged — the patient changed an answer that flipped an `if`. `resolved` is truncated from `replayFrom` onward (`resolved.splice(replayFrom)`), `replayFrom` is reset to `-1`, and the new node is appended. From this point the runner is in normal forward mode.

This guarantees:
- Going back without changing anything is efficient (no array growth).
- Going back and changing an answer that affects a branch correctly discards the stale tail.
- The sequence always continues from the correct pending state regardless of which branch was taken.

---

## 6. Engine — Item-Level Use

`createEngine(questionnaire, sessionKey, existingAnswers?)` wraps a sequence runner over `questionnaire.items` with answer storage, scoring, and alert evaluation.

### 6.1 DSL Context

The engine builds the context from its current answer map on every `advance()` call. Subscales are `{}` during the questionnaire because scoring has not run yet:

```js
{ item: { ...answers }, subscale: {} }
```

This means item-level `if` conditions may reference answers to previously-seen items but not subscale values.

### 6.2 Completion

When `runner.hasNext()` is false, `engine.advance()`:
1. Sets `_complete = true`
2. Calls `score(questionnaire, answers)` → stores in `_scoreResult`
3. Calls `evaluateAlerts(questionnaire, answers, _scoreResult)` → stores in `_alertResults`
4. Sets `_current = null`
5. Returns `null`

Returning `null` is the signal for the controller to call `orchestrator.engineComplete()`.

Calling `engine.advance()` after completion throws `'Engine: advance() called but questionnaire is already complete'`.

### 6.3 Re-entry After Completion

`engine.canGoBack()` always returns `true` when `_complete` is true.

When `engine.back()` is called on a completed engine, it does **not** call `runner.back()`. Instead, it:
1. Clears `_complete`, `_scoreResult`, `_alertResults`
2. Returns `runner.currentNode()` — the runner is still positioned at the last item

The runner itself does not move. This lands the patient back on the last answered item.

### 6.4 Answer Storage

`engine.recordAnswer(itemId, value)` writes to the answers map. Answers are never cleared — going back and re-answering overwrites. `engine.answers()` always returns a defensive copy.

`existingAnswers` is shallow-copied on construction and pre-populates the map. This is used by the orchestrator when re-entering a previous questionnaire.

### 6.5 Progress

```js
engine.progress() → { current: number, total: number | null }
```

`current` = count of non-instructions nodes in `runner.resolvedPath()`.  
`total` = `current + runner.remainingCount()` if determinate, else `null`.

Instruction items are excluded from both `current` and `total`. `remainingCount()` already skips them; `progress()` filters the resolved path to non-instructions nodes. The progress bar reflects only answerable items.

---

## 7. Orchestrator — Battery-Level Use

`createOrchestrator(config, { sequence }, callbacks)` wraps a sequence runner over the provided battery-level sequence and manages the full session lifecycle.

### 7.1 Construction

The `sequence` is a pre-built list of battery nodes (questionnaire refs + control-flow nodes). Production callers build this via `resolveItems()` (see IMPLEMENTATION_SPEC.md §16.1), which converts the `items=` URL tokens into an expanded sequence. The orchestrator throws if `source` does not have a `sequence` property.

Questionnaire lookups use `config.questionnaires` (a plain array) with a linear scan — the arrays are small (tens of items) so an explicit map is not needed.

### 7.2 DSL Context

The orchestrator builds the context from completed questionnaire scores and answers. Only questionnaires that have already completed appear:

```js
{
  score:    { [sessionKey]: total },
  subscale: { [sessionKey]: subscales },
  item:     { [sessionKey]: answers },   // answers from each completed questionnaire
}
```

Battery-level `if` conditions reference item answers using the **qualified** form `item.<questionnaireId>.<itemId>`. The unqualified `item.<id>` form is only available within a questionnaire. Battery-level `if` conditions can therefore only reference scores and item answers from questionnaires that precede them in the sequence.

### 7.3 Session Keys

Each battery leaf node has a `questionnaireId` and an optional `instanceId`. The session key is `instanceId ?? questionnaireId`. All state (`answers`, `scores`, `alerts`) is keyed by session key.

`instanceId` allows the same questionnaire to appear twice in a battery (e.g. `phq9_pre` and `phq9_post`) without session key collision. The config loader validates that no session key is duplicated within a battery at load time.

### 7.4 `start()`

Calls `runner.advance(batteryContext)` to get the first node, then calls `startQuestionnaire(node)` which:
1. Resolves the session key
2. Looks up the questionnaire definition (calls `onError` and throws if not found)
3. Initialises `state.answers[sessionKey]` to `{}` if not already present (preserves existing on re-entry)
4. Creates a new engine pre-loaded with `state.answers[sessionKey]`
5. Increments `_questionnaireIndex`
6. Calls `onQuestionnaireStart(engine, sessionKey, questionnaire)`

If the battery sequence is empty, `onSessionComplete(state)` is called immediately.

### 7.5 `engineComplete()`

Called by the controller when `engine.advance()` returns `null`.

1. Writes the engine's final answers, score, and alerts into `state`:
   ```js
   state.answers[key] = engine.answers();
   state.scores[key]  = engine.scoreResult() ?? { total: null, subscales: {}, category: null };
   state.alerts[key]  = engine.alertResults() ?? [];
   ```
2. Advances the battery runner. If `runner.hasNext()` is false, or `runner.advance()` returns `null` (all remaining nodes were empty `if` branches), fires `onSessionComplete(state)`.
3. Otherwise calls `startQuestionnaire(node)` for the next questionnaire.

### 7.6 `engineCrossBack()`

Called by the controller when `engine.canGoBack()` is false — the patient is at the first item of the current questionnaire and wants to go back.

If `runner.canGoBack()` is false (already at the first questionnaire), this is a no-op.

Otherwise:
1. Calls `runner.back()` to get the previous battery node
2. Looks up the questionnaire definition (calls `onError` and throws if not found)
3. Re-initialises the engine with the existing answers for that session key
4. Drains the new engine to completion by calling `advance()` until it returns `null`
5. Calls `engine.back()` once to un-complete and land on the last item
6. Calls `onQuestionnaireResume(engine, sessionKey, questionnaire)` — **not** `onQuestionnaireStart`. The engine is already on the right item; the controller must mount it directly without advancing. Callers that omit `onQuestionnaireResume` fall back to `onQuestionnaireStart` for backward compatibility, but the fallback is wrong for any caller whose start path advances the engine (see orchestrator file-header comment).

The drain-then-back sequence reconstructs the engine's resolved path through all items, so `canGoBack()` works correctly and progress is accurate once the patient is on the last item.

### 7.7 Progress

```js
orchestrator.progress() → { current: number, total: number | null }
```

`current` = `_questionnaireIndex` (increments each time `startQuestionnaire()` is called, including on cross-back re-entry).  
`total` = `_questionnaireIndex + runner.remainingCount()` if the battery is determinate, else `null`.

---

## 8. Error Handling

| Situation | Behaviour |
|---|---|
| `advance()` on exhausted runner | Throws `Error('SequenceRunner: advance() called but no nodes remain')` |
| `back()` at position 0 or before first advance | Throws `Error('SequenceRunner: back() called but already at first node')` |
| `randomize` node encountered | Shuffles `ids` with Fisher-Yates, prepends to `pending`, continues |
| `engine.advance()` called after completion | Throws `Error('Engine: advance() called but questionnaire is already complete')` |
| `engine.back()` at first item (not complete) | Throws `Error('Engine: back() called but already at first item')` |
| Battery not found | Orchestrator throws synchronously at construction |
| Questionnaire ID not found | Orchestrator calls `onError(err)` and re-throws |
| DSL condition error | DSL throws; propagates up through `advance()` to the orchestrator/controller |
