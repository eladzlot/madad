# TODO — Hardening and API Stability

**Living document.** Updated as work progresses. Source of truth for where we are, what's next, and why past decisions were made.

Companion to `REVIEW.md` (the one-time deep-review report that produced this list).

---

## 0. How to use this document

### If you're resuming work (human or LLM)

1. **Read §1 (Status) first.** Tells you the current task and whether work is blocked.
2. **If a task is in progress, read §3 (Active Task Notes) for that task.** Partial work, files touched, open questions.
3. **Skim §4 (Decisions Log) for any decision relevant to the task.** Decisions bind — do not relitigate them silently. If you disagree, raise it with the user; don't just deviate.
4. **Check §5 (Task Archive) if the current task depends on completed work** to understand what changed.

The phrase **"Continue with TODO"** means: do the above, then pick up the current task. If no task is active, ask which one to start (default is the highest-priority `todo`).

### If you're starting a new task

1. Update §1 (Status) — set `Currently working on` to the task ID, add today's date.
2. Create a `### <TaskID>: <title>` block in §3 (Active Task Notes).
3. Work the task. Update §3 at natural break points (after each file edited + tested, not only at session end).
4. Record any design decision you make in §4 (Decisions Log) as you make it — append-only, never rewrite.
5. If blocked on a user question, update §1's `Blocked on` field and stop. Do not guess.

### On task completion

1. Compress §3's notes for the task into a **one-line entry** in §5 (Task Archive): `TaskID — what changed — files — decision IDs produced (if any)`.
2. Delete the §3 block for the task.
3. Mark the task `done` in §2 (Task List).
4. Update §1 (Status) to `idle` or to the next task.

### What goes where

| Where | What | Lifetime |
|---|---|---|
| §1 Status | Where we are right now | Overwritten every session |
| §2 Task List | All tasks with status | Statuses change; rows stay until deferred → abandoned |
| §3 Active Task Notes | Scratch work for in-progress task only | Wiped to archive on completion |
| §4 Decisions Log | "We chose X over Y because Z" | **Append-only. Never deleted.** |
| §5 Task Archive | One-liners for completed tasks | Kept short; references decisions by ID |

### Rules

- **Decisions bind.** Once in §4, a decision is authoritative. To change it, add a new decision that explicitly supersedes the old one — do not edit history.
- **Code goes in files, not here.** §3 may reference line numbers and file paths, but not paste source.
- **No speculation in this doc.** Options considered live in chat messages. Only decisions made live here.
- **Green tests before marking done.** `npm test` must pass at the commit that flips a task to `done`.

---

## 1. Status

**Currently working on:** idle — all small P0s complete. Only P0-1/P0-2/P0-7 (validation cluster) remaining at P0.
**Last session ended:** 2026-04-17 — P0-5 + P0-6 shipped. 981 tests passing.
**Blocked on:** nothing.

---

## 2. Task List

Task IDs are stable and match `REVIEW.md` section references. Status values: `todo` | `in-progress` | `done` | `blocked` | `deferred` | `abandoned`.

### P0 — Correctness, clinical impact

| ID | Title | Status | Notes |
|---|---|---|---|
| P0-0 | Fix cross-questionnaire back navigation (+ integration test) | done | See archive A-1. D-1 applied. |
| P0-1 | Validate alert DSL at config-load time | todo | |
| P0-2 | Validate `customFormula` and `if` conditions at load time | todo | Related to P0-1 — may share a validation helper |
| P0-3 | Fix DSL tokenizer malformed-number acceptance | done | See archive A-2. D-5 applied. |
| P0-4 | Resolve binary-item contradiction | done | See archive A-3. D-4 + D-6 applied. |
| P0-5 | Add randomize to `checkCrossFileBatteryRefs` | done | See archive A-4. |
| P0-6 | Fix `calcRiskLevel` for reverse-scored items | done | See archive A-5. D-7 applied. |
| P0-7 | Add DSL reference integrity check at load time | todo | Related to P0-1, P0-2 |

### P1 — API stability, author experience

| ID | Title | Status | Notes |
|---|---|---|---|
| P1-1 | Improve DSL error messages (position, expected token) | todo | |
| P1-2 | `if()` DSL short-circuit | todo | |
| P1-3 | Composer duplicate-ID detection | todo | |
| P1-4 | Simplify `loadConfig` source forms | todo | Decision D-2: short names + full `https://` URLs only. Breaking change approved. |
| P1-5 | Normalize `id` requirement on control-flow nodes | todo | |
| P1-6 | Migrate `innerHTML` patches to safer primitives | todo | |
| P1-7 | Delete `info` severity references | todo | Decision D-3: `info` abandoned |
| P1-8 | Structured JSON output for `validate:configs` | todo | |
| P1-9 | Single-file mode for `validate:configs` | todo | |

