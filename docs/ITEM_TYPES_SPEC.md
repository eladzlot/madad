# Item Types Spec
**Version:** 1.2
**Status:** Current — all documented item types are implemented. The `composite` type is archived at the bottom of this document as a future design sketch — it is not implemented and should not be referenced in configs.
**Scope:** Item types beyond `select`, `binary`, and `instructions`

---

> **Reading guide:** The main spec below covers all live item types. The archived `composite` design (end of document) is not implemented — skip it unless planning future work on that type.

---

## Part I — Systems Architect

### 1. Problem Statement

The platform currently supports two answerable item types: `select` (numeric scale) and `binary` (yes/no). Both produce a single numeric value. This assumption is embedded throughout the system — in the scoring engine, the DSL, the PDF renderer, and the schema validator.

The goal is to expand the type vocabulary to include:

- **`text`** — free-text input (single line or multiline), with optional format validation
- **`slider`** — continuous or stepped numeric input with explicit range
- **`select`** — choose one from a list (visual alternative to select)
- **`multiselect`** — choose zero or more from a list
- **`composite`** — a list of options where each selected option spawns a sub-item (e.g. "which meals did you eat, and what did you eat at each")

The design must accommodate all of these without breaking existing instruments, and must be extensible enough that future types can be added by touching only one place.

---

### 2. Core Design Principle: The Type Registry

Every item type has four cross-cutting concerns:

| Concern | Current location |
|---|---|
| UI rendering | `controller.js` (`TAG_BY_TYPE`), component files |
| Scoring participation | `scoring.js` (`isAnswerable`) |
| PDF row rendering | `report.js` (`buildItemRow`, `calcRiskLevel`) |
| Config validation | `config-validation.js`, `QuestionnaireSet.schema.json` |

Currently each concern is handled by its own ad-hoc `type === 'select'` conditional. Adding a type means touching all four files independently, with no central record of what a type is supposed to do.

**The registry** is a single module, `src/item-types.js`, that declares the complete contract for each type. Every concern queries this registry instead of embedding type checks. Adding a type means adding one entry to the registry.

#### 2.1 Registry entry shape

```js
{
  // Required
  type: 'text',                    // string key — must match item.type in config

  // Rendering
  tag: 'item-text',                // custom element tag name
  autoAdvance: false,              // whether selection auto-advances (true for select/binary)

  // Answer model
  answerShape: 'scalar',           // 'scalar' | 'array' | 'object'
  defaultValue: null,              // value used to initialise the item if re-entered

  // Skippability
  skippableDefault: true,          // whether unanswered = valid to advance past
                                   // can be overridden per-item by item.required

  // Scoring
  contributesToScore: false,       // whether engine.scoring counts this type

  // Answer shape — used by canAdvance()
  answerShape: 'scalar',           // 'scalar' | 'array' | 'object'
}
```

#### 2.2 Answer shapes

All current item answers are scalars. The new types introduce two additional shapes:

**`scalar`** — a single primitive value (number, string, or boolean). All existing types use this. Slider, text, and select also use this.

**`array`** — an ordered array of values. Used by `multiselect`. Example: `['breakfast', 'lunch']`. An empty array `[]` is a valid answer (zero selections is valid for multiselect).

**`object`** — a map of sub-item IDs to their answers. Used by `composite`. Example:
```json
{ "breakfast": "oatmeal and fruit", "lunch": null }
```
The outer item ID stores the object. The sub-answers are embedded within it, not stored separately in `engine.answers()`. This is the key decision that avoids polluting the top-level answer store with ephemeral sub-items.

#### 2.3 PDF renderers

The PDF response table currently assumes all rows are `(#, itemText, label, numericValue)`. New types need different layouts. A `PDF_RENDERERS` map provides a named renderer per type:

| Renderer key | Layout | Used by |
|---|---|---|
| `'scored'` | `# | text | label | value` — current layout | `select`, `binary`, `slider`, `select` |
| `'text'` | Rendered outside the response table entirely. The item text appears in bold, the answer appears below it in normal weight. Both wrap freely. No row in the scored table. | `text` |
| `'multiselect'` | `# | text | [checked labels, stacked vertically] | —` | `multiselect` |
| `'composite'` | `# | text` header row, then indented sub-rows one per selected option | `composite` |
| `'unscored'` | `# | text | answer | —` — no value column | fallback for unscored scalars |

The PDF section builder iterates items and calls the appropriate renderer via lookup. The renderer returns one or more pdfmake content blocks. Renderers that return multiple blocks (composite, text-outside-table) return `Array` — the section builder splices them into the content stream.

Instructions items are printed in the PDF as plain paragraph text, slightly muted, before the response table. This gives the clinician the full context the patient saw.

Text answers must never be truncated. The `text` renderer uses a single cell with `noWrap: false` and no height constraint. pdfmake will expand the row height as needed.

#### 2.4 Skip and required semantics

The current system has one implicit rule: every non-instruction item must be answered before the patient can advance. The new types require a more nuanced model.

**Item-level `required` field** (added to schema for all answerable types):

```json
{ "id": "q1", "type": "text", "text": "...", "required": true }
```

Default values per type (from registry `skippableByDefault`):

| Type | Default | Rationale |
|---|---|---|
| `select` | required | Clinical scale — missing items corrupt the score |
| `binary` | required | Same |
| `slider` | required | Numeric — skipping breaks scoring |
| `select` | required | Equivalent to select |
| `text` | **skippable** | Free-text is supplemental; shouldn't block |
| `multiselect` | **skippable** | Zero selections is a valid answer |
| `composite` | **skippable** | Sub-answers depend on which options are selected |

The controller resolves `canAdvance(item)` as:
```js
const required = item.required ?? TYPE_REGISTRY[item.type].skippableByDefault === false;
if (!required) return true;
return engine.answers()[item.id] != null;
```

For `multiselect`, `null` means "not yet seen", `[]` means "actively answered with zero selections" — both should allow advance (multiselect is skippable by default), but a config author can set `required: true` to force at least one selection. In that case `canAdvance` checks `Array.isArray(answer) && answer.length > 0`.

For `composite`, `null` means unseen; `{}` means seen and all sub-items left blank. Required composite means at least one option must be selected.

#### 2.5 Alerts and DSL

**Text and composite items** are excluded from the DSL evaluation context — their values are strings or nested objects that have no meaningful comparison.

**Multiselect items** are exposed in the DSL context as their raw `number[]` value (1-based indices of selected options). Two DSL functions support multiselect:

| Expression | Meaning |
|---|---|
| `count(item.symptoms) > 4` | More than 4 options selected |
| `count(item.symptoms) == 0` | Nothing selected |
| `checked(item.symptoms, 2)` | The second option (1-based) was selected |

`count(ref)` — returns `ref.length` if ref is an array, `1` if ref is a non-null scalar, `0` if null/undefined.

`checked(ref, n)` — returns `true` if `ref` is an array containing the integer `n`. `n` is a 1-based position. Both arguments use the existing numeric literal token — no DSL tokeniser changes required.

Config validation checks that `n` in `checked()` calls is within bounds for the referenced item's option count. Out-of-bounds is a static error. Wrong-but-in-bounds (after an option reorder) is not detectable statically — this is an accepted trade-off for simplicity.

`count` and `checked` are reserved words and cannot be used as item IDs.

**DSL context construction** in `engine.buildContext()`:

```js
function buildContext() {
  const itemContext = {};
  for (const [id, val] of Object.entries(_answers)) {
    const item = questionnaire.items.find(i => i.id === id);
    if (!item) continue;
    const typeDesc = TYPE_REGISTRY[item.type];
    if (typeDesc.answerShape === 'scalar' && typeDesc.answerIsNumeric) {
      itemContext[id] = val;           // numeric scalars: select, binary, slider, select
    } else if (typeDesc.answerShape === 'array') {
      itemContext[id] = val ?? [];     // multiselect: exposed as number[]
    }
    // 'object' (composite) and non-numeric scalars (text) are not exposed
  }
  return {
    item: itemContext,
    subscale: _scoreResult?.subscales ?? {},
  };
}
```

#### 2.6 New item type definitions

##### `text`
```json
{
  "id": "notes",
  "type": "text",
  "text": "הערות נוספות",
  "inputType": "multiline",
  "required": false
}
```

`inputType` values: `"line"` (default, single line), `"multiline"`, `"number"`, `"email"`.

For `inputType: "number"`, optional `min` / `max` / `step` fields provide range constraints validated at input time (not schema validation — user-facing error messages in the component).

Answer value: string (or null if skipped). Never contributes to scoring. Never in DSL context.

##### `slider`
```json
{
  "id": "pain",
  "type": "slider",
  "text": "דרגת הכאב",
  "min": 0,
  "max": 10,
  "step": 1,
  "labels": { "min": "ללא כאב", "max": "כאב קשה מאד" }
}
```

Answer value: number. Contributes to scoring exactly like select. `reverse` and `weight` are supported. `required: true` by default (same as select). No `options` — scoring uses the raw numeric value directly. Risk highlighting: top 20% of range = high, top 40% = med.

##### `select`
```json
{
  "id": "mood",
  "type": "select",
  "text": "מצב הרוח הכללי",
  "options": [
    { "label": "מצוין", "value": 4 },
    { "label": "טוב",   "value": 3 },
    { "label": "סביר",  "value": 2 },
    { "label": "גרוע",  "value": 1 }
  ]
}
```

The `select` type is a single-choice question rendered as a vertical card list. Shares the `scored` PDF renderer.

##### `multiselect`
```json
{
  "id": "symptoms",
  "type": "multiselect",
  "text": "אילו תסמינים חווית?",
  "options": [
    { "label": "כאבי ראש"   },
    { "label": "עייפות"     },
    { "label": "חרדה"       },
    { "label": "נדודי שינה" }
  ]
}
```

Answer value: `number[]` — the 1-based indices of selected options. An empty array `[]` is a valid answer. Default: skippable.

Multiselect options have only a `label` field — no `value`, no `id`. Identity is positional. This avoids the need for string literals in the DSL and keeps the option definition minimal. The 1-based convention matches clinical instrument numbering conventions.

**Multiselect items never contribute to questionnaire-level scoring.**

##### `composite`
```json
{
  "id": "meals",
  "type": "composite",
  "text": "אילו ארוחות אכלת היום?",
  "options": [
    { "label": "ארוחת בוקר", "value": "breakfast" },
    { "label": "ארוחת צהריים", "value": "lunch" },
    { "label": "ארוחת ערב", "value": "dinner" }
  ],
  "subItem": {
    "type": "text",
    "text": "מה אכלת?",
    "inputType": "line"
  }
}
```

Answer value: `{ [optionValue]: string | null }` — a map from selected option values to their sub-item answers. Only selected options appear in the map. Unselected options are absent.

The sub-item's type is always `text` in v1. Future: `subItem.type` could be `slider`, `select`, etc.

The composite item is treated as a single item in the sequence — one screen for option selection, then one screen per selected option for sub-items, all before advancing to the next item. The engine handles this as a single logical item; the composite component manages its own internal multi-step state.

Composite items never contribute to questionnaire-level scoring.

---

### 3. What Does Not Change

- **Engine answer storage**: `_answers[itemId] = value`. The value may now be a string, array, or object — but it's still keyed by item ID. No structural change to engine.
- **Session state shape**: `{ answers, scores, alerts }`. The `answers` map now contains mixed-type values, but the shape is identical.
- **Battery sequencing**: composite items are a single item in the sequence; no change to orchestrator or sequence-runner.
- **DSL**: unchanged. Only sees numeric scalar values.
- **Alert evaluation**: unchanged. Only fires on DSL-visible (numeric scalar) values.

