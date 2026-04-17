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

**Currently working on:** idle — P0-0 complete. Next candidate: P0-3 (small, self-contained) or P0-1/P0-2/P0-7 (validation expansion, largest piece).
**Last session ended:** 2026-04-17 — P0-0 shipped. 966 tests passing.
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
| P0-3 | Fix DSL tokenizer malformed-number acceptance | todo | |
| P0-4 | Resolve binary-item contradiction | todo | Decision D-4: keep validator strict; update docs, delete dead code |
| P0-5 | Add randomize to `checkCrossFileBatteryRefs` | todo | |
| P0-6 | Fix `calcRiskLevel` for reverse-scored items | todo | |
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

*Format: `TaskID — one-line summary — files — D-N references`*
