# Idiographic / personalized measures — design exploration

**Status:** EXPLORATION. **Nothing here is decided.** Captured 2026-08-21 from a
design conversation so it can be picked up later.

This document deliberately violates `TODO.md`'s "no speculation" rule by living
outside it. Options considered live here; once a choice is made it moves to
`TODO.md` §4 as a numbered decision and the corresponding options section below
becomes dead weight — delete it then.

**Tracked as:** `TODO.md` §2 band `IDIO`.
**Depends on:** `P1-10` (repeated/duplicate questionnaire instances collide) for
anything multi-instance.

**Branch:** `main`. This plan is written around `top3` as the worked example, and
`top3.json` was pruned from the throwaway `ctr` POC branch (`e284581`) along with
the CPT worksheets, `scq`, `demographics`, and `anger_log` — so this work is not
merely *better* done on `main`, it cannot be done on `ctr` at all.

---

## 1. The problem

The original ask: *"add an option for a custom questionnaire encoded in the URL —
in particular idiosyncratic questionnaires such as a repeated top3."*

Two different needs hide under "custom questionnaire", and they want different
designs:

**(A) Ad-hoc instrument authoring.** A clinician invents a whole new scale
(items, options, scoring) and wants it without a repo commit. Content is
identical for every patient. This is really "a config file that isn't in the
repo".

**(B) Idiographic measures.** The *structure* is fixed and clinically vetted, but
the *content* is this patient's own words, captured in a prior session: top-3
problems, PSYCHLOPS, goal attainment scaling, CPT stuck points. Re-rated weekly.

**"Repeated top3" is squarely (B)**, and (B) is dramatically cheaper and safer
than (A). Decide which one is actually being bought before picking an encoding.

---

## 2. Encoding approaches considered

### 2.1 Full inline config — `?config=<base64url(deflate(JSON))>`

Encode an entire `QuestionnaireSet` in the URL; `loadConfig` gains a non-fetch
source type and runs the same AJV + `validateConfigData` path.

- **For:** maximal expressivity; no new authoring concepts; reuses the whole
  validation pipeline.
- **Against — security:** flips a switch the security model deliberately left
  off. `HANDOVER.md:309` describes the DSL caps as *"only reachable if external
  configs are ever enabled"*. Inline configs enable exactly that, plus `alerts`,
  plus `pattern` regexes in text items. Would need an *untrusted profile*:
  reject `formula`, `alerts`, `pattern`; cap item count and byte size; force an
  `x_` id prefix so a custom config can't shadow `phq9`.
- **Against — downstream:** `configFile` (`shared/config/loader.js:154`) is what
  the envelope records and what Aggregate keys trajectories on. Two patients'
  `custom1` are different instruments; the same patient's week-1 and week-2
  `custom1` are the same instrument only if the clinician re-pasted byte-identical
  JSON. Trajectory plotting quietly breaks.
- **Size:** Hebrew JSON is bulky. `CompressionStream('deflate-raw')` is
  dependency-free and helps, but anything real lands at 500–1500 chars — past
  comfortable QR territory.

### 2.2 Parameterized template — config server-side, URL carries only slots ⭐

Keep `top3` as a real, validated, CI-checked config file. Add placeholder slots
to its item text; the URL supplies values only.

- **For:** tiny URLs. Zero untrusted *structure* — only untrusted *strings*,
  which already flow safely through Lit escaping and the PDF. Scoring,
  `if`-branching, and interpretation stay clinically vetted and unit-tested.
  `configFile: "top3"` and item ids `p1`/`p2`/`p3` stay stable across sessions,
  so **Aggregate trajectories work for free** — and per-problem lines become
  possible, which is the actual clinical payoff.
- **Against:** only supports what the template anticipated. Needs a schema
  concept (`{{p1}}` interpolation in `text`, or an explicit `params` block) plus
  a composer form.
- **Two flavors to choose between:**
  - *Fixed arity* — N slots, blank ones skipped. `top3` already does this via
    `count(item.p2__text) >= 1` branching. Much less work; covers top3,
    PSYCHLOPS, stuck points.
  - *Variable arity* — a new `repeat`/`forEach` node instantiating a sub-block
    per supplied value, generating `p1`…`pN`. The general answer; buys
    goal-attainment lists of arbitrary length.

`rated_text` (added in `dae2874`) already gives the exact item shape these
measures need. What's missing is only substitution.

### 2.3 Deliberately-crippled mini-grammar

A terse purpose-built syntax rather than JSON:

```
?custom=slider:0-10:חרדה בפגישות|slider:0-10:הימנעות|text:מה עזר השבוע
```

