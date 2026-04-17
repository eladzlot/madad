# Madad — Deep Review

**Scope:** Reliability, API stability, code quality.
**Focus:** Hardening for LLM-first config authoring.
**Depth:** Full — engine, config, controller, composer, PDF.
**Test state:** 961 tests passing across 32 files.

---

## Executive Summary

Madad is a well-structured static clinical-assessment app. Layer separation holds, security posture is thoughtful, back-nav mechanics are subtle but mostly right, and documentation is unusually thorough for a project this size. The suite is green and the architecture is sound.

The defects fall into two clusters:

1. **Silent failures in the config/DSL pipeline.** Given that instrument authoring is LLM-first, any error class that isn't caught at `validate:configs` time is a structural hazard — the LLM cannot see runtime, only visible validation output. Several such classes exist today (malformed DSL numbers, unchecked alert/formula/if conditions, unvalidated DSL references).

2. **Cross-questionnaire back-navigation is broken in production.** A user on questionnaire 2, item 1, pressing back, ends up back on questionnaire 2, item 1 — the previous questionnaire is silently re-completed. No test catches it because the orchestrator ↔ controller integration seam is unoccupied: each side is mocked from the other's perspective.

The rest of the findings are smaller: schema/handover drift, a risk-highlighting bug for reverse-scored items, composer duplicate-ID silent overwrites, `innerHTML` patches, and measurable test bloat in a few files.

Everything below is concrete — repros exist for every defect.

---

## Critical — Cross-Questionnaire Back Navigation Is Broken

### Symptom

User on Q2 item 1, presses back, expects Q1's last item. Instead: Q1 is silently re-marked complete, the orchestrator re-advances to Q2, and the user lands on Q2 item 1 again. Q1's scores are recomputed in the process.

### Root cause

`src/controller.js` `onQuestionnaireStart` (lines 270–281) unconditionally calls `engine.advance()`:

```javascript
function onQuestionnaireStart(engine, sessionKey, questionnaire) {
  _engine = engine;
  _questionnaire = questionnaire;
  const first = engine.advance();           // ← unconditional
  if (first === null) _orchestrator.engineComplete();
  else { router.push('q'); mountItem(first); }
}
```

The orchestrator fires this callback in two distinct modes:

- **Fresh start** (`startQuestionnaire`): engine has no current item; advancing moves to the first item. Correct.
- **Resume after cross-back** (`engineCrossBack`): engine has been replayed to completion and then `back()`-ed to the last item; `currentItem()` is populated. Advancing moves *past* the last item → returns `null` → controller calls `engineComplete()` → orchestrator re-advances to the next questionnaire.

The callback has no way to distinguish these modes. The caller (`engineCrossBack`) does the right thing; the callback does the wrong thing.

### Reproduction

```javascript
// battery: [Q1 (2 items), Q2 (1 item)]
orc.start();
drainEngine(orc.currentEngine());   // complete Q1
orc.engineComplete();                // now at Q2
// user types an answer and hits back
orc.engineCrossBack();
// Expected: current = Q1's last item
// Actual: current = Q2's first item (round-tripped)
```

Verified repro produces: `after cross-back, current: q2_i1` (should be `q1_i2`).

### Why no test caught this

- `orchestrator.test.js` exercises `engineCrossBack` with a stub `onQuestionnaireStart` that just records — doesn't advance.
- `controller.test.js` mocks `orchestrator.engineCrossBack: vi.fn()` — it never runs.
- No test wires a real orchestrator to a real controller.

Both sides' tests pass; the integration is broken. Classic seam bug.

### Fix

**Minimum — one-line conditional in controller:**

```javascript
function onQuestionnaireStart(engine, sessionKey, questionnaire) {
  _engine = engine;
  _questionnaire = questionnaire;
  const existing = engine.currentItem();
  if (existing) {
    router.push('q');
    mountItem(existing);
    return;
  }
  const first = engine.advance();
  if (first === null) _orchestrator.engineComplete();
  else { router.push('q'); mountItem(first); }
}
```

**Better — remove the ambiguity in the orchestrator API:** introduce a separate `onQuestionnaireResume` callback. "One callback, caller guesses which mode" is the root cause; the fix above works but preserves the underlying design flaw.

### Required regression test