---

### 4. Data Flow for New Types

```
Config JSON
  └─ item.type → TYPE_REGISTRY lookup
       ├─ validation rules (schema + semantic)
       ├─ component tag → controller mounts correct element
       ├─ scoring flag → scoring.js includes/excludes
       ├─ skippable flag → controller canAdvance logic
       └─ pdf renderer → report.js renders correct row layout
```

---

---

## Archived — composite type (not implemented)

> The following section is a design sketch for a `composite` item type that was planned but never implemented. It is preserved here for future reference. Do not use `composite` in configs — the schema does not support it and the engine will throw.

## Part II — Lead Developer (archived)

### 5. Exact Changes Required, By File

#### 5.1 `src/item-types.js` — NEW FILE

The registry. Exports:
- `isScored(item)` — replaces all `type === 'select' || type === 'binary'` checks
- `autoAdvances(item)` — whether the component auto-advances after answer
- `isSkippable(item)` — default skip/require behaviour, respecting `item.required` override
- `canAdvance(item, answer)` — full logic including required override and array/object check
- `tagForType(type)` — custom element tag for this item type

The registry itself is not exported — callers go through the helper functions. (An earlier plan exposed `getType`, `isNumericAnswer`, and a `pdfRenderer` key, but those were never used in practice — the PDF renderer in `src/pdf/report.js` branches on `item.type` directly.)

This is the only file that needs to change when a new type is added (plus the component and PDF renderer for that type).

#### 5.2 `QuestionnaireSet.schema.json`

Add new item `$defs`: `textItem`, `sliderItem`, `selectItem`, `multiselectItem`, `compositeItem`.

Add `required` field (boolean, optional, default per type) to all answerable item defs.

Add `sliderItem` fields: `min` (number, required), `max` (number, required), `step` (number, optional), `labels` (object with optional `min`/`max` string fields).

Add `textItem` fields: `inputType` (enum: `"line"`, `"multiline"`, `"number"`, `"email"`, default `"line"`), `min` (number, for `inputType: "number"`), `max` (number), `pattern` (string regex, for `"line"`).

Add `multiselectItem` fields: `options` (same `optionList` def), `scoring` (enum: `"sum"`, `"count"`, optional).

Add `compositeItem` fields: `options` (array of `{label, value}` where value is string not number), `subItem` (inline sub-item definition, v1: only `text` type).

**Important:** composite option values are strings (identifiers), not numbers — the `optionList` def requires `value: number`. Composite needs its own option list def: `compositeOptionList` with `value: string`.

#### 5.3 `src/config/config-validation.js`

Add `validateItem` dispatch: loop items, call `TYPE_REGISTRY[item.type].validateItem(item, q, errors)` if defined.

Current `checkItemOptions` hardcodes `type === 'select' || type === 'binary'`. Replace with `isScored(item) && hasOptions(item)` — or better, let each type's `validateItem` handle its own option validation.

Add slider validation: `min < max`, `step > 0 if defined`, `step divides (max-min) evenly` (warning, not error).

Add composite validation: sub-item type is `"text"` in v1 (error if anything else).

#### 5.4 `src/engine/scoring.js`

Replace `isAnswerable`:
```js
// Before
function isAnswerable(item) {
  return item.type === 'select' || item.type === 'binary';
}

// After
import { isScored } from '../item-types.js';
function isAnswerable(item) {
  return isScored(item);
}
```

Multiselect items are not scored (`contributesToScore: false` in registry) so they never enter the scoring path. No other changes needed here — slider and select produce numeric scalar answers and flow through the existing sum/average/subscale logic unchanged.

#### 5.5 `src/engine/engine.js`

`answers()` comment currently says `{ [itemId]: number }`. Update to `{ [itemId]: any }`.