### P2 — Polish

| ID | Title | Status | Notes |
|---|---|---|---|
| P2-1 | Consolidate tree-walk helpers | deferred | |
| P2-2 | `item-text` required-empty gating | deferred | |
| P2-3 | Welcome-screen empty-name UX | deferred | |
| P2-4 | PID transliteration in filenames | deferred | |
| P2-5 | Update HANDOVER after P0/P1 landed | deferred | Do last — reflect final state |
| P2-6 | Trim `router.test.js` and audit `alerts.test.js` | deferred | |
| P2-7 | Add property/fuzz tests to `dsl.test.js` | deferred | |
| P2-8 | Expand orchestrator ↔ controller integration tests | deferred | Harness created in P0-0 (`src/integration.test.js`); expand to other seams as needed |
| P2-9 | Validation-completeness audit pass | deferred | Catch-all after individual validation tasks land |

---

## 3. Active Task Notes

*No active task.*

---

## 4. Decisions Log

Append-only. Date format: YYYY-MM-DD.

---

### D-1 — Cross-back fix: split callbacks, not conditional inside controller
**Date:** 2026-04-17
**Context:** P0-0. `engineCrossBack` and fresh-start both fire `onQuestionnaireStart`; controller cannot distinguish, advances unconditionally, causes the cross-back round-trip bug.
**Decision:** Split into two callbacks: `onQuestionnaireStart(engine, sessionKey, questionnaire)` for fresh entries, `onQuestionnaireResume(engine, sessionKey, questionnaire)` for cross-back re-entries. Controller mounts `engine.currentItem()` directly in the resume path, does not call `advance()`.
**Rejected alternative:** One-line conditional `if (engine.currentItem()) { mount } else { advance }`. Works but preserves the ambiguous API that caused the bug — future changes are likely to reintroduce the same class of mistake.
**Scope impact:** Orchestrator API changes; callers must handle both callbacks. Only caller today is `src/controller.js`.

---

### D-2 — URL source forms in `loadConfig`: simplify to two, breaking change OK
**Date:** 2026-04-17
**Context:** P1-4. Loader currently accepts short names, root-relative paths, legacy slash-paths, and full URLs. Normalization in `resolveSource` is subtle; visited-set dedup requires manual `/` prefixing.
**Decision:** Accept only (a) short names (matching `^[a-zA-Z0-9_-]+$`) and (b) full `https://` URLs. Reject everything else. Old hand-crafted URLs with path forms will break — acceptable per user.
**Scope impact:** Delete ~30 lines from `resolveSource`. Update any fixtures using path forms. Update `CONFIG_SCHEMA_SPEC.md` if it documents path forms.

---

### D-3 — `info` severity: abandoned, remove all traces
**Date:** 2026-04-17
**Context:** P1-7. Schema allows only `warning` and `critical`; HANDOVER and one test file reference `info`; PDF has no dedicated rendering.
**Decision:** `info` is not coming back. Delete the test reference and the HANDOVER mention. No schema or PDF changes needed.

---

### D-4 — Binary items: keep validator strict, delete dead fallback
**Date:** 2026-04-17
**Context:** P0-4. HANDOVER + `item-binary.js` `DEFAULT_OPTIONS` imply a runtime fallback to כן/לא. Validator rejects bare binary items. Clinical safety favors explicit labels (Hebrew vs. English, per-questionnaire wording).
**Decision:** Validator stays strict — binary items must have explicit options, or `optionSetId`, or a questionnaire-level `defaultOptionSetId`. Delete `DEFAULT_OPTIONS` from `item-binary.js` (dead code at runtime). Update HANDOVER §3 and §10, and `LLM_GUIDE.md`, to reflect this. Make the validator error message actionable with a copy-pasteable fix snippet.

---

### D-5 — DSL number literals: strict shape, no leading or trailing dot
**Date:** 2026-04-17
**Context:** P0-3. Tokenizer's `/[0-9.]/` greedy consume + `parseFloat` silently truncated `3.1.2 → 3.1`, `3..5 → 3`, `3. → 3`. Bug surface for LLM-authored configs.
**Decision:** Number tokens must match `[0-9]+(\.[0-9]+)?` exactly. A decimal point requires at least one digit on each side. A second decimal point immediately after a valid fractional part is rejected. Leading-dot literals (`.5`) remain unsupported — they were never supported, no config uses them, and adding them would expand surface for no gain. Negative literals continue to come from the unary-minus parser rule.
**Rejected alternative:** Permissive parse + warn. Rejected: silent number corruption is the worst class of clinical bug; loud failure is the only safe choice.
**Scope impact:** `src/engine/dsl.js` tokenizer only. Pure tightening — no valid expression's behavior changes. All bundled configs validate unchanged.

