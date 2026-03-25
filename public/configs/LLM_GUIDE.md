# Madad Instrument Authoring Guide — For LLMs

You are helping a clinician create a questionnaire instrument for the Madad clinical assessment platform. This guide contains everything you need to produce a valid instrument file. Read it fully before generating any JSON.

---

## What you are producing

A single JSON object to be added to `public/configs/prod/standard.json`, inside the `questionnaires` array. Optionally, a battery definition to add to the `batteries` array in the same file.

The output is **pure JSON** — no comments, no trailing commas, no JavaScript.

---

## The complete questionnaire structure

```json
{
  "id": "instrument_id",
  "title": "Display title shown to clinician",
  "description": "One sentence shown in the Composer search UI.",
  "keywords": ["keyword1", "keyword2"],
  "defaultOptionSetId": "my_scale",
  "optionSets": {
    "my_scale": [
      { "label": "Label for 0", "value": 0 },
      { "label": "Label for 1", "value": 1 },
      { "label": "Label for 2", "value": 2 },
      { "label": "Label for 3", "value": 3 }
    ]
  },
  "items": [],
  "scoring": {},
  "subscaleLabels": {},
  "interpretations": {},
  "alerts": []
}
```

Only `id`, `title`, `items` are strictly required. All other fields are optional but you should include `description`, `keywords`, `scoring`, and `interpretations` for any real clinical instrument.

---

## Title naming convention

Use the Hebrew name followed by the instrument's common initials in parentheses:

```
"title": "שאלון דיכאון (PHQ-9)"
"title": "שאלון חרדה מוכללת (GAD-7)"
"title": "שאלון פוסט-טראומה (PCL-5)"
```

Skip the initials if the instrument is not commonly known by them:

```
"title": "שלושת הבעיות המרכזיות"
```

This is a convention, not a schema requirement.

## IDs — the most common source of errors

**Pattern:** `^[a-zA-Z0-9][a-zA-Z0-9_]*$`

- Allowed: letters, digits, underscores
- **Not allowed: hyphens.** Write `phq9` not `phq-9`. Write `asi3` not `asi-3`. Hyphens cause DSL parsing failures.
- Must be unique across all questionnaires and batteries in all loaded config files
- Reserved words that cannot be used as any ID: `item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`

Scope rules:
- Questionnaire `id` — unique across the entire platform
- Item `id` — unique within the questionnaire only
- Option set `id` — unique within the questionnaire only

---

## Option sets

Most instruments use a single response scale for all items. Define it once in `optionSets` and reference it with `defaultOptionSetId`. This avoids repeating the options on every item.

```json
"defaultOptionSetId": "frequency_4",
"optionSets": {
  "frequency_4": [
    { "label": "כלל לא",               "value": 0 },
    { "label": "מספר ימים",             "value": 1 },
    { "label": "ביותר ממחצית הימים",   "value": 2 },
    { "label": "כמעט כל יום",           "value": 3 }
  ]
}
```

If different items use different scales, define multiple option sets and reference them per-item with `"optionSetId": "scale_name"`.

If a single item needs unique options not shared with others, define `"options": [...]` directly on that item instead of using an option set.

**Never define both `options` and `optionSetId` on the same item.** The validator rejects this.

Option values must be unique within each item. Values do not need to be consecutive — `0, 1, 2, 3` and `1, 2, 3, 4` are both fine depending on the instrument's scoring convention.

---

## Items

Every item requires `id`, `type`, and `text`. The `id` is local to the questionnaire.

### Select item (single choice from a list)
```json
{ "id": "1", "type": "select", "text": "Item text shown to patient" }
```
The canonical type for single-choice questions. Renders as a vertical list of tappable cards.
Uses `defaultOptionSetId` by default. Override with `"optionSetId": "other_scale"` or inline `"options": [...]`.

Add `"reverse": true` to reverse-score an item. If any item uses `reverse`, you must set `maxPerItem` in the scoring spec.

Add `"required": false` to make an item skippable. Default is required.

### Binary item (yes/no)
```json
{ "id": "b1", "type": "binary", "text": "Did you sleep well?" }
```
Default labels are כן/לא. Override with `"labels": { "yes": "כן", "no": "לא" }`.

Binary items score: כן = 1, לא = 0 by default. With `"reverse": true`: כן = 0, לא = 1.

Add `"required": false` to make a binary item skippable. Default is required.

### Instructions item
```json
{ "id": "intro", "type": "instructions", "text": "Instructions shown with a Continue button." }
```
Instructions items are not scored. They do not appear in the response table of the PDF. Multiple instructions items are allowed — place them anywhere in the items array.