- **For:** short; human-readable and inspectable by the clinician; *restricted by
  construction* — no way to express a formula or an alert, so the
  untrusted-config surface never opens.
- **Against:** a second authoring language to spec, test, and document; escaping
  Hebrew alongside `|`/`:`/`,` is fiddly; accretes warts the moment someone wants
  option sets or subscales. Same `configFile` identity problem as 2.1.

### 2.4 External config URL

The hook already exists — pass `allowedOrigins` at the `loadConfig` call site
(`shared/config/loader.js:36`, `HANDOVER.md` §6a).

Realistically a non-starter for this audience: the clinician must host JSON
somewhere; CSP `connect-src` widens; the fetch leaks the patient's session to a
third party; link rot silently kills the questionnaire mid-treatment. Recorded as
the escape hatch, not the plan.

### 2.5 Carry-forward from the prior PDF

Not an encoding — the piece that makes 2.2 usable in practice.

`buildEnvelope` embeds `sessionState.answers` as-is
(`shared/pdf/envelope-schema.js:34`, `:56-58`), so `p1__text` and every other
sidecar answer **is already sitting in every PDF ever generated**.
`aggregate/src/parse-pdf.js` reads it with zero dependencies.

Drop last week's PDF into the Composer → it pre-fills the slots → generates this
week's link. Kills the re-typing burden and *guarantees* item-id continuity,
which is what makes the trajectory chart correct rather than accidentally
correct.

### 2.6 Working recommendation (not a decision)

Build **2.2 + 2.5, fixed arity first.** Solves repeated top3 completely, keeps
URLs short, requires no relaxation of the security model, preserves the Aggregate
contract, and the composer work is a small form rather than a form builder.

Add **2.3** later as a restricted grammar if genuine demand for ad-hoc scales
appears. **2.1** only if someone needs scoring formulas — which is exactly where
the untrusted-config risk starts.

---

## 3. Composer UI design (for approach 2.2)

### 3.1 What the current shape assumes

Selection is `selected: string[]` (`composer/src/composer-store.js:26`) — an
ordered *set of ids*. Every derivation hangs off that: `toggle`, `reorder`,
`isSelected`, `selectedEntries()`, and
`buildUrl({selected, pid})` (`composer/src/composer-state.js:37`). The cart
renders one truncated line per id
(`composer/src/components/selection-cart.js:189`). Browse data comes only from
`catalog.json`; full configs are downloaded lazily and *only* for preview
(`composer/src/components/composer-app.js:140`).

Slot-filling adds per-selection **data**. That's the ripple to plan around.

### 3.2 Where the fill-in surface lives

| Option | Verdict |
|---|---|
| (a) Inline in the cart | **No.** Sidebar is 300px (`composer-app.js:68`), rows are single-line ellipsized. Three multi-line Hebrew descriptions don't fit; the mobile-bar sheet is worse. |
| (b) Dedicated dialog | **Yes.** `preview-dialog.js` already supplies the scaffolding — native `<dialog>`, `showModal`, backdrop-click close, full-screen on mobile (~`:73`), RTL. A slot form is simpler than that dialog. Room for a live preview and the PDF drop zone, both of which need space. |
| (c) A "step 2" screen | **No.** Over-engineered for what is usually 3 text fields; breaks the current browse↔cart rhythm. |

Chosen direction: **(b)**, plus a compact read-only *summary* in the cart row so
filled values are visible at a glance without opening anything.

### 3.3 Trigger timing

Not on select-click — it interrupts browsing and comparing, which is what card
clicks are for. Not silently deferred either — the clinician hits "העתק קישור"
and gets a dead button.

**Deferred but loud.** The card selects normally; the cart row immediately
renders an attention chip (`מלא 3 שדות`), and the URL box explains the block.
There is already an idiom for exactly this: `selection-cart.js:221` shows
`'הזינו מזהה מטופל כדי לקבל קישור'` when the pid is missing. Add the parallel
message and reuse the pattern — clinicians learn it once.

### 3.4 Flow

1. Click the `top3` card → selected, as today.
2. Cart row renders two lines: title, then either an amber `מלא 3 שדות ✎` chip or
   the filled summary `1. חרדה בפגישות · 2. שינה · 3. …` with an edit pencil. The
   `<li>` stays draggable, so reorder is untouched.
3. Chip opens `<slots-dialog>`: one labelled field per declared param, character
   counter, required markers, plus **"מלא מ-PDF קודם"**.
4. Live preview inside the dialog renders the actual item text the patient sees.
5. Close → URL rebuilds, copy button enables.

### 3.5 Data plumbing