---

### D-6 — P0-4 scope corrections to D-4
**Date:** 2026-04-17
**Context:** P0-4 implementation. Pre-flight reading uncovered three deviations from D-4's stated scope.
**Decision (addendum to D-4, not superseding):**
1. **`LLM_GUIDE.md` needs no change.** D-4 listed it. Inspection showed lines 121–131 already explicitly document "Binary items have no built-in default labels." Strike from D-4's worklist.
2. **`item-binary.test.js` had 3 tests exercising the dead fallback** (lines 32–56). D-4 didn't mention the test surface. These were deleted; replaced with 1 positive test asserting the component renders nothing when options are absent (defense-in-depth, since the validator already prevents this in production).
3. **`CONFIG_SCHEMA_SPEC.md` §5.2 documented a `labels: {yes, no}` field that does not exist** anywhere in the schema, code, or any config. D-4 said "if it documents path forms" but understated this — the field was pure fiction. Rewrote §5.2 to use the real `options` / `optionSetId` / `defaultOptionSetId` shape consistent with §5.1 (select).
4. **HANDOVER §10's "do not revert" note was protecting a behavior that did not exist.** It claimed the validator skipped the options check. Replaced with a note pinning the actual current behavior.

**Scope impact:** None on code or contracts beyond what D-4 already approved. Documentation now matches reality across HANDOVER (§3, §4, §6, §10), IMPLEMENTATION_SPEC §5, CONFIG_SCHEMA_SPEC §5.2, and CONTRIBUTING.

---