`buildContext()` updated as described in §2.5 — numeric scalars and arrays are exposed, strings and objects are not.

#### 5.6 `src/engine/dsl.js`

Add two new functions to the DSL function dispatch. Both use the existing numeric literal token — no tokeniser changes required.

**`count(ref)`**
```js
if (name === 'count') {
  if (args.length !== 1) throw new DSLArgumentError('count', 'requires exactly 1 argument', expression);
  const val = args[0];
  if (Array.isArray(val)) return val.length;
  return val != null ? 1 : 0;
}
```

**`checked(ref, n)`**
```js
if (name === 'checked') {
  if (args.length !== 2) throw new DSLArgumentError('checked', 'requires exactly 2 arguments', expression);
  const [collection, n] = args;
  if (!Array.isArray(collection)) return false;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new DSLTypeError('checked second argument must be a positive integer', expression);
  }
  return collection.includes(n);
}
```

Add `count` and `checked` to the reserved ID list. Add out-of-bounds validation to `config-validation.js`: parse `checked()` calls in alert conditions and verify the index ≤ the referenced item's option count. Update `LLM_GUIDE.md` with multiselect examples and the 1-based convention.

#### 5.6 `src/controller.js`

**`TAG_BY_TYPE`** — add new types. This is already the right pattern.

**`canAdvance(item)` logic** — currently hardcoded as `hasAnswer && !isComplete`. Replace with:
```js
import { canAdvance as typeCanAdvance } from './item-types.js';
const answer = _engine.answers()[item.id];
_shellEl.canGoForward = typeCanAdvance(item, answer) && !_engine.isComplete();
```

**`autoAdvance` in `onAdvance`** — currently 150ms delay for all types, 0 for instructions. Replace with:
```js
import { autoAdvances } from './item-types.js';
const delay = autoAdvances(item) ? ADVANCE_DELAY_MS : 0;
```

Wait — auto-advance is triggered by the `answer` event, not the `advance` event. For text inputs, the `answer` event fires on every keystroke; we do NOT want to auto-advance on that. The actual behaviour: if `autoAdvances(item)` is false, the component should not fire `advance` on selection — it should require an explicit submit action. So auto-advance is a component-level concern, not a controller concern. The controller's delay is only relevant for components that do fire `advance` immediately after `answer`. Document this in the component contract.

**`onAnswer`** — currently records any value. For multiselect, the value will be an array. For composite, an object. `recordAnswer` accepts `any` — no change needed. The controller must update the `selected` property on the component:
```js
el.selected = e.detail.value;
```
This already works — it's just that now `selected` might be an array or object. Components must handle their own type of value.

#### 5.7 `src/pdf/report.js`

**Add `PDF_RENDERERS` map:**
```js
const PDF_RENDERERS = {
  scored:      buildScoredRow,      // existing buildItemRow logic
  text:        buildTextRow,
  multiselect: buildMultiselectRow,
  composite:   buildCompositeRows,  // returns array of rows
  unscored:    buildUnscoredRow,
};
```

**`buildQuestionnaireSections`** — currently calls `buildItemRow` for every answerable item. Replace with a type-based dispatch:
```js
// report.js branches directly on item.type rather than going through a registry key.
// The dispatch is kept inline because there are only a handful of types and the
// renderers have different return signatures (single row vs array of rows).
if (item.type === 'instructions') return renderInstructions(item);
if (item.type === 'text')         return buildTextBlock(item, answer);
if (item.type === 'multiselect')  return buildMultiselectBlock(item, answer);
// scored types (select, binary, slider) fall through to the shared item row
rowNum++;
tableRows.push(buildItemRow(item, rowNum, answer, questionnaire));
```

**`buildTextRow`** — two visible columns: `#` and item text as usual, then the answer spans the full remaining width in a wrapped cell. Column widths: `[COL_NUM, *]` (dynamic). This requires the text row to define its own `widths` — which means the response table can't be a single table with fixed `COL_WIDTHS`. See §6 (Breaking Change) below.

