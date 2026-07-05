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

**Currently working on:** AGG stream — slices 1+2 (AGG-2, AGG-3) complete; next: AGG-4 (RCI — blocked on AGG-P) or AGG-5 (export) or aggregate deploy decision.
**Last session ended:** 2026-07-04 — Slice 2 shipped: tooltips, keyboard-operable markers, session detail panel with in-memory PDF re-download, view-as-table, chart label placement fixes. 1096 unit tests, 96 e2e. Envelope (c92da8c) **deployed to production** 2026-07-04; aggregate surface itself still local by user choice.
**Blocked on:** AGG-4 needs AGG-P (user's psychometrics literature pass). (P0-1/P0-2/P0-7 validation cluster deprioritized by user 2026-07-03.)

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

### AGG — Aggregate surface (docs/AGGREGATE_SPEC.md)

Build slices per D-11. Slice 1 goes to pilot therapists before later slices are built.

| ID | Title | Status | Notes |
|---|---|---|---|
| AGG-0 | Envelope in PDFs (`shared/pdf/envelope-schema.js` + report.js attachment) | done | Commit c92da8c. Awaiting deploy. |
| AGG-1 | Schema: interpretations `type` + `cutoffs[]`; optional `psychometrics` block | done | See archive A-6. D-12 applied. |
| AGG-2 | Slice 1 — usable core: surface scaffold, upload + per-file status, parse-pdf, chart (total line, bands, time axis, 5-session window), pid filter, raw-data list | done | See archive A-7. D-9/D-10 applied. |
| AGG-3 | Slice 2 — interaction & a11y: tooltips, keyboard nav, detail panel, view-as-table | done | See archive A-8. |
| AGG-4 | Slice 3 — RCI line + subscale toggles | todo | Blocked on AGG-P content |
| AGG-5 | Slice 4 — PNG/SVG export | todo | |
| AGG-P | Psychometrics content: reliability/SD/source per instrument | todo | **User-owned clinical workstream** — can start now; long pole for AGG-4 |

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

### D-8 — Envelope shape deltas vs AGGREGATE_SPEC §3.2 sketch
**Date:** 2026-07-03
**Context:** AGG-0 implementation. The spec's envelope sketch showed `sessionState: { answers, scores, alerts }` and per-instrument `configFile`.
**Decision:**
1. `sessionState` embeds the **full orchestrator state including `questionnaireIds`** — without it, instance-keyed sessions (`phq9#1`) cannot be mapped back to instruments on the read side. The spec's "unmodified state object" language governs; the sketch was approximate. `alerts` is an object keyed by sessionKey (the real shape), not the sketch's `[]`.
2. `instruments[].configFile` is the **config short name** (`standard`), annotated on each questionnaire by `shared/config/loader.js` at merge time; full URL for external configs; `null` when unknown.
3. `appVersion` is `package.json` version inlined via the `__APP_VERSION__` Vite/Vitest define; `'dev'` fallback outside builds. Forensic only.
4. `validateEnvelope` tolerates unknown extra fields (forward compat) but rejects `schemaVersion` newer than the build (per spec §5.7).

---

### D-9 — Aggregate PDF reader: hand-rolled, zero dependencies
**Date:** 2026-07-03
**Context:** AGG-2. Reading `data.json` back out of uploaded PDFs. Streams are FlateDecode-compressed (pdfkit default).
**Decision:** Hand-rolled extractor (~200 lines) in `aggregate/src/parse-pdf.js`: locate the `/EmbeddedFiles` name-tree entry, inflate via browser-native `DecompressionStream('deflate')`. No pdf-lib.
**Rationale:** We only parse our own pdfmake output; the spec sanctions per-file warnings as the failure mode for anything else. pdf-lib (~130 KB gz) buys robustness against re-saved/rewritten PDFs (rare — forwarding doesn't rewrite) and still requires manual name-tree walking.
**Escape hatch:** parse-pdf.js is an isolated module with a clean contract; if pilots surface rewritten PDFs, swap in pdf-lib without touching callers.

---

### D-10 — Charts: hand-rolled SVG; time axis is LTR
**Date:** 2026-07-03
**Context:** AGG-2. Chart requirements (severity bands, RCI dashed lines, baseline marker, pagination, SVG→PNG export, no animation) are exactly what charting libraries fight.
**Decision:**
1. Hand-rolled SVG rendered by Lit components. No charting library.
2. **Time flows left-to-right** — supersedes AGGREGATE_SPEC's original RTL axis (spec updated). Dates/numbers are LTR even in Hebrew documents; page chrome stays RTL.
3. A single uploaded session renders as a real chart (marker + bands + axes, no line, no empty-state) — meaningful from the first PDF.
4. **Complexity guardrail** (user's concern: hand-rolled "getting out of hand"): geometry/scales/ticks live in pure, unit-tested modules with no DOM; the Lit component only maps a precomputed render-model to SVG elements and never calculates. If the chart layer grows past ~500 lines of logic, stop and reassess against a library.

---

### D-11 — Aggregate v1 ships in slices; desktop-first
**Date:** 2026-07-03
**Context:** Scope for AGGREGATE_SPEC v1 (rich). Real clinicians are already using the product; fastest feedback wins.
**Decision:** Four slices (AGG-2 … AGG-5): usable core → interaction/a11y → RCI + subscales → export. Slice 1 goes to the pilot therapists before later slices are built. Desktop-first per AGGREGATE_SPEC §1.2: upload is `<input type=file multiple>` (drag-drop as enhancement), layout degrades to one column, no mobile-specific UX in v1.

---

### D-12 — Chart overlays: block-level `type` + explicit `cutoffs[]`, everything optional
**Date:** 2026-07-03
**Context:** AGG-1. AGGREGATE_SPEC originally put `type: severity|screening` on each range. User requirements: all fields optional (many instruments have no interpretations); an instrument may carry **both** severity bands and a screening cutoff; no behind-the-scenes derivation.
**Decision:**
1. `interpretations.type` is **block-level and optional**: `"severity"` → ranges render as bands; `"screening"` → documentational, no bands; absent → no overlay. Not per-range.
2. Screening thresholds live in a separate optional `interpretations.cutoffs: [{value, label?}]` array — each entry is a solid line at a **literal value**, never derived from range boundaries.
3. `psychometrics` optional per questionnaire: `{reliability ∈ (0,1), sd > 0, source}`, all three required when present.
4. New semantic validation: interpretation ranges must be disjoint (and min ≤ max). The score→category lookup (`src/engine/scoring.js` `interpret()`) is first-match-wins, so overlap makes the PDF category label order-dependent — this is also why screening ranges could not simply be mixed into `ranges[]`.
**Rejected alternative:** per-range `type` (the spec's original wording) — cannot express "both" without overlapping entries in `ranges[]`, which ambiguates the category lookup; and deriving cutoff position from `ranges[1].min` is implicit logic the user explicitly rejected.
**Scope impact:** Schema + regenerated validator; `config-validation.js` overlap rule; 14 prod questionnaires annotated (severity: phq9, gad7, isi, wsas; screening + cutoff: pc_ptsd5@4, dar5@12, oci_r@21, pdss_sr@9, spin@21, oasis@8, roci@22, procsi@18, scared_child@25, scared_parent@25 — user approved classification); config versions bumped (standard 1.7.0, trauma/anger/ocd/child 1.1.0). Patient app behaviour unchanged.

---

### D-13 — Chart shows every session; the 5 is a minimum axis span, not a window
**Date:** 2026-07-05
**Context:** AGG-3 review. The original AGGREGATE_SPEC §5.4 prescribed a 5-session visible window with pagination; implemented as such. User correction: the graph must show *at least* 5 time points with **no upper limit** — the chunking made longer histories harder to read (and disagreed with the heatmap, which always shows everything).
**Decision:** No windowing, no pagination. All sessions render always. The x-domain spans at least `MIN_TIME_SLOTS − 1 = 4` median inter-session intervals (default one week), so sparse histories cluster left with visible "future"; the real span is never truncated. Dense series thin x-labels to ~8 (newest always labelled — same rule as the heatmap). Marker separability at extreme densities is the clinician's responsibility (no clustering in v1).
**Supersedes:** the §5.4 portion of the original spec; AGGREGATE_SPEC updated.
**Scope impact:** chart-model (windowOffset/pagination removed; `paddedTimeDomain` in scales.js), trajectory-chart (pager UI removed).

---

### D-14 — All charts share one x-domain
**Date:** 2026-07-05
**Context:** AGG-3 review with mixed-cadence fixtures (weekly PHQ-9, monthly WSAS, one-off ASI-3). Per-chart domains put the same date at different x positions, defeating cross-instrument comparison.
**Decision:** The composition root computes one `paddedTimeDomain` over all visible (pid-filtered) sessions and passes it to every `<trajectory-chart>`; same-date points align vertically across charts. A chart without a provided domain derives its own (standalone use, tests). AGGREGATE_SPEC §5.1 updated.

---

## 5. Task Archive

### A-6 — AGG-1 Interpretations `type`/`cutoffs` + `psychometrics` schema
**Completed:** 2026-07-03
**Summary:** Chart-overlay config surface per D-12. Schema gained optional `interpretations.type` enum, `interpretations.cutoffs[]`, and per-questionnaire `psychometrics`; validator regenerated; disjoint-ranges semantic rule added; all 14 prod instruments with interpretations annotated; docs updated (CONFIG_SCHEMA_SPEC §7/§7a, LLM_GUIDE incl. removing the false "overlapping ranges allowed" claim, AGGREGATE_SPEC §5.2 + §10).
**Files changed:** `shared/config/QuestionnaireSet.schema.json`, `shared/config/validate-schema.js` (generated), `shared/config/config-validation.js` (+ tests), `shared/config/QuestionnaireSet.schema.test.js`, 5 prod configs, 4 docs.
**Decisions referenced:** D-12.
**Test delta:** 1010 → 1023 passing. 7/7 configs validate.

### A-7 — AGG-2 Aggregate surface, slice 1
**Completed:** 2026-07-04
**Summary:** `/aggregate/` ships the usable core: multi-file upload (input + drag-drop) with per-file typed statuses, zero-dep envelope extraction (D-9: Filespec scan + DecompressionStream), framework-free store (no dedup per spec §4; pid as filter), pure chart geometry (scales + chart-model, LTR time per D-10, severity bands + cutoff lines from AGG-1 fields, 5-session window with pagination, single-point rendering, baseline marker, alert rings), thin Lit SVG component, raw-data list for non-quantitative instruments. Overlay configs load by short name only (base-path safety); legacy-path configs chart without overlays.
**Files:** `aggregate/` (index.html, src/{aggregate.js,css, parse-pdf, store, chart/{scales,chart-model,trajectory-chart}, components/{upload-list,pid-filter,raw-data-list}} + tests), `tests/e2e/aggregate.e2e.test.js`, dist-smoke aggregate test, vite/vitest/eslint/lint/check-size wiring.
**Decisions referenced:** D-9, D-10, D-11, D-12.
**Test delta:** 1023 → 1081 unit; e2e 85 → 92 (round-trip: real patient PDF → chart, incl. no-dedup and bad-file paths).

### A-8 — AGG-3 Aggregate slice 2: interaction & a11y
**Completed:** 2026-07-04
**Summary:** Spec §5.6 interaction layer. Custom tooltips on hover/focus (date, total, category, subscales with Hebrew labels, alerts); markers focusable (tabindex/role/aria) with arrow-key movement and Enter/click dispatching `point-selected`; `<session-detail>` slide-in panel showing the full session breakdown (all instruments that day) with the original PDF re-downloadable from the in-memory File the store now retains; view-as-table toggle rendering the full series (screen-reader primary). Chart label fixes: band labels inside-left, cutoff labels inside-right, explicit `direction:rtl` with rtl-relative anchors (SVG text-anchor is direction-relative — the source of the earlier clipping).
**Files:** store.js (file retention, sessionId, getSession), chart-model.js (marker payload, label geometry), trajectory-chart.js (tooltip/keyboard/table; `interpretations` prop → `questionnaire`), components/session-detail.js (new), aggregate.js wiring, tests throughout, aggregate e2e interaction tests.
**Decisions referenced:** D-10.
**Test delta:** 1081 → 1096 unit; e2e 92 → 96.

### A-9 — Aggregate UI round + per-item heatmap
**Completed:** 2026-07-05
**Summary:** User-review round on slice 2: theme made continuous with the Composer (shared tokens, Noto Sans Hebrew, navy brand header, dark mode); detail panel scoped to one questionnaire and now lists every answered item (question text + response label + value from config); severity bands tile the full plot (integer-range gaps chained, top band to axis top); band labels inside-right / cutoff labels inside-left; y-labels shifted + X_INSET so markers clear the axis. Then the **per-item heatmap** ("מפת פריטים" toggle): rows = scored items in questionnaire order, columns = sessions chronologically (rendered reversed inside the RTL table so time flows LTR like the chart), cell fill = value/itemMax on the shared severity ramp — answers "which symptoms are moving". Heatmap requires the config questionnaire; toggle hidden otherwise.
**Files:** heatmap-model.js (new, pure + tests), trajectory-chart.js (toggle + render), store points gain answers, chart-model exports SEVERITY_RAMP, aggregate.css theme rewrite, session-detail rewrite, component restyles.
**Compact mode:** past 12 sessions the heatmap drops in-cell numbers and renders color chips (values in tooltips, headers thinned to ~8 with the newest always labelled) — a year of weekly sessions fits in the card with no horizontal scroll (verified: 20 columns at scrollWidth == clientWidth).
**Decisions referenced:** D-10, D-12.
**Test delta:** 1096 → 1118 unit; e2e 96 (structure unchanged). Includes D-13: pagination removed, full series always visible, padded time domain.

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