### Text item (free-text response)
```json
{ "id": "notes", "type": "text", "text": "הערות נוספות" }
```
Renders a single-line text input. The patient's response is printed verbatim in the PDF but is **not scored** and **not available in DSL expressions**. Skippable by default (add `"required": true` to force an answer).

Optional properties:
- `"inputType"`: `"line"` (default), `"multiline"`, `"number"`, `"email"`
- `"min"` / `"max"`: numeric bounds when `inputType` is `"number"`
- `"pattern"`: regex string for validation

### Slider item (numeric scale)
```json
{ "id": "pain", "type": "slider", "text": "דרג את עוצמת הכאב", "min": 0, "max": 10 }
```
Renders a draggable range slider. The answer is a number in `[min, max]`. **Scored** like a select item — contributes to `sum`, `average`, and `subscale` scoring. Required by default.

Optional properties:
- `"step"`: granularity (default 1)
- `"labels"`: `{ "min": "ללא כאב", "max": "כאב קשה" }` — endpoint labels shown below the track
- `"reverse"`: reverse-score (requires `maxPerItem` in scoring)
- `"weight"`: item weight multiplier

### Multiselect item (multiple choice)
```json
{
  "id": "symptoms",
  "type": "multiselect",
  "text": "אילו תסמינים חווית השבוע?",
  "options": [
    { "label": "כאבי ראש" },
    { "label": "עייפות" },
    { "label": "חרדה" },
    { "label": "קשיי שינה" }
  ]
}
```
Renders a checkbox list. The patient may select any number of options, including none. **Not scored** — answers do not contribute to the questionnaire total. Skippable by default (add `"required": true` to disallow skipping).

Key differences from `select`:
- Options have only `"label"` — no `"value"` field.
- The answer is stored as an array of **1-based indices** of selected options.
- Use `count()` and `checked()` in DSL conditions to work with the answer (see DSL section).
- At least 2 options required. No `optionSetId` — options must always be inline.

---

## Scoring

### Sum scoring (most common)
```json
"scoring": {
  "method": "sum",
  "maxPerItem": 3
}
```
`maxPerItem` is required only when any item uses `"reverse": true`. Set it to the maximum option value on the scale.

### Average scoring
```json
"scoring": {
  "method": "average",
  "maxPerItem": 4
}
```

### Subscale scoring
Use when the instrument produces both a total score and domain subscores.

```json
"scoring": {
  "method": "subscales",
  "maxPerItem": 3,
  "subscales": {
    "intrusion":    ["i1", "i2", "i3", "i4", "i5"],
    "avoidance":    ["a1", "a2"],
    "dysphoria":    ["d1", "d2", "d3", "d4", "d5", "d6", "d7"],
    "hyperarousal": ["h1", "h2", "h3", "h4", "h5", "h6"]
  }
},
"subscaleLabels": {
  "intrusion":    "חדירה (Intrusion)",
  "avoidance":    "הימנעות (Avoidance)",
  "dysphoria":    "דיספוריה (Dysphoria)",
  "hyperarousal": "עוררות יתר (Hyperarousal)"
}
```

Each item ID in the subscale arrays must match an item defined in the `items` array. Items not listed in any subscale are excluded from scoring. The total score is the sum of all subscale scores.

`subscaleLabels` values are displayed in the PDF. Format: `"Hebrew name (English name)"`.

**`subscaleMethod`** controls how each individual subscale score is computed. Default is `"sum"`. Use `"mean"` for instruments whose published norms report subscale means rather than sums (e.g. PCL-5, PTCI):

```json
"scoring": {
  "method": "subscales",
  "subscaleMethod": "mean",
  "subscales": { ... }
}
```

The total score is always the sum of the subscale scores (whether those are sums or means). Unanswered items are excluded from both the numerator and denominator when computing means.

### Excluding items from scoring

Some instruments have a gating item that should appear in the PDF and be available in DSL conditions but must **not** contribute to the total score. Use `exclude` with `method: "sum"` or `method: "average"`:

```json
"scoring": {
  "method": "sum",
  "exclude": ["exposure"]
}
```

- `exclude` is an array of item IDs.
- Excluded items are still answered by the patient and shown in the PDF response table.
- Excluded items are **available in DSL expressions** (`item.exposure`) and can be used in battery conditions.
- Applies to both sum/average totals and subscale scoring. If an item appears in a subscale array AND in `exclude`, it is excluded from that subscale too.

**Typical use case:** The PC-PTSD-5 has a trauma exposure question (`exposure`) that gates the 5 scored symptom items. The exposure question is answered but should not add to the 0–5 symptom score.

### Custom scoring (advanced)
```json
"scoring": {
  "method": "custom",
  "customFormula": "sum(item.1, item.2, item.3) * 2"
}
```
See DSL expressions section below.

