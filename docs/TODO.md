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

**Currently working on:** idle. Backlog refreshed 2026-08-21 — new `IDIO` band (idiographic measures; options in `docs/IDIOGRAPHIC_PLAN.md`), new `CONT` band (instrument content), plus `AGG-7` and `AGG-8`. Nothing started. If the idiographic stream is picked up, `IDIO-0` is the decision gate everything else waits behind.

**Last session ended:** 2026-08-21 — planning only, no code changed. State verified on `main`: HEAD `8455ced`, in sync with `origin/main`, working tree clean, `npm test` green at **1421 tests across 54 files**.

**AGG-6 is complete *and committed*** — the previous status ("awaiting commit approval… Not yet committed", dated 2026-07-06) was stale by seven weeks. A-11's work is on `main`, and the composer upgrade (Lit rewrite, catalog index, preview modal, Fuse.js search, help page, pins), the security-hardening pass, `rated_text`, the per-item `display` field, the four CPT worksheets, and STSS/CAPE/PQ-B all landed after it.

**Blocked on:** AGG-4 needs AGG-P (user's psychometrics literature pass). P0-1/P0-2/P0-7 validation cluster deprioritized by user 2026-07-03.

**Side branch — do not land work there:** `ctr` (`dcf8bce`) is a throwaway CTR proof-of-concept per `docs/CTR_PLAN.md` ("Throwaway. Not maintained." / "Zero commits on `main`"). It is never merged, and it prunes ten configs from `public/configs/prod/`. All work in this document targets `main`.

---

## 2. Task List

Task IDs are stable and match `REVIEW.md` section references. Status values: `todo` | `in-progress` | `done` | `blocked` | `deferred` | `abandoned`.

**All work in this document targets `main`.** The `ctr` branch is a throwaway POC
(`docs/CTR_PLAN.md`: "Throwaway. Not maintained." / "Zero commits on `main`") — it
is not a place to land features, fixes, or content. It also pruned ten configs
from `public/configs/prod/` in `e284581` (`scq`, `top3`, the four CPT worksheets,
`demographics`, `anger_log`, and two test fixtures), so some tasks cannot even be
started there.

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
| AGG-5 | Slice 4 — PNG/SVG export | done | See archive A-10. |
| AGG-6 | Design dive: aggregate visual refresh + clinician shell integration | done | See archive A-11. D-15/D-16/D-17 applied. |
| AGG-P | Psychometrics content: reliability/SD/source per instrument | todo | **User-owned clinical workstream** — can start now; long pole for AGG-4 |
| AGG-7 | Sort questionnaires in the aggregate by number of applications | todo | Small. Most-administered instrument first, so the chart a clinician cares about is at the top instead of in config/upload order. Ordering lives in the composition root (`aggregate/src/aggregate.js`), which already computes the shared x-domain per D-14 — count sessions per `questionnaireId` in the pid-filtered set and sort descending. Open: tie-break (most-recent? alphabetical?), and whether the order should be stable as new PDFs are dropped in mid-session. |
| AGG-8 | Capture and report time spent answering | todo | **Spans three layers.** (1) Capture: nothing times anything today — no `Date.now()` in orchestrator/engine/controller. Decide the grain (per item / per questionnaire / per session) and how to handle a patient who leaves the tab open. (2) Carry: new envelope field; `validateEnvelope` already tolerates unknown extra fields (forward-compatible by design), so this is **additive — no `ENVELOPE_VERSION` bump** — but every historical PDF lacks it, so readers must handle absence. (3) Report: PDF and/or aggregate. Purpose per user: see response burden on patients, so per-questionnaire is probably the useful grain. Privacy note: duration is behavioural data about the patient — decide deliberately whether it belongs in the PDF the patient sees. |

### IDIO — Idiographic / personalized measures (docs/IDIOGRAPHIC_PLAN.md)

Custom questionnaires encoded in the URL, with patient-specific content (repeated
top3, PSYCHLOPS, goal attainment, CPT stuck points). **Nothing is decided** —
options and trade-offs live in the plan doc; IDIO-0 is the decision gate and
everything else is blocked behind it. Working recommendation in the plan:
parameterized templates (config stays server-side, URL carries only slot values)
plus carry-forward of slot values from the previous session's PDF.

| ID | Title | Status | Notes |
|---|---|---|---|
| IDIO-0 | Decide the encoding: parameterized template vs inline config vs mini-grammar | todo | **Decision gate.** Options in plan doc §2; open questions in §6. Produces a D-N entry. |
| IDIO-1 | Schema: param slots + text substitution | todo | Blocked on IDIO-0. Fixed vs variable arity is open (plan §2.2). Follow the `schema-change` skill's validator-regeneration chain. |
| IDIO-2 | Catalog: derive `params[]` in `shared/catalog/build-catalog.js` | todo | Blocked on IDIO-1. Keeps the composer's "never download full configs" property (plan §3.5). |
| IDIO-3 | Composer: slots dialog + cart row states + pid-keyed param store | todo | Blocked on IDIO-2. Plan §3. Real cost is `selection-cart.js` **and** `mobile-bar.js` + both test files, not the dialog. Params must be keyed by pid — otherwise patient B gets patient A's problem descriptions. |
| IDIO-4 | Carry-forward: pre-fill slots from the prior session's PDF | todo | Blocked on IDIO-3. Reuses `aggregate/src/parse-pdf.js`; the `__text` sidecars are already in every PDF ever generated (`envelope-schema.js:34`). This is what makes the feature actually get used. |
| IDIO-5 | Multi-instance templates in one session | todo | **Blocked on P1-10** (same substrate). Engine + envelope already support it via `instanceId`; unreachable from the URL/composer. Plan §5. |

### CONT — Instrument library / clinical content

Config-only work: no application code. Use the `add-questionnaire` skill
(psychometrics lookup → Hebrew translation → proofread → validate → review) and
`public/configs/CONTRIBUTING.md`. Every row needs `npm run build:catalog` +
committed `catalog.json`, and must respect the §Policy rule in `HANDOVER.md` —
free for non-commercial research/clinical use only.

| ID | Title | Status | Notes |
|---|---|---|---|
| CONT-1 | SCQ should be 0-based | todo | Currently 22 items scored 1–5 (per `HANDOVER.md` §Instrument library); rescore to 0-based. Check what moves with it: option values, `scoring`, any `interpretations.ranges`, and the total's meaning. Hebrew translation is already flagged unvalidated and there are no validated cutoffs, so no published norm is being contradicted — but record *why* 0-based is right in the config's provenance/notes so it isn't flipped back. Bump the config `version`. |
| CONT-2 | Add PTCI-9 | todo | Short form of the 37-item `ptci` (3 subscales, mean, `totalMethod: sum_of_items`). **Design question shared with CONT-3:** separate config file (`ptci9`) duplicating item text, vs. deriving a short form from the parent. Item IDs are addresses and one entity lives per file, so separate file is the grain the system expects — the cost is that the Hebrew wording of shared items can drift between the two. Decide once, apply to both rows. |
| CONT-3 | Add PCL-5 4-item and 8-item short forms | todo | **Source (user-specified):** https://www.sciencedirect.com/science/article/pii/S0165178115300664 — *Psychiatry Research*, paywalled. **User will supply the paper at implementation time.** Take the item subsets, scoring, and cutoffs from it directly — do not infer which PCL-5 items belong to each short form, and do not carry over the parent's ≥ 33 alert or its interpretation bands. Parent `pcl5` is 21 items (20 scored + instructions), 4 sum subscales. Same separate-file-vs-derived question as CONT-2. |

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
| P1-10 | Repeated/duplicate questionnaire instances collide | todo | **Not urgent, but don't postpone too long. Report to ASHER when fixed.** Two related problems from session state being keyed by `sessionKey = node.instanceId ?? node.questionnaireId`: **(a)** if a run yields a screener *and* the questionnaire it gates to (battery or `items=`), the questionnaire can be served twice — and the second time it's **pre-filled** from the first (same key). For a screener re-serve this makes no sense. **(b)** Asking for N copies of the same questionnaire — e.g. `items=cpt_abc,cpt_abc,cpt_abc` (ABC×3, a real CPT-worksheet use case) — collapses to one shared instance, so they're "the same" (filling one fills all). Fix direction: auto-assign distinct instance keys for repeats (`cpt_abc#1`, `#2`, …) so each is independent, and dedupe/skip an instance that's already answered where re-serving is meaningless (screener). Surfaced 2026-07-26 during CPT worksheet authoring. **Blocks IDIO-5** — multi-instance idiographic templates sit on this same substrate; see `docs/IDIOGRAPHIC_PLAN.md` §5. Note `src/app.js:177` also dedupes item tokens, so the URL layer needs the same fix. |

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
| P2-10 | Worksheet PDF: block rendering instead of response table | done | Resolved 2026-07-28 via a **per-item** `display` field (the preferred option). `"display": "block"` on a `select`/`binary`/`slider` item renders it as a standalone prompt+answer block instead of a response-table row (`buildSliderBlock` / `buildChoiceBlock` in `report.js`); default `"table"` leaves all existing instruments unchanged. Schema `$defs/display` + regenerated validator; docs in CONFIG_SCHEMA_SPEC §5.5a + LLM_GUIDE. Used by `cpt_alternative` (`rerate`); all-`rated_text`/`text` worksheets (cpt_abc/exploring/patterns, top3) already block-render with no field needed. |

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

### D-15 — Clinician shell: shared navbar + shared styles as a CSS-string module
**Date:** 2026-07-06
**Context:** AGG-6 expanded scope. Composer and aggregate had near-identical copy-pasted navy headers with no navigation between surfaces; control vocabularies had fully diverged (composer: `.c-btn` system; aggregate: underlined text links). Aggregate components are shadow-DOM Lit, so a plain shared stylesheet cannot reach them.
**Decision:**
1. One shared header component (`shared/ui/`) used by composer + aggregate: navy bar, brand, nav links (מחולל קישורים / סיכום מטופל) with the active page marked, built to absorb future עזרה/אודות pages. Landing keeps its own marketing nav (different job) but aligns palette and links.
2. Shared clinician styles live as a **plain CSS string in a JS module**: light-DOM surfaces adopt via `document.adoptedStyleSheets`; Lit components via `unsafeCSS` in `static styles`. Single source of truth, no bundler magic, works under vitest, CSP-safe.
3. Class names keep the existing `c-` prefix (now reading "clinician-"), so the composer migrates with zero churn; the shared sheet contains component classes only (header/nav, buttons, segmented control, card) — `@font-face`, resets, and page layout stay in each surface's own CSS (constructed stylesheets ignore `@font-face` in Chromium).
4. Composer stops importing the patient app's `main.css`; the few rules it used (font-face, reset, base) move into its own CSS. Tokens for the header navy (previously `#1B3148` hardcoded twice) and card/chart colors (previously aggregate-local `--a-*`) move into `shared/styles/tokens.css`.
**Rejected alternative:** converting aggregate components to light DOM so one stylesheet styles everything — bigger refactor, breaks component encapsulation and existing shadow-root tests, buys nothing the CSS-string module doesn't.
**Same-day amendment:** the shared code lives in `clinician/` — not `shared/ui/` — and clinician tokens live in the clinician styles module, not `tokens.css`. Discovered post-decision: `CODE_ORGANIZATION.md` §3.2 already reserves `clinician/` for exactly this ("cross-surface but clinician-only", sketching `clinician-nav.js`), and the eslint boundary rules + vitest include patterns already cover it. `shared/` stays patient+clinician only. The nav is a Lit component per the §3.2 sketch (Lit reaches the composer bundle as a Rollup-shared chunk; no budget pattern matches composer and total has headroom).

---

### D-16 — Chart-card controls: segmented view switcher + export cluster in the card header
**Date:** 2026-07-06
**Context:** AGG-6 original trigger. The card footer had five underlined text-links (table toggle, heatmap toggle, copy, PNG, SVG) plus a pid checkbox.
**Decision:**
1. Card header row: title (start) + segmented control **[גרף | מפת פריטים | טבלה]** + export cluster (end). Footer row deleted.
2. **Views are mutually exclusive** (user-approved behavior change — previously table and heatmap could be open simultaneously). מפת פריטים segment appears only when the config questionnaire is available (same rule as the old toggle).
3. Export cluster: העתקה stays a directly visible button (it is the primary action per spec §6 — the Safari gesture constraint also forbids burying it behind an async menu); PNG / SVG / the pid opt-in checkbox collapse into a compact "ייצוא ▾" menu.
4. Card recipe: content panels keep the aggregate's 12px radius + border; controls use 6px — "easy to change later" per user.
**Scope impact:** trajectory-chart internal state (`_showTable`/`_showHeatmap` → one `_view`), e2e selector updates, AGGREGATE_SPEC §5.6/§6 control-layout wording.

---

### D-17 — Aggregate goes public by linking, not by deploying
**Date:** 2026-07-06
**Context:** TODO §1 said the aggregate surface was "local by user choice." Inspection showed it has been live at `/madad/aggregate/` since AGG-2 merged — the Pages workflow ships all of `dist/` and aggregate is a build input. It was unlisted, not undeployed.
**Decision:** The public unveiling = adding navigation links (shared navbar cross-links + landing nav/footer). No deploy-pipeline change. User approved 2026-07-06.

---

## 5. Task Archive

### A-11 — AGG-6 Clinician shell integration + chart-card control redesign
**Completed:** 2026-07-06
**Summary:** One design language across clinician surfaces. New `clinician/` layer (the reserved CODE_ORGANIZATION §3.2 slot): `<clinician-nav>` Lit navbar (brand → landing, מחולל קישורים / סיכום מטופל links, active page marked, subtitle slot) replacing the copy-pasted composer/aggregate navy headers, and `clinician-styles.js` — the shared vocabulary (clin tokens, `.c-btn` family promoted from composer.css, new `.c-seg` segmented control, `.c-card`) as a CSS-string module adopted via `document.adoptedStyleSheets` (light DOM) / `unsafeCSS` (shadow DOM) per D-15. Chart card per D-16: header row = title + segmented [גרף | מפת פריטים | טבלה] (mutually exclusive views; heatmap segment only with config questionnaire) + export cluster (העתקה button + native-`<details>` ייצוא menu holding PNG/SVG/pid; closes on view switch/Escape/focus-out); underlined-link footer deleted. Composer no longer imports patient `main.css` (own font-face/reset/base). Aggregate container widened 880 → 1024 to align with the nav/composer. Landing palette aligned to app tokens (teal `#1A9FAD`, navy `#1B3148`, text/muted from tokens) and its nav + footer link the aggregate — the de-facto public unveiling per D-17 (surface was already deployed, just unlisted). Lint script now covers `clinician/`.
**Files:** clinician/{components/clinician-nav.js + test, styles/clinician-styles.js} (new), composer/{index.html, src/composer.{js,css}, src/composer-render.js}, aggregate/src/{aggregate.{js,css}, chart/trajectory-chart.js + test, components/* (--a-* → --clin-* tokens)}, landing/index.html, tests/e2e/{composer,aggregate,dist-smoke} selector updates, docs/AGGREGATE_SPEC.md §5.6/§6, package.json (lint).
**Decisions referenced:** D-15, D-16, D-17.
**Test delta:** 1144 → 1148 unit; e2e 110 total (101 passed / 9 capability-skips). Size budgets green (Lit split into a shared chunk; composer +Lit stays within total).

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

### A-10 — AGG-5 Aggregate slice 4: PNG/SVG image export
**Completed:** 2026-07-05
**Summary:** Spec §6 image export. `export-svg.js` (pure, node-tested like chart-model) builds a standalone 800×500 SVG document — reuses `buildChartModel` with the chart's shared x-domain (D-14: the export shows what the clinician saw) but stamps literal light-theme colors, since an exported file has no page stylesheet to resolve CSS vars. Framing per spec: instrument title + date range header, generation timestamp + "מדד" footer — always; patient name — never representable (builder has no name input); pid — opt-in checkbox, default off, offered only when *every* charted point shares one pid (`uniquePid`; a mixed chart must not carry one patient's id). `export-image.js` is thin browser glue: SVG blob download, or blob-URL → `Image` → canvas at 2× (1600×1000 px) → `toBlob` PNG — no data leaves the device. Per-chart footer controls: "ייצוא תמונה: העתקה / PNG / SVG". Filename `madad-{questionnaireId}-{yyyy-mm-dd}.{ext}`.
**Copy to clipboard (user addition, primary action — spec §6 revised):** "העתקה" rasterizes the same PNG and puts it on the clipboard with transient "הועתק ✓" feedback; the dominant sharing flow is paste-into-email/chat, not file management. Safari gesture rule honoured: the `ClipboardItem` is constructed synchronously with the *pending* blob promise (an await before `clipboard.write` voids the user gesture in WebKit). Button hidden when the async Clipboard API is unavailable.
**Not included:** the §6 "subscale lines" export option — moot until AGG-4 ships subscale rendering; add it to the export controls then.
**Files:** chart/export-svg.js + tests (new), chart/export-image.js (new), trajectory-chart.js (controls + `_export`), aggregate e2e export tests (SVG content contract incl. pid opt-in; PNG magic-byte + size check pinning the rasterization path in chromium and webkit).
**Decisions referenced:** D-10, D-14.
**Test delta:** 1118 → 1144 unit; e2e 104 → 110 (export download tests × 2 browsers + clipboard test, chromium-only — Playwright can't grant clipboard permissions in WebKit). `export-image.js` has no unit coverage by design (pure browser API glue) — the e2e PNG + clipboard tests are its guard.

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