**`buildMultiselectRow`** — single row with checked labels joined by `، ` (Hebrew list separator) or stacked vertically in the label cell.

**`buildCompositeRows`** — one header row (item text, no answer), then one indented row per selected option showing `optionLabel: subAnswer`.

#### 5.8 `src/pdf/report.js` — Breaking Change: Mixed-Width Table

The current response table is a single pdfmake table with fixed `COL_WIDTHS = [COL_SCORE, COL_LABEL, COL_TEXT, COL_NUM]`. This works because every row has the same 4 columns.

Text rows need different column widths. Two strategies:

**Option A: Separate tables.** Each "row" is actually a separate mini-table, and rows are stacked with no visible gap. Visual borders must be managed carefully to appear continuous.

**Option B: Colspan via nested table.** pdfmake does not support `colspan` natively, but a cell can contain an inner table. The text answer cell contains an inner single-cell table that spans the logical width of the label+score columns.

**Option C: Custom column widths per row group.** Group consecutive rows by their renderer type, emit a separate table per group, manage borders to make them look continuous.

**Recommended: Option A**, with a `buildTable(rows, widths, headerRow)` helper. Each contiguous group of same-width rows shares one table. In practice most questionnaires will have all-scored or all-text rows; splits are rare. The implementation is clean and testable per group.

---

### 6. Schema Version Impact

Adding new item types to `QuestionnaireSet.schema.json` is a **backward-compatible change** — existing config files remain valid. The new `$defs` are additive. However, `required` as a new optional field on existing types requires updating the AJV schema for `selectItem`, `binaryItem` etc. — also backward-compatible since it's optional.

Bump `CONFIG_SCHEMA_SPEC.md` to v1.2 when this lands.

---

### 7. Step-by-Step Implementation Plan

Each step is independently mergeable and testable. Steps are ordered so the system is never broken mid-implementation.

#### Step 1 — Type registry scaffold (no behaviour change)

Create `src/item-types.js` with only the existing four types (`select`, `binary`, `instructions`, `if`, `randomize`). Migrate all existing `type === 'select'` checks in `scoring.js`, `controller.js`, and `report.js` to use registry helpers. All tests must pass with no observable change.

**Tests:** Existing 641 tests pass unchanged. Add unit tests for each registry helper with existing types.

---

#### Step 2 — `required` field and skip semantics

Add `required?: boolean` to all answerable item types in the schema. Update controller `canAdvance` to use `canAdvance(item, answer)` from the registry. Existing select/binary remain required-by-default (no behaviour change).

**Tests:** Unit tests for `canAdvance` with and without `required` override. Schema tests: `required: false` is valid on a select item. E2E: existing patient flow unaffected.

---

#### Step 3 — `text` item type (no scoring impact)

Add `textItem` to schema. Add `text` to registry. Build `item-text` Lit component (single line and multiline variants, with explicit submit button — no auto-advance). Add `buildTextRow` PDF renderer. Update `buildQuestionnaireSections` to dispatch per renderer key.

No scoring changes. Text items excluded from scoring naturally (not in `isScored`).

**Tests:** Component tests for `item-text` (renders, fires `answer` on input, fires `advance` on submit, restores value when `selected` is set). PDF tests for `buildTextRow` (wraps correctly, no truncation). E2E: a config with one text item can be completed and downloaded.

---

#### Step 4 — `slider` item type

Add `sliderItem` to schema. Add `slider` to registry (scored, required by default). Build `item-slider` Lit component (range input with labels). Add slider to scoring — identical path to select since answer is a number. Add slider to `scored` PDF renderer (no change needed — already handles any numeric value).

Add schema validation: `min < max`.

**Tests:** Slider unit tests in scoring (behaves like select). Schema validation test: `min >= max` is an error. Component tests. E2E: a slider item in a config scores correctly.