Integration-level: real orchestrator + real engine + real controller, mocked DOM. Complete Q1 → start Q2 → answer Q2 item 1 → fire router back → assert current item is Q1's last item.

---

## P0 — LLM-Critical Correctness

All P0 items share a theme: **errors that don't surface at `validate:configs` time are invisible to an LLM authoring workflow.** The LLM regenerates plausible JSON until validation passes. If validation passes and the config is still wrong, the wrongness ships.

### P0-1. Alert DSL conditions not validated at config-load time

**Location:** `src/engine/alerts.js` lines 36–43.

Alerts catch `DSLSyntaxError | DSLReferenceError | DSLTypeError` at runtime and `console.warn`, then treat the alert as non-firing. Nothing in the load pipeline parses or type-checks alert conditions.

An LLM writes `condition: "item.q9 > = 3"` (typo), the config validates fine, the alert silently never fires in production. For suicidality-tier alerts this is unusually risky.

**Fix:** In `validateConfigData`, for every alert:
1. `tokenize` + `parse` — must succeed (`DSLSyntaxError` → hard fail).
2. Collect all `item.*` / `score.*` / `subscale.*` references and check them against the questionnaire's item IDs, subscale IDs, and own ID. Unknown reference → hard fail.
3. Build a synthetic `context` with all known IDs mapped to `0`, evaluate, require `boolean` result type. Any `DSLTypeError` → hard fail.

Runtime `DSLReferenceError` can remain a soft warning, but the validation-time check eliminates 95%+ of the cases.

### P0-2. Scoring `customFormula` and `if` node conditions not validated at load time

**Location:** `src/engine/scoring.js` (custom formula), `src/engine/sequence-runner.js` (if conditions).

Same problem, different surface. `customFormula` first executes when a patient completes the questionnaire; `if` condition first executes mid-session. Both bypass the validator entirely. An LLM-generated formula that references `item.nonexistent` produces a PDF-generation crash on the first real patient.

**Fix:** Same pattern as P0-1 — dry-run at validate time with a synthetic context, require the expected type.

### P0-3. DSL tokenizer silently accepts malformed numbers

**Location:** `src/engine/dsl.js` lines 63–69.

The number tokenizer consumes `/[0-9.]/` and hands to `parseFloat`, so `3.1.2` becomes one token that `parseFloat` reads as `3.1`. The trailing `.2` vanishes with no error.

Verified:
| Input | Tokenized as | Evaluates to |
|---|---|---|
| `3.1.2 + 1` | `NUMBER(3.1)` + `OP(+)` + `NUMBER(1)` | `4.1` |
| `3..5` | `NUMBER(3)` (dropped `..5`) | `3` |
| `3.` | `NUMBER(3)` | `3` |

An LLM mis-typing a version-like constant or a typo like `0..5` produces silent score corruption.

**Fix:** Tokenize numbers with a stricter regex. One `.` maximum, must be followed by at least one digit if present. Anything else → `DSLSyntaxError`.

### P0-4. Binary-item contradiction between code, schema, and docs

**Location:** `src/config/config-validation.js` lines 126–139 vs. `HANDOVER.md` §3 line 66 and §10 line 358, vs. `src/components/item-binary.js` `DEFAULT_OPTIONS` (line 122).

- HANDOVER: "Binary items render with default כן/לא labels when no options are provided. Options are optional."
- Validator: rejects bare binary items. Confirmed: `{id, type:'binary', text}` fails with *"no options, no optionSetId, and no defaultOptionSetId."*
- Component: ships hardcoded `DEFAULT_OPTIONS = [{label:'כן', value:1}, {label:'לא', value:0}]` that is dead code at runtime (invalid configs never reach it).

For LLM authoring: the LLM reads HANDOVER and `LLM_GUIDE.md`, produces bare binary items, hits validation, retries. Every round consumes tokens. The handover is actively misleading.

**Fix (recommended):** Keep the validator strict (explicit labels clinically safer — Hebrew vs. English, per-questionnaire wording). Update HANDOVER + LLM_GUIDE to match. Delete `DEFAULT_OPTIONS` from `item-binary.js`. Make the validator message actionable: *"Binary items require explicit options. Add `options: [{label:'כן', value:1}, {label:'לא', value:0}]` or set `defaultOptionSetId` on the questionnaire."*

