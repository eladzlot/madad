# Adding a New Instrument
**Audience:** Clinical lead and developer working together  
**Prerequisite:** Read `docs/CONFIG_SCHEMA_SPEC.md` for the full field reference

---

## Overview

All standard instruments live in `public/configs/prod/standard.json`. Adding a new instrument is a config-only change — no application code is touched. The process is:

1. Write the questionnaire definition in JSON
2. Add it to `standard.json`
3. Optionally add it to a battery
4. Validate
5. Test manually
6. Commit

The `validate:configs` script catches schema errors, missing option set references, duplicate IDs, and most common mistakes before anything reaches the browser.

---

## Step 1 — Write the questionnaire definition

A questionnaire definition is a JSON object. Here is a minimal working example followed by a full example with all optional fields.

### Minimal example (Likert, single option set)

```json
{
  "id": "gad7",
  "title": "GAD-7",
  "description": "7-item anxiety severity scale.",
  "keywords": ["anxiety", "GAD", "screening"],
  "defaultOptionSetId": "frequency_4",
  "optionSets": {
    "frequency_4": [
      { "label": "כלל לא",           "value": 0 },
      { "label": "מספר ימים",         "value": 1 },
      { "label": "יותר ממחצית הזמן", "value": 2 },
      { "label": "כמעט כל יום",       "value": 3 }
    ]
  },
  "items": [
    {
      "id": "intro",
      "type": "instructions",
      "text": "במשך השבועיים האחרונים, עד כמה סבלת מהבעיות הבאות?"
    },
    { "id": "1", "type": "likert", "text": "תחושת עצבנות, חרדה או מתח" },
    { "id": "2", "type": "likert", "text": "אי-יכולת לעצור את הדאגה או לשלוט בה" },
    { "id": "3", "type": "likert", "text": "דאגה מוגזמת לגבי דברים שונים" },
    { "id": "4", "type": "likert", "text": "קושי להירגע" },
    { "id": "5", "type": "likert", "text": "חוסר-מנוחה עד כדי קושי לשבת בשקט" },
    { "id": "6", "type": "likert", "text": "נטייה להתרגז ולהתעצבן בקלות" },
    { "id": "7", "type": "likert", "text": "פחד שמשהו נורא עלול לקרות" }
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

### Full example (with alerts, subscales, and binary items)

```json
{
  "id": "example_full",
  "title": "Example — Full Features",
  "description": "Demonstration instrument showing all supported features.",
  "keywords": ["example", "demo"],
  "defaultOptionSetId": "frequency_4",
  "optionSets": {
    "frequency_4": [
      { "label": "כלל לא",           "value": 0 },
      { "label": "מספר ימים",         "value": 1 },
      { "label": "יותר ממחצית הזמן", "value": 2 },
      { "label": "כמעט כל יום",       "value": 3 }
    ],
    "agreement_5": [
      { "label": "מתנגד מאוד", "value": 0 },
      { "label": "מתנגד",      "value": 1 },
      { "label": "ניטרלי",     "value": 2 },
      { "label": "מסכים",      "value": 3 },
      { "label": "מסכים מאוד", "value": 4 }
    ]
  },
  "items": [
    {
      "id": "intro",
      "type": "instructions",
      "text": "הוראות הפתיחה מופיעות כאן."
    },
    { "id": "q1", "type": "likert", "text": "שאלה ראשונה" },
    { "id": "q2", "type": "likert", "text": "שאלה שנייה (סולם אחר)", "optionSetId": "agreement_5" },
    { "id": "q3", "type": "likert", "text": "שאלה שלישית — ניקוד הפוך", "reverse": true },
    { "id": "q4", "type": "binary", "text": "שאלה בינארית — כן/לא" },
    {
      "id": "mid_instructions",
      "type": "instructions",
      "text": "הוראות אמצע שאלון — מופיעות כפריט רגיל."
    },
    { "id": "q5", "type": "likert", "text": "שאלה חמישית" },
    { "id": "q6", "type": "likert", "text": "שאלה שישית" }
  ],
  "scoring": {
    "method": "subscales",
    "maxPerItem": 3,
    "subscales": {
      "part_a": ["q1", "q2", "q3"],
      "part_b": ["q5", "q6"]
    }
  },
  "subscaleLabels": {
    "part_a": "חלק א (Part A)",
    "part_b": "חלק ב (Part B)"
  },
  "interpretations": {
    "target": "total",
    "ranges": [
      { "min": 0,  "max": 10, "label": "נמוך" },
      { "min": 11, "max": 20, "label": "גבוה" }
    ]
  },
  "alerts": [
    {
      "id": "high_score",
      "condition": "score.example_full >= 15",
      "message": "ציון גבוה — מומלץ להעריך מחדש",
      "severity": "warning"
    },
    {
      "id": "specific_item",
      "condition": "item.q4 >= 1",
      "message": "תגובה חיובית לשאלה הבינארית",
      "severity": "info"
    }
  ]
}
```

---

## Step 2 — Add to `standard.json`

Open `public/configs/prod/standard.json` and append the new questionnaire object to the `questionnaires` array. Keep the array ordered alphabetically by `id` for readability.

**ID rules (enforced by validation):**
- Lowercase letters, digits, underscores only: `^[a-zA-Z0-9][a-zA-Z0-9_]*$`
- No hyphens — these break DSL expressions
- Must be unique across all loaded config files
- Reserved words not allowed as IDs: `item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`

---

## Step 3 — Add to a battery (optional)

If the instrument should appear in a standard clinical battery, add a reference to the relevant battery's `sequence` array:

```json
{
  "id": "standard_intake",
  "title": "הערכה ראשונית",
  "sequence": [
    { "questionnaireId": "phq9" },
    { "questionnaireId": "gad7" }
  ]
}
```

For conditional inclusion (e.g. only add PCL-5 if PHQ-9 is elevated):

```json
{
  "type": "if",
  "condition": "score.phq9 >= 10",
  "then": [{ "questionnaireId": "pcl5" }],
  "else": []
}
```

See `docs/DSL_SPEC.md` for the full condition expression syntax.

---

## Step 4 — Validate

```bash
npm run validate:configs
```

This runs AJV schema validation and semantic checks (duplicate IDs, missing option sets, unresolved references) over every file in `public/configs/`. Fix any errors reported before proceeding.

Common errors and what they mean:

| Error | Cause |
|---|---|
| `Schema: /questionnaires/N/items/M — must have required property 'id'` | An item is missing its `id` field |
| `Semantic: duplicate questionnaire ID 'xyz'` | The same ID exists in two questionnaires (within or across files) |
| `Semantic: optionSetId 'xyz' not found` | A Likert item references an option set that isn't defined on the questionnaire |
| `Semantic: Likert item 'xyz' has no resolvable options` | Item has no `options`, no `optionSetId`, and no `defaultOptionSetId` on the questionnaire |
| `Schema: /questionnaires/N/id — must match pattern` | ID contains illegal characters (e.g. a hyphen) |

---

## Step 5 — Test manually

Start the dev server and open a URL that includes the new instrument:

```bash
npm run dev
```

Then open:
```
http://localhost:5173/?configs=/configs/prod/standard.json&items=YOUR_INSTRUMENT_ID
```

Walk through the full flow: instructions screen → all items → completion → results screen → PDF download. Verify:
- All items render correctly
- Scores shown on results screen are correct
- PDF contains the expected scores, subscale breakdown (if any), and any triggered alerts
- Response table in PDF shows all answerable items

---

## Step 6 — Commit

Commit `standard.json` alone. If the Composer manifest (`public/composer/configs.json`) needs updating, include that too.

No application code changes are required for standard Likert/binary instruments.

---

## Checklist

- [ ] Questionnaire `id` is unique, lowercase, no hyphens
- [ ] `title`, `description`, and `keywords` are filled in (clinical lead)
- [ ] All items have unique `id` values within the questionnaire
- [ ] All item IDs used in `scoring.subscales` resolve to actual items
- [ ] `subscaleLabels` provided for each subscale ID when `method` is `subscales` — use format `"Hebrew name (English name)"` for bilingual display in PDF
- [ ] All `optionSetId` references resolve to a defined option set on the questionnaire
- [ ] `scoring.maxPerItem` is set if any item uses `reverse: true`
- [ ] `interpretations.ranges` cover the full expected score range without gaps
- [ ] Alert `condition` expressions reference valid item IDs (`item.X`) or scores (`score.Y`)
- [ ] `npm run validate:configs` passes with no errors
- [ ] Manual walkthrough completed and PDF verified