---

#### Step 5 — `select` item type

Trivial — identical to select in all non-rendering respects. Add `selectItem` to schema and registry. Build `item-select` Lit component (tappable card list). Reuse `scored` PDF renderer.

**Tests:** Verify `select` items score identically to equivalent `select` items with the same options. Component tests.

---

#### Step 6 — `multiselect` item type

Add `multiselectItem` to schema. Add `multiselect` to registry (`answerShape: 'array'`, skippable by default). Build `item-multiselect` Lit component (checkbox list, emits array on every change, does not auto-advance). 

Update `resolveAnswerForScoring` in scoring to roll up array → number when `item.scoring` is set. Update `canAdvance` in registry to allow `[]` as valid answer (zero selections = valid). Add `buildMultiselectRow` PDF renderer.

**Tests:** `canAdvance` allows `[]`. Component tests: checkboxes reflect `selected` number array correctly on re-entry. PDF tests for multiselect row. DSL tests: `count(item.q1) > 4` evaluates correctly when `q1` is `[1,2,3,4,5]`; `checked(item.q1, 2)` returns true when 2 is in the array and false when not; `checked` with n=0 or n > option count throws; `count` and `checked` as item IDs are rejected by validation.

---

#### Step 7 — `composite` item type

Add `compositeItem` to schema. Add `composite` to registry (`answerShape: 'object'`, skippable by default). Build `item-composite` Lit component — this is the most complex component: internal multi-step state (option selection screen, then sub-item screen per selected option). Emits the complete object on each sub-item answer change. Does not auto-advance.

Add `buildCompositeRows` PDF renderer (header row + indented sub-rows).

**Tests:** Component unit tests for each internal state (option selection, sub-item entry, back navigation within the component). PDF composite row renderer tests. E2E test with a composite item in a config.

---

#### Step 8 — PDF mixed-width table refactor

Refactor `buildQuestionnaireSections` to group rows by width type and emit separate tables per group. Ensure borders appear continuous across groups. This step is purely visual — no scoring, schema, or engine changes.

**Tests:** PDF snapshot tests (or manual verification) with a questionnaire containing mixed item types. Existing PDF tests continue to pass.

---

#### Step 9 — LLM_GUIDE.md update

Update `public/configs/LLM_GUIDE.md` with full examples of all new types, their schema fields, and scoring implications. Update validation checklist.

---

### 8. What Deliberately Falls Outside This Spec

- **Sub-items of non-text types in composite**: the spec allows `subItem.type` to be any future type, but v1 only supports `text`. Extending it is additive.
- **Alerts on multiselect**: e.g. "alert if option X was selected". Not supported in v1. Would require DSL extension (`item.q1 includes 4`). Defer.
- **Conditional sub-items in composite**: e.g. only show sub-item if the option's value is above a threshold. Defer.
- **Item-level `weight` on multiselect**: each option could have its own weight applied during sum aggregation. Not in v1.
- **Cross-item validation**: e.g. "if text item q1 is non-empty, require q2". Not in scope — no DSL support for string comparison.

---

### 9. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mixed-width PDF table (Step 8) introduces visual regressions in existing reports | Medium | Step 8 is isolated — existing scored-only questionnaires still use a single table; splitting only occurs when mixed types are present |
| `composite` component internal navigation conflicts with shell back/forward | High | Composite component intercepts back gestures internally and only propagates to shell when at its own first step. Requires careful integration test |
| Array/object answers in `_answers` break existing scoring for mixed questionnaires | Low | `isScored` excludes non-numeric types; `resolveAnswerForScoring` guards with `typeof` before numeric ops |
| New schema types break AJV validation for existing configs | Low | All additions are to `oneOf` in item `$defs` — existing items match their existing branch unchanged |
| `required` field with wrong default breaks existing instruments | None | Existing types default to `required: true` via registry, identical to current behaviour |