### P0-5. `checkCrossFileBatteryRefs` doesn't recurse into `randomize` nodes

**Location:** `src/config/config-validation.js` `collectRefs`, lines 302–310.

The function walks `sequence` / `then` / `else` but not `node.ids` (randomize). A battery using a randomize block that references a questionnaire from another undeclared config escapes the cross-file check. Other recursion functions in the same file handle randomize — this one is the odd one out, indicating it was written before randomize was added and never updated.

**Fix:** Mirror the randomize branch: `if (node.ids) refs.push(...collectRefs(node.ids));`

### P0-6. `calcRiskLevel` mis-highlights reverse-scored items

**Location:** `src/pdf/report.js` lines 840–860.

Treats the highest raw option value as high-risk. For items with `reverse: true`, the highest raw value is the *safest* answer — the PDF highlights the wrong row. Scoring handles reverse correctly; the PDF does not.

**Fix:** Use the reverse-adjusted value. Simpler: compute `effectiveValue = item.reverse ? (maxPerItem - value) : value` and compare that against the reverse-adjusted option values.

### P0-7. DSL reference integrity not validated at load time

**Location:** `src/config/config-validation.js`, new check.

Even with P0-1 and P0-2 implemented, DSL expressions may reference IDs that don't exist in the questionnaire. Today these fail as `DSLReferenceError` at runtime. At validate time we already know every item/subscale/score ID available in a given scope — reference-checking is free.

**Fix:** After parsing any DSL expression (alert, if-condition, customFormula), walk the AST collecting `ref` nodes, check each against:
- Questionnaire-level: the questionnaire's item IDs + subscale IDs (itself via `score.<id>`).
- Battery-level `if`: all questionnaire IDs + their subscale IDs.

Unknown reference → hard fail with *"references `item.q99` which is not defined in this questionnaire."*

---

## P1 — API Stability and Author Experience

### P1-1. DSL error messages are not LLM-actionable

**Location:** `src/engine/dsl.js`.