**Catalog carries the param declarations.** Add to
`shared/catalog/build-catalog.js` a derived
`params: [{ key, label, required, maxLength }]` per entry. This is the
load-bearing choice: the slot form needs *only* those four things, so the
composer never downloads a config to fill slots — the "browse from the catalog
index alone" property survives. CI already enforces catalog freshness, so this is
a routine change.

**Store gets a sidecar map, not a reshaped `selected`:**

```js
params: {},  // { [pid]: { [entryId]: { [key]: string } } }
```

Keeping `selected` as `string[]` means `toggle` / `reorder` / `isSelected` /
`selectedEntries` and their tests are untouched. New surface: `setParam`,
`paramsFor(id)`, `slotsComplete(id)`, `pendingSlotIds()`.

**Key it by pid — this is clinical safety, not a nicety.** Without it, a
clinician who builds patient A's link, then edits the pid to patient B without
clicking reset, ships B a link containing A's problem descriptions. Nesting under
pid makes switching show empty fields and switching back restore the work —
correct by construction rather than by remembering to warn.

**Both output components change.** `selection-cart.js:213-214`
(`hasUrl = !!this.url && hasPid`) and the duplicated logic in `mobile-bar.js`
each need the pending-slots condition and the new row rendering. Two components,
two test files — **the real cost of this feature is here, not in the dialog.**

**`buildUrl` gains a third argument** and writes params into the *fragment*
alongside the pid — fragments never reach the request line, and problem
descriptions are far more sensitive than a pid. Expect the URL box (84px tall,
`break-all`, percent-encoded Hebrew) to look alarming; consider a shortened
display form with the full string still copied.

**Preview integration.** `buildPreviewModel(config, id)` should take params so the
preview shows personalized text — the clinician sees exactly what the patient
sees before sending. Small change, large payoff.

---

## 4. Cross-cutting constraints (whichever encoding wins)

- **Fragment, not query string.** The pid moved to `#pid=` specifically to keep
  it out of access logs and the `Referer` header (`HANDOVER.md` §6a). A patient's
  own description of their problems is more sensitive than a pid, and these links
  live in WhatsApp. `src/app.js:137` `readPid()` is the pattern to mirror.
- **Namespacing.** Reserve a prefix for URL-defined entities and have
  `validate:configs` reject it in real files, so a custom questionnaire can never
  shadow a prod id.
- **Envelope identity.** Beyond templates, `configFile` needs to carry a content
  hash of the custom definition, and `validateEnvelope` needs to handle it —
  otherwise Aggregate merges unrelated instruments sharing a name.
- **Immutability is a feature.** A URL-encoded questionnaire is a permanent
  snapshot: old PDFs stay reproducible with no server dependency. The cost is
  that fixing a typo means a new link.

---

## 5. Multi-instance: already half-built, blocked on P1-10

`orchestrator.js:116` keys sessions on
`sessionKey = node.instanceId ?? node.questionnaireId`, and the schema declares
`instanceId` (`QuestionnaireSet.schema.json:939`). **The engine and envelope
already support the same template appearing multiple times in one session.**

It is unreachable only because:
- `src/resolve-items.js:73` wraps tokens as `{ questionnaireId: token }`, never
  setting `instanceId`;
- `src/app.js:177` dedupes item tokens, so `items=top3,top3` collapses;
- the composer's `selected` is a set.

So "two independent goal lists in one session" is a URL-format change, not an
engine change — **but `P1-10` must land first.** P1-10 records the same substrate
from the other side: repeated instances share a session key, so filling one fills
all (`items=cpt_abc,cpt_abc,cpt_abc`), and re-served screeners arrive pre-filled.
Ship the composer half against an unfixed engine and duplicates silently collapse.

---

## 6. Open questions

1. **(A) or (B)?** Is the real requirement idiographic templates, ad-hoc scale
   authoring, or both? Everything else follows from this. → `IDIO-0`
2. **Fixed or variable arity** for templates? Fixed covers top3 and is far
   cheaper.
3. **Substitution syntax:** `{{p1}}` interpolation inside `text`, or an explicit
   `params` declaration block naming target items?
4. **Slot values in the PDF/envelope:** the phrases are already captured as
   `__text` answers when the patient sees them. Does the *template definition*
   also need recording, or is the answer trail enough?
5. **Character caps per slot** — needed to bound URL length. What is clinically
   sufficient? (top3 problem descriptions run long.)
6. **Does `top3` stay a worksheet** (reclassified in `48cc52a`) or become the
   first parameterized instrument?

---

## 7. Provenance

Derived from a design conversation on 2026-08-21. No code was written and no
decision was taken. Codebase references were verified against the `ctr` branch at
that date; re-check line numbers before relying on them.