### No scoring
Omit the `scoring` field entirely, or use `"method": "none"`. The questionnaire will not show a score on the results screen.

---

## Interpretations (score categories)

Maps a total score to a category label shown in the PDF.

```json
"interpretations": {
  "target": "total",
  "ranges": [
    { "min": 0,  "max": 4,  "label": "מינימלי" },
    { "min": 5,  "max": 9,  "label": "קל" },
    { "min": 10, "max": 14, "label": "בינוני" },
    { "min": 15, "max": 19, "label": "בינוני-חמור" },
    { "min": 20, "max": 27, "label": "חמור" }
  ]
}
```

`target` is `"total"` for the overall score, or a subscale ID for subscale-level interpretation.

Ranges are inclusive on both ends. The first matching range wins. Cover the full possible score range without gaps. Overlapping ranges are allowed but the first match takes priority.

---

## Alerts

Alerts appear as highlighted warnings at the top of the PDF when their condition is true.

```json
"alerts": [
  {
    "id": "suicidality",
    "condition": "item.9 >= 1",
    "message": "פריט 9 — דיווח על מחשבות אובדניות",
    "severity": "critical"
  }
]
```

Alert `id` must be unique within the questionnaire. `severity` is **required** and controls the badge rendered in the PDF report:

| Value | Badge | When to use |
|---|---|---|
| `"critical"` | Red pill | Direct safety risk — suicidality, psychosis, self-harm |
| `"warning"` | Amber pill | Clinical attention needed — elevated score, significant symptom |

No other values are accepted.

`message` is the label shown inside the badge pill. **Keep it short — 30 characters maximum.** It is not a description; it is a flag. Examples: `"אובדנות"`, `"מעל סף קליני PTSD"`, `"חשיפה לטראומה"`.

### DSL expressions for conditions

Conditions are small expressions evaluated after scoring. Reference values using:

| Reference | Meaning |
|---|---|
| `item.ID` | Answer to a `select`, `binary`, or `slider` item (number) |
| `item.ID` | Answer to a `multiselect` item (array of 1-based indices) — use `count()`/`checked()` |
| `score.QUESTIONNAIRE_ID` | Total score of a completed questionnaire (battery level) |
| `subscale.SUBSCALE_ID` | A subscale score within the current questionnaire |
| `subscale.QUESTIONNAIRE_ID.SUBSCALE_ID` | A subscale score from a specific questionnaire (battery level) |

Comparison operators: `<`, `>`, `<=`, `>=`, `==`, `!=`

Logical operators: `&&` (and), `||` (or), `!` (not)

Arithmetic: `+`, `-`, `*`, `/`

Built-in functions:

| Function | Returns | Notes |
|---|---|---|
| `sum(a, b, ...)` | number | Sum of numeric args |
| `avg(a, b, ...)` | number | Mean of numeric args |
| `min(a, b, ...)` | number | Minimum of numeric args |
| `max(a, b, ...)` | number | Maximum of numeric args |
| `if(cond, then, else)` | number or boolean | Conditional — both branches must return same type |
| `count(item.ID)` | number | Number of selected options in a `multiselect` answer (0 if unanswered) |
| `checked(item.ID, n)` | boolean | True if 1-based option `n` is selected in a `multiselect` answer |

**Common alert patterns:**

```
"item.9 >= 1"                               — select/binary item triggered
"score.phq9 >= 10"                          — PHQ-9 total ≥ 10
"score.phq9 >= 10 && score.gad7 >= 8"       — both elevated
"subscale.pcl5.intrusion >= 12"             — subscale threshold
"item.q1 == 1 || item.q2 == 1"             — either of two items triggered
"count(item.symptoms) >= 3"                 — 3 or more symptoms checked
"checked(item.symptoms, 2)"                 — specific symptom (option 2) was checked
"checked(item.symptoms, 1) && count(item.symptoms) >= 2"  — option 1 plus others
```

**IDs with numeric names:** Items named `"1"`, `"9"` etc. are valid and referenced as `item.1`, `item.9`. No quotes needed in DSL.

---

## Batteries

A battery is an ordered sequence of questionnaires presented as a single session.

```json
{
  "id": "intake_battery",
  "title": "הערכה ראשונית",
  "description": "Screens for depression and anxiety. Adds PTSD screening if PHQ-9 is elevated.",
  "keywords": ["intake", "screening"],
  "sequence": [
    { "questionnaireId": "phq9" },
    { "questionnaireId": "gad7" }
  ]
}
```

### Conditional branching in batteries