Current errors include `unexpected token "null"` (the EOF sentinel's value printed verbatim), `expected identifier after "."` (no location), and wrapped `DSLSyntaxError in "<entire expression>"` (no position pointer).

For an LLM to self-correct, errors need to name *what* was expected and *where*. Cost is small — track position in the tokenizer.

**Fix:** Include a column index and a caret-style pointer:

```
DSLSyntaxError at column 7: expected number or identifier, got EOF
  score.phq9 +
              ^
```

### P1-2. `if()` DSL function evaluates both branches eagerly

**Location:** `src/engine/dsl.js` lines 368–378.

Both `thenVal` and `elseVal` evaluate before the selector runs. `if(item.x >= 5, score.high, score.low)` throws `DSLReferenceError` if `score.low` is missing even when the condition is true. Not documented in `DSL_SPEC.md §7`.

Natural authoring pattern `if(cond, score.conditional, 0)` crashes when `cond` is false.

**Fix:** Evaluate condition first, then only the selected branch. One-line change.

### P1-3. Composer has no duplicate-ID detection across configs

**Location:** `composer/src/composer-loader.js` lines 87–94.

If two loaded configs contain a questionnaire or battery with the same ID, `state.questionnaires` gets two entries, `state.sourceByItem.set(id, ...)` overwrites silently. The composer list shows both rows; the generated URL resolves to only one config. User checks row A, selected URL references config B.

The patient app's loader catches this (throws on merge), but the composer uses `loadDependencies: false` and loads each config separately, bypassing that check.

**Fix:** In `loadAllConfigs`, maintain a cross-config seen-set. On duplicate: push `state.warnings` with both source URLs, skip the duplicate in `state.questionnaires` push. Do not silently overwrite.

### P1-4. Simplify `loadConfig` source forms

**Location:** `src/config/loader.js` lines 86–135.

Currently accepts four shapes: short name, root-relative path, "legacy" slash-containing path, full URL. Normalization rules are subtle — line 123's visited-set key uses `'/' + source` to dedupe `configs/prod/x.json` against `/configs/prod/x.json`. Every form is a separate test surface.

You've approved a breaking change here.

**Fix:** Keep only short names (for app-loaded configs) and full `https://` URLs (for future external configs). Reject everything else. Delete legacy normalization. Removes ~30 lines and closes the whole visited-set normalization bug class.

### P1-5. Schema inconsistencies on control-flow node `id`

**Location:** `src/config/QuestionnaireSet.schema.json`.

| Node | `id` required? |
|---|---|
| `ifNode` (questionnaire-level, line 407) | Yes |
| `batteryIfNode` (line 697) | No |
| `randomizeNode` (line 440) | Yes |
| `batteryRandomizeNode` (line 728) | No |
| `questionnaireRef` (line 677) | n/a |

The IDs are not used at runtime that I could find. `collectAllItemIds` only gathers leaf IDs. An LLM will get inconsistent errors for logically identical structures in different scopes.

**Fix:** Pick one. Either require `id` everywhere (harmless; improves error messages) or nowhere. Mild preference for "require everywhere" — gives validate errors a stable anchor to refer to.

### P1-6. Migrate `innerHTML` patches to safer primitives

**Locations:**
- `src/app.js` `showError`, `showLoading` (lines 43, 69) — `innerHTML` with interpolated strings.
- `composer/src/composer-render.js` — mixed. Lines 198–205, 216, 337–340 use `innerHTML`; elsewhere uses `createElement`.

Current interpolated values are code-side constants, so not exploitable today. But: HANDOVER §6a lists *"`textContent` in error rendering"* as a security control. The actual implementation doesn't match. Any future change that passes user/config content into `showError` (e.g. surfacing `ItemResolutionError.token`, which is plausible) opens XSS.

**Fix:** Rebuild these surfaces with `createElement` + `textContent`. The composer has an `escapeHtml` helper used inconsistently; either apply it everywhere or migrate to structured DOM. Latter is more robust.

### P1-7. Delete `info` severity references

**Location:** `src/config/QuestionnaireSet.schema.test.js` (one test), HANDOVER.md §3 line 151, `src/pdf/report.js` (no dedicated rendering — falls through to default).

You confirmed `info` is abandoned. Schema only permits `warning` and `critical`, which matches current code. Remove the dangling test case and the handover mention.

### P1-8. Structured validation output for `validate:configs`

**Location:** `scripts/validate-configs.mjs`, enhancement.

Free-text errors are OK for humans. LLM authoring workflows do better with structured output — `--json` flag that emits one error per line:

```json
{"file": "trauma.json", "path": "/questionnaires/0/alerts/1/condition", "code": "dsl_reference", "message": "item.q99 is not defined", "suggestion": "Replace with item.q9 or add item q99."}
```

Low priority but high leverage once LLM authoring is routine.

### P1-9. `validate:configs` needs a single-file mode

**Location:** `scripts/validate-configs.mjs`.

Currently validates all configs. An LLM iterating on one instrument gets noise from unrelated files. Add `npm run validate:configs -- path/to/one.json` form. Trivial.

---

## P2 — Polish

### P2-1. Consolidate tree-walk helpers

At least six places walk the item/sequence tree: `scoring.flattenItems`, `config-validation`'s four collectors, `pdf/report.flattenItems`, `resolve-items.expandSequence`. Each handles `if`/`randomize` slightly differently — the P0-5 gap is a direct consequence of this duplication. A shared `walkItems(nodes, visitor)` (or `transformItems`) would prevent drift.

### P2-2. `item-text` required-empty gating

**Location:** `src/components/item-text.js` lines 174–190 + 137–160.

`_submit()` fires `advance` without gating on `required + empty`. `_validate` returns `''` (no error) for empty values. The controller does gate advancement via `canAdvance`, so the engine doesn't move — but the button is still not disabled, the user gets no feedback, nothing happens when they click. UX hole.

**Fix:** Disable the submit button when `required === true && !_value`, or emit a validation message.

### P2-3. Empty patient name allowed silently

**Location:** `src/components/welcome-screen.js` `_begin`.

Empty name sails through; PDF falls back to `—`. Low severity but would benefit from a visible "שמך" placeholder hint being more obvious, or a gentle inline validation.

### P2-4. PID in PDF filename may contain Hebrew

**Location:** `src/pdf/report.js` line 214.

`PID_PATTERN` permits Hebrew letters; those go verbatim into the filename. Valid per OS filesystems, but some mail clients mangle them. Consider transliterating or ASCII-restricting the filename PID specifically (keep the rendered-in-PDF PID unchanged).

### P2-5. HANDOVER is stale

Multiple drift points:
- Says 932 unit tests; actual: 961.
- Claims binary items default to כן/לא (P0-4).
- Claims `info` severity is rendered (P1-7).
- Claims error rendering uses `textContent` (P1-6).

One-pass update after the P0/P1 fixes land.

---

## Test-Suite Audit

### Structural gap: orchestrator ↔ controller seam

No test file uses a real orchestrator and a real controller together. Both sides mock the other. The cross-back bug lives exactly in that gap and is invisible to every test file.

**Recommendation:** Add `src/integration.test.js` (or similar) with real engine + real orchestrator + real controller + mocked router. One test per critical cross-layer contract. Three or four tests here would have caught this bug and will catch the next one.

### Bloat by ratio (tests/source LOC)

| File | Ratio | Finding |
|---|---|---|
| `src/engine/scoring.test.js` | 3.8× | **Justified.** Clinical correctness; every case is a real scoring combo (sum/avg/subscales × reverse × weight × exclude). Fixture data inflates LOC. |
| `src/router.test.js` | 3.6× | **Bloated.** 19 tests / 90 LOC source. See below. |
| `src/engine/alerts.test.js` | 3.5× | **Partly bloated.** 22 tests for 54 LOC; some duplicates ("empty alerts" tested twice, one from undefined and one from empty array). |
| `src/engine/sequence-runner.test.js` | 3.1× | **Justified.** Back-nav + branch-divergence semantics are subtle; each test pins a real invariant. |
| `composer/src/composer-loader.test.js` | 3.1× | **Worth auditing.** 27 tests for 107 LOC; manifest + dev filtering combinations. |
| `src/router.test.js` | 3.6× | See below. |

### `router.test.js` — concrete trim plan

Current: 19 tests / 328 LOC / 90 LOC source. Recommended: ~8 tests.

**Keep:**
1. `push` updates `currentScreen`.
2. `replace` does not move position; `back` skips the replaced entry.
3. Back popstate invokes back handler with the landing screen.
4. Forward popstate invokes forward handler.
5. Replace alone does not fire back or forward handler.
6. `destroy` removes popstate listener (via `_listenerCount` assertion).
7. Welcome-default when no state present.
8. History-order integration test: `replace('welcome') → push('q') → push('q') → push('complete') → 3× back` fires `['q','q','welcome']`.

**Delete or merge:**
- "successive pushes update" — covered by (1) + (8).
- Three separate `destroy` tests collapse into (6).
- Two "handler replacement" tests pin the last-write-wins shape, which isn't a documented contract. Delete — this is implementation detail. If someone later wants multi-handler support, they refactor.
- "does not call back on forward" and mirror — minor paranoia; covered by (4) + (5).

### `alerts.test.js` — concrete trim plan

Current: 22 tests / 194 LOC / 54 LOC source. Recommended: ~14 tests.

- Merge "returns empty when no alerts defined" + "returns empty when alerts array is empty" → one test (both paths).
- "fires multiple alerts independently" + "can fire all alerts at once" — two tests for the same loop. One parameterized test.
- Keep all severity + DSL-error-swallowing + subscale-reference tests — these pin real behaviors.

### Missing coverage (higher priority than trimming)

- **`dsl.test.js`** — 79 tests, zero property/fuzz tests. Would catch P0-3 (malformed numbers), `3..5`, `3.` trailing-dot in ~5 lines of `fast-check`-style code. Given the DSL is the clinical foundation, this is the highest-ROI addition in the whole suite.
- **`pdf/report.test.js`** — 0.7× ratio for 890 LOC source. The PDF is 40% of the shipping code and has BiDi, RTL, risk highlighting, alert rendering. Thin relative to its importance.
- **No integration layer** (see above).

### Testing-policy verdict

The testing-policy doc is good and mostly followed. The policy's own rule *"If a real bug does not break any test → tests are insufficient"* fires on the cross-back bug. The suite's shape (small E2E, strong integration, targeted unit) is violated at exactly one point: the orchestrator ↔ controller seam has no integration layer at all. That's a structural fix, not a discipline issue.

---

## Validation Completeness Audit — Required For PRD

Beyond the specific P0 items, the PRD should include a one-time audit pass. Every class of config-wrongness catchable at validate time should be caught. Candidates I found:

| Wrongness | Caught today? |
|---|---|
| Duplicate questionnaire/battery ID within file | Yes |
| Duplicate questionnaire ID across files (merge) | Yes (at load) |
| Duplicate questionnaire ID across files (composer) | **No — P1-3** |
| Duplicate item ID within questionnaire | Yes |
| Cross-file battery reference in `sequence`/`then`/`else` | Yes |
| Cross-file battery reference in `randomize.ids` | **No — P0-5** |
| Alert DSL syntax error | **No — P0-1** |
| Alert DSL reference to unknown item/subscale | **No — P0-1, P0-7** |
| Alert DSL type error (returns number not bool) | **No — P0-1** |
| Custom formula DSL errors | **No — P0-2** |
| `if` node condition DSL errors | **No — P0-2** |
| Malformed DSL numbers (`3.1.2`) | **No — P0-3** |
| `interpretations.target` points to nonexistent subscale | **No** (silent null category) |
| `exclude` lists item IDs that don't exist | **No** (silently ignored) |
| `weight: 0` or negative | **No** (accepted, garbage scores) |
| `maxPerItem` missing but `reverse: true` exists | Runtime only (throws) |
| Binary option count ≠ 2 | Yes |
| Interpretation range gaps/overlaps | **No** |
| Slider `min >= max` | Yes |

Roughly 9 checks missing; each is ~10–20 lines of validator code. The PRD should commit to **"every wrongness class catchable at validate time is caught"** as an invariant, not a wishlist.

---

## Architectural Notes Worth Preserving

These aren't defects — they're the parts of the codebase worth protecting from entropy.

- **Layer discipline.** `src/engine/` and `src/config/` have no DOM imports. Holds cleanly across the codebase.
- **`item-types.js` registry.** Adding a new item type really is one entry + one component + one PDF renderer.
- **Single navigation model.** All back/forward routes through `history.back()` / `history.forward()` → popstate → router. Controller never calls `engine.back()` or `engine.advance()` directly in response to shell nav events. The rule is documented and consistently followed.
- **Sequence-runner replay/divergence model.** The `pendingBefore` snapshot + `replayFrom` pointer correctly handles branch-switches after back-nav. This is the kind of thing that usually rots — it hasn't.
- **Security posture.** Same-origin default, explicit `allowedOrigins` escape hatch, ReDoS guard, PID pattern, name length cap, BiDi control-char strip. Each controls a concrete attack. Preserve.
- **`validate:configs` being run in CI.** Foundation for the LLM-first authoring story. Extending it is the single highest-leverage direction.

---

## Prioritized List for the PRD

### P0 — Correctness, clinical impact
0. **Fix cross-questionnaire back navigation.** Add integration test.
1. Validate alert DSL at config-load time.
2. Validate `customFormula` and `if` conditions at config-load time.
3. Fix DSL tokenizer malformed-number acceptance.
4. Resolve binary-item contradiction (pick: keep validator strict, update docs).
5. Add randomize to `checkCrossFileBatteryRefs`.
6. Fix `calcRiskLevel` for reverse-scored items.
7. Add DSL reference integrity check at load time.

### P1 — API stability, author experience
8. Improve DSL error messages (position, expected token).
9. `if()` short-circuit.
10. Composer duplicate-ID detection.
11. Simplify `loadConfig` source forms.
12. Normalize `id` requirement on control-flow nodes.
13. Migrate `innerHTML` patches to safer primitives.
14. Delete `info` severity references.
15. Structured JSON output for `validate:configs`.
16. Single-file mode for `validate:configs`.

### P2 — Polish
17. Consolidate tree-walk helpers.
18. `item-text` required-empty gating.
19. Welcome-screen empty-name UX.
20. PID transliteration in filenames.
21. Update HANDOVER.
22. Trim `router.test.js` / audit `alerts.test.js`.
23. Add property/fuzz tests to `dsl.test.js`.
24. Add orchestrator ↔ controller integration tests.

### PRD-level commitments
- **Invariant:** Every class of config-wrongness catchable at validate time must be caught. Complete the validation-completeness audit.
- **Testing seam:** Establish the integration layer explicitly; target the orchestrator ↔ controller seam first.

---

*End of review. Repros and citations are available on request; all defects above were verified against the current codebase (961 passing tests).*