### D-7 — `calcRiskLevel` reverse handling: invert sort direction, not lookup `maxPerItem`
**Date:** 2026-04-17
**Context:** P0-6. PDF risk highlighting picked the highest raw option value as "high" risk. For `reverse: true` items, the lowest raw value is the clinically worst answer — opposite of what was being highlighted.
**Decision:** When `item.reverse === true`, sort `options` ascending instead of descending and pick worst/second-worst from the same end. The function already receives `options` — no need to thread `maxPerItem` from the scoring spec, which would couple PDF rendering to scoring config shape.
**Rejected alternative (REVIEW's suggestion):** Compute `effectiveValue = item.reverse ? (maxPerItem - value) : value` and compare against reverse-adjusted option values. Works, but requires plumbing `maxPerItem` into `buildItemRow` and `calcRiskLevel`. Sort-direction inversion achieves the same result with zero new parameters.
**Slider note:** Sliders don't carry a `reverse` flag in this codebase (verified against `item-slider.js` and all bundled configs). Slider risk branch is untouched. If reverse-sliders are introduced later, the same sort-inversion pattern applies — but the slider branch uses a percentage-of-range computation, not options sort, so it would need its own fix.
**Scope impact:** `src/pdf/report.js` `calcRiskLevel()` only. Pure correctness fix. Existing non-reverse tests unchanged in behavior.

---

## 5. Task Archive

### A-1 — P0-0 Cross-questionnaire back navigation
**Completed:** 2026-04-17
**Summary:** Split `onQuestionnaireStart` into separate `start` and `resume` callbacks on the orchestrator. `engineCrossBack()` now fires `onQuestionnaireResume`, which the controller handles by mounting `engine.currentItem()` directly without advancing. Back-compat fallback: when `onQuestionnaireResume` is omitted, the orchestrator falls back to `onQuestionnaireStart` (imperfect but preserves old callers).
**Files changed:**
- `src/engine/orchestrator.js` — added `onQuestionnaireResume` callback with fallback.
- `src/controller.js` — new `onQuestionnaireResume` handler; wired through `start()`.
- `src/engine/orchestrator.test.js` — 2 new tests pinning the dispatch.
- `src/integration.test.js` — **new file** — 3 integration tests covering the orchestrator ↔ controller seam where this bug lived.
- `docs/RENDER_SPEC.md` — documented the new callback under §2.8.
- `docs/SEQUENCE_SPEC.md` — corrected §7.6 to name the new callback.

**Decisions referenced:** D-1.
**Test delta:** 961 → 966 passing. Zero regressions.

---

### A-2 — P0-3 DSL tokenizer malformed-number rejection
**Completed:** 2026-04-17
**Summary:** Tightened `tokenize()` number branch to consume strictly `[0-9]+(\.[0-9]+)?`. Inputs like `3.`, `3.x`, `3.1.2`, `3..5` now throw `DSLSyntaxError` with a message identifying the malformed literal. Eliminates the silent-corruption case `3.1.2 + 1 → 4.1`.
**Files changed:**
- `src/engine/dsl.js` — rewrote number branch in `tokenize()`.
- `src/engine/dsl.test.js` — new `describe('number tokenization (strict)')` block, 11 tests (4 positive controls, 7 rejection cases).
- `docs/DSL_SPEC.md` — §2.4 gained a strict-shape definition + rejection table.

**Decisions referenced:** D-5.
**Test delta:** dsl.test.js 79 → 90 passing. Full suite green. `npm run validate:configs` clean — no bundled config relied on the loose tokenization.

---

### A-3 — P0-4 Binary-item contradiction resolved
**Completed:** 2026-04-17
**Summary:** Code, tests, and docs now agree on a single rule: binary items require explicit option labels (inline `options`, `optionSetId`, or questionnaire-level `defaultOptionSetId`). Validator stays strict. Component fallback `DEFAULT_OPTIONS` (dead at runtime) deleted. Validator error message gained an actionable copy-pasteable fix snippet specialized per item type.
**Files changed:**
- `src/components/item-binary.js` — deleted both `DEFAULT_OPTIONS` declarations and the `?? DEFAULT_OPTIONS` fallback in `_selectByIndex` and `render`. Render now no-ops if `options[0]` or `options[1]` is missing (defense-in-depth).
- `src/components/item-binary.test.js` — deleted 3 fallback-asserting tests; added 1 positive test pinning new no-render behavior. Net −2.
- `src/config/config-validation.js` — error message for missing options now includes a copy-pasteable fix, specialized per item type (binary gets `כן`/`לא` snippet).
- `src/config/config-validation.test.js` — updated wording assertion; added new test pinning the binary-specific actionable error.
- `docs/HANDOVER.md` — §3 lines 64–65, §4 line 181, §6 line 284, §10 line 358 all corrected. The §10 "do not revert" entry was actively misleading (claimed validator skipped the check); rewritten to pin actual behavior.
- `docs/IMPLEMENTATION_SPEC.md` line 298 — binary item description rewritten.
- `docs/CONFIG_SCHEMA_SPEC.md` §5.2 — full rewrite. Old table documented a `labels: {yes, no}` field that **never existed** in the schema, code, or any config. Replaced with the real `options` / `optionSetId` shape, mirroring §5.1's structure.
- `public/configs/CONTRIBUTING.md` line 80 — flipped from "don't need options; platform provides defaults" to the actual rule.

**Decisions referenced:** D-4, D-6.
**Test delta:** 974 → 973 (−3 deleted dead-fallback tests, +1 new positive component test, +1 new validator test = net −1). Full suite green. 6/6 configs validate.

---

### A-4 — P0-5 `checkCrossFileBatteryRefs` randomize recursion
**Completed:** 2026-04-17
**Summary:** Cross-file dependency check in `collectRefs()` walked `sequence`/`then`/`else` but missed `randomize.ids`. A battery using `randomize` to reference a questionnaire from an undeclared config escaped detection at validate time. One-line fix mirrors the existing `then`/`else` branches.
**Files changed:**
- `src/config/config-validation.js` — added `if (node.ids) refs.push(...collectRefs(node.ids));` to `collectRefs()`.
- `src/config/config-validation.test.js` — added 3 tests: top-level randomize with missing dependency, randomize with declared dependency (no error), and randomize nested inside `if-then`.

**Decisions referenced:** none (pure REVIEW-aligned fix; no novel design choice).
**Test delta:** 973 → 976 passing. Full suite green. 6/6 configs validate.

---

### A-5 — P0-6 `calcRiskLevel` reverse-scored items
**Completed:** 2026-04-17
**Summary:** PDF risk highlighting (high/med background colors on the response table) treated the highest raw value as worst. For `reverse: true` items, the lowest raw value is clinically worst — the PDF was highlighting safe answers as high-risk. Fix inverts the sort direction when `item.reverse` is true; everything else is unchanged.
**Files changed:**
- `src/pdf/report.js` — rewrote sort step in `calcRiskLevel()`: `options.map(o => o.value).sort((a, b) => item.reverse ? a - b : b - a)`. Picks worst/second-worst from index 0/1. Comment explains the clinical reasoning. Slider branch untouched (no slider in this codebase uses reverse — verified against `item-slider.js` and all bundled configs).
- `src/pdf/report.test.js` — added 5 tests: reverse-scored select (high/med/null bands), reverse-scored binary, and reverse with non-sequential option values.

**Decisions referenced:** D-7.
**Test delta:** 976 → 981 passing. Full suite green. 6/6 configs validate.

*Format: `TaskID — one-line summary — files — D-N references`*