```json
{
  "type": "if",
  "condition": "score.phq9 >= 10",
  "then": [{ "questionnaireId": "pcl5" }],
  "else": []
}
```

The `else` array must be present even if empty. DSL expressions in battery conditions can reference scores from questionnaires already completed in the sequence.

---

## Complete worked example — a 7-item Likert instrument

```json
{
  "id": "gad7",
  "title": "שאלון חרדה (GAD-7)",
  "description": "7-item anxiety severity scale. Standard screening for generalised anxiety.",
  "keywords": ["anxiety", "GAD", "screening", "חרדה"],
  "defaultOptionSetId": "frequency_4",
  "optionSets": {
    "frequency_4": [
      { "label": "כלל לא",               "value": 0 },
      { "label": "מספר ימים",             "value": 1 },
      { "label": "ביותר ממחצית הימים",   "value": 2 },
      { "label": "כמעט כל יום",           "value": 3 }
    ]
  },
  "items": [
    {
      "id": "intro",
      "type": "instructions",
      "text": "במשך השבועיים האחרונים, עד כמה סבלת מהבעיות הבאות?"
    },
    { "id": "1", "type": "select", "text": "תחושת עצבנות, חרדה או מתח" },
    { "id": "2", "type": "select", "text": "אי-יכולת לעצור את הדאגה או לשלוט בה" },
    { "id": "3", "type": "select", "text": "דאגה מוגזמת לגבי דברים שונים" },
    { "id": "4", "type": "select", "text": "קושי להירגע" },
    { "id": "5", "type": "select", "text": "חוסר-מנוחה עד כדי קושי לשבת בשקט" },
    { "id": "6", "type": "select", "text": "נטייה להתרגז ולהתעצבן בקלות" },
    { "id": "7", "type": "select", "text": "פחד שמשהו נורא עלול לקרות" }
  ],
  "scoring": {
    "method": "sum",
    "maxPerItem": 3
  },
  "interpretations": {
    "target": "total",
    "ranges": [
      { "min": 0,  "max": 4,  "label": "מינימלי" },
      { "min": 5,  "max": 9,  "label": "קל" },
      { "min": 10, "max": 14, "label": "בינוני" },
      { "min": 15, "max": 21, "label": "חמור" }
    ]
  }
}
```

---

## Validation checklist — verify before outputting

- [ ] `id` uses only letters, digits, underscores — no hyphens
- [ ] `id` is not a reserved word (`item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`)
- [ ] Every item has a unique `id` within the questionnaire
- [ ] No item has both `options` and `optionSetId`
- [ ] Every `optionSetId` on an item matches a key in `optionSets`
- [ ] `defaultOptionSetId` matches a key in `optionSets` if set
- [ ] If any item has `"reverse": true`, `scoring.maxPerItem` is set
- [ ] Every item ID in `scoring.subscales` arrays exists in `items`
- [ ] `subscaleLabels` has a key for every subscale in `scoring.subscales`
- [ ] `interpretations.ranges` cover the full possible score range
- [ ] Alert `condition` expressions reference valid item IDs and questionnaire IDs
- [ ] Alert IDs are unique within the questionnaire
- [ ] JSON is valid — no trailing commas, no comments

---

## Common mistakes to avoid

**Wrong — hyphen in ID:**
```json
{ "id": "phq-9" }
```
**Correct:**
```json
{ "id": "phq9" }
```

**Wrong — missing `else` in if-node:**
```json
{ "type": "if", "condition": "score.phq9 >= 10", "then": [...] }
```
**Correct:**
```json
{ "type": "if", "condition": "score.phq9 >= 10", "then": [...], "else": [] }
```

**Wrong — referencing a subscale before defining it:**
```json
"subscaleLabels": { "intrusion": "חדירה" }
```
without a corresponding `"scoring": { "method": "subscales", "subscales": { "intrusion": [...] } }`

**Wrong — `maxPerItem` missing when reverse scoring used:**
```json
"scoring": { "method": "sum" }
```
with any item having `"reverse": true`

**Wrong — item referenced in subscale but not in items array:**
```json
"subscales": { "part_a": ["q1", "q2", "q99"] }
```
where `q99` doesn't exist in `items`

**Wrong — option value repeated in same item:**
```json
"options": [
  { "label": "כלל לא", "value": 0 },
  { "label": "לפעמים", "value": 0 }
]
```

---

## Output format

Produce the complete questionnaire JSON object. Do not wrap it in the full config file — the clinician will add it to `standard.json` manually. If a battery is also requested, produce it as a separate JSON object clearly labelled.

If information needed for a field (e.g. exact item text, scoring ranges, alert thresholds) is not provided, ask for it rather than guessing. Clinical scoring thresholds must match the validated published instrument.
