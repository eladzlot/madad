# Config Schema Specification
**Version:** 1.1
**Status:** Stable
**Implements:** Implementation Spec §7, §9

---

## 1. Purpose

This document specifies the structure of questionnaire config JSON files. It is the reference for clinicians authoring configs, developers implementing the config loader, and the AJV schema that validates them.

Config files are language-specific. Text fields are plain strings — the language is implicit in which file is loaded. There is no localisation nesting.

### Instrument policy

Only open-source or public-domain instruments may be added without explicit licensing. Do not add proprietary instruments (e.g. BDI-II, STAI commercial editions) without verifying the license.

### Config file layout

```
public/configs/
  prod/standard.json   ← Standard clinical scales (PHQ-9, GAD-7, PCL-5, OCI-R, PDSS-SR, ASI-3, HAI, MGH-HPS)
  prod/intake.json     ← Intake workflow (DIAMOND-SR screener, demographics, clinical_intake battery)
  test/e2e.json        ← E2E test fixtures only — hidden in Composer, never used clinically
```

All prod files are listed in `public/composer/configs.json`. The `validate:configs` script checks all files for schema validity and cross-file ID uniqueness.

---

## 2. ID Format

All identifiers (questionnaire IDs, battery IDs, item IDs, subscale IDs, option set IDs) must match the following pattern:

```
^[a-zA-Z0-9][a-zA-Z0-9_]*$
```

- Starts with a letter or digit
- May contain letters, digits, underscores
- No hyphens — these are ambiguous in DSL expressions (e.g. `item.a-b` would parse as subtraction)
- No spaces, dots, or other characters

The following are reserved and must not be used as any ID:
`item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`, `count`, `checked`

IDs must be unique within their scope:
- Questionnaire IDs — unique within the file (and across all loaded files after merge)
- Battery IDs — unique within the file
- Item IDs — unique within their questionnaire
- Subscale IDs — unique within their questionnaire
- Option set IDs — unique within the file

Note: JSON Schema `uniqueItems` checks deep object equality, not field-level uniqueness. ID uniqueness within scope is enforced by a post-validation check in the config loader, not by the AJV schema itself.

---

## 3. Top-Level Structure

A config file is a single JSON object with the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Unique identifier for this config file |
| `version` | string | yes | Semver or date string. Printed in PDF footer. |
| `questionnaires` | array | yes | Array of questionnaire definitions. May be empty. |
| `batteries` | array | no | Array of battery definitions |
| `dependencies` | array of strings | no | Relative paths (no leading slash) to other config files that must be loaded alongside this one. The Composer reads this and automatically appends dependency sources to generated patient URLs. Example: `["configs/prod/standard.json"]` |

---

## 4. Questionnaire

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Unique within file and across all loaded files |
| `title` | string | yes | Display title shown on separator screen and in the Composer |
| `description` | string | no | Short description of the instrument shown in the Composer alongside the title. Plain text, any language. |
| `keywords` | array of strings | no | Free-form terms used for search and filtering in the Composer (e.g. `["depression", "screening", "PHQ"]`). Any language. |
| `optionSets` | object | no | Map of select option set definitions scoped to this questionnaire |
| `defaultOptionSetId` | string (ID) | no | Used by any select item that declares neither `options` nor `optionSetId`. If a select item has no options and no default is set, the config loader throws. |
| `items` | array | yes | Flat array of item and control-flow nodes. Min 1. |
| `scoring` | object | no | Scoring specification. If absent, questionnaire is unscored. |
| `subscaleLabels` | object | no | Display labels for subscale IDs. Keys must match subscale IDs defined in `scoring.subscales`. Values are free-form strings (e.g. `"שטיפה (Washing)"`) shown in the PDF. If absent, subscale IDs are used as-is. |
| `interpretations` | object | no | Score-to-label mapping |
| `alerts` | array | no | Clinical alert definitions |

---

## 5. Items

Every entry in the `items` array is a node. Nodes have a `type` field that determines their behaviour.

### 5.1 Select Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Local to this questionnaire |
| `type` | `"select"` | yes | |
| `text` | string | yes | Question text shown to patient |
| `options` | array | yes* | Array of option objects. Required unless `optionSetId` is set. |
| `optionSetId` | string (ID) | no | References a shared option set. Mutually exclusive with `options`. |
| `reverse` | boolean | no | If true, apply reverse scoring. Requires `maxPerItem` on scoring spec. |
| `weight` | number | no | Multiplier applied after reverse scoring. Default 1. |
| `required` | boolean | no | If `false`, item is skippable. Default: required. |

Each option object:

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | yes | Display label |
| `value` | number | yes | Numeric score value |

### 5.2 Binary Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"binary"` | yes | |
| `text` | string | yes | |
| `labels` | object | no | `{ "yes": "string", "no": "string" }`. Defaults to כן/לא. |
| `reverse` | boolean | no | |
| `weight` | number | no | Default 1. |
| `required` | boolean | no | If `false`, item is skippable. Default: required. |

### 5.3 Instructions Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"instructions"` | yes | |
| `text` | string | yes | Instruction text displayed with continue button |
| `required` | boolean | no | Rarely used. If `true`, patient must explicitly continue. Default: skippable. |

### 5.4 Text Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"text"` | yes | |
| `text` | string | yes | Question text (input label) |
| `inputType` | string | no | One of `"line"` (default), `"multiline"`, `"number"`, `"email"` |
| `min` | number | no | Minimum value when `inputType` is `"number"` |
| `max` | number | no | Maximum value when `inputType` is `"number"` |
| `pattern` | string | no | Regex string for validation |
| `required` | boolean | no | If `true`, patient must enter a value. Default: skippable. |

Not scored. Answer not exposed in DSL expressions. Rendered verbatim in PDF.

### 5.5 Slider Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"slider"` | yes | |
| `text` | string | yes | Question text |
| `min` | number | yes | Minimum value of the range |
| `max` | number | yes | Maximum value of the range |
| `step` | number | no | Granularity. Default 1. Must be > 0. |
| `labels` | object | no | `{ "min": "string", "max": "string" }` — endpoint labels shown below the track |
| `reverse` | boolean | no | |
| `weight` | number | no | Default 1. |
| `required` | boolean | no | If `false`, item is skippable. Default: required. |

Contributes to scoring like a select item. Available in DSL as `item.<id>` (number).

### 5.6 Multiselect Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"multiselect"` | yes | |
| `text` | string | yes | Question text |
| `options` | array | yes | Min 2 items. Each item has only `label` (string) — no `value` field. |
| `required` | boolean | no | If `true`, at least one option must be selected. Default: skippable (zero selections valid). |

Not scored. Answer stored as `number[]` of 1-based indices. Available in DSL via `count(item.<id>)` and `checked(item.<id>, n)`. No `optionSetId` support — options must always be inline.

### 5.7 If Node

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"if"` | yes | |
| `condition` | string | yes | DSL expression evaluating to boolean |
| `then` | array | yes | Array of item nodes to splice in if true |
| `else` | array | yes | Array of item nodes to splice in if false. May be empty. |

### 5.8 Randomize Node

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"randomize"` | yes | |
| `ids` | array | yes | Array of item IDs (strings) to shuffle |

---

## 6. Scoring Specification

| Field | Type | Required | Description |
|---|---|---|---|
| `method` | string | yes | One of: `none`, `sum`, `average`, `subscales`, `custom` |
| `maxPerItem` | number | no | Required when any item uses reverse scoring |
| `subscaleMethod` | string | no | How each subscale score is computed. One of: `sum` (default), `mean`. Applies only when `subscales` is defined. Use `mean` for instruments like PCL-5 and PTCI whose published norms report subscale means. The total score is always the sum of the subscale scores (whether those are sums or means). |
| `subscales` | object | no | Map of subscale ID → array of item IDs. Required when method is `subscales`. |
| `customFormula` | string | no | DSL expression returning a number. Required when method is `custom`. |
| `exclude` | array of strings | no | Item IDs to exclude from scoring entirely. Excluded items still appear in the PDF response table but do not contribute to the total or any subscale. Useful for gating items (e.g. a trauma exposure question that gates scored symptoms). |

---

## 7. Interpretations

| Field | Type | Required | Description |
|---|---|---|---|
| `target` | string | no | `"total"` (default) or a subscale ID |
| `ranges` | array | yes | Array of range objects |

Each range object:

| Field | Type | Required | Description |
|---|---|---|---|
| `min` | number | yes | Inclusive lower bound |
| `max` | number | yes | Inclusive upper bound |
| `label` | string | yes | Category label returned when score falls in range |

Ranges should be non-overlapping and cover the full expected score range. The loader does not enforce this — the first matching range wins.

---

## 8. Alerts

Each alert:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Unique within the questionnaire |
| `condition` | string | yes | DSL expression evaluating to boolean |
| `message` | string | yes | Text displayed in PDF |
| `severity` | string | **yes** | Badge type rendered in the PDF report. Must be `"warning"` or `"critical"`. |

---

## 9. Batteries

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `title` | string | yes | Display title shown in Composer |
| `description` | string | no | Short description of the battery shown in the Composer. Plain text, any language. |
| `keywords` | array of strings | no | Free-form terms used for search and filtering in the Composer. Any language. |
| `sequence` | array | yes | Array of sequence nodes. Min 1. |

### 9.1 Battery Sequence Nodes

**Questionnaire reference:**

| Field | Type | Required | Description |
|---|---|---|---|
| `questionnaireId` | string (ID) | yes | Must reference a questionnaire defined in the loaded config set |

**If node:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"if"` | yes | |
| `condition` | string | yes | DSL expression. Battery-level context: `score.<id>`, `subscale.<id>.<subId>`, `item.<questionnaireId>.<itemId>` |
| `then` | array | yes | Array of sequence nodes |
| `else` | array | yes | Array of sequence nodes. May be empty. |

At battery level, item answers from completed questionnaires are referenced with the **qualified form** `item.<questionnaireId>.<itemId>`. The unqualified `item.<id>` form is not available at battery level — it is only valid within a questionnaire. This prevents ambiguity when multiple questionnaires share item IDs.

Example:
```json
{
  "type": "if",
  "condition": "item.diamond_sr.q11 == 1 || item.diamond_sr.q12 == 1",
  "then": [{ "questionnaireId": "oci_r" }],
  "else": []
}
```

**Randomize node:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"randomize"` | yes | |
| `ids` | array | yes | Array of questionnaire ID strings to shuffle |

---

## 10. Option Sets

The `optionSets` field on a questionnaire is an object mapping option set IDs to arrays of option objects (same structure as inline `options` on a select item). Scope is per-questionnaire — option sets defined on one questionnaire are not visible to another.

Items reference a named set via `optionSetId`. If neither `options` nor `optionSetId` is present on a select item, the questionnaire's `defaultOptionSetId` is used. If none of these are available, the config loader throws a descriptive error at load time.

Example:
```json
{
  "id": "phq9",
  "title": "PHQ-9",
  "defaultOptionSetId": "frequency_4",
  "optionSets": {
    "frequency_4": [
      { "label": "כלל לא",           "value": 0 },
      { "label": "מספר ימים",         "value": 1 },
      { "label": "יותר ממחצית הזמן", "value": 2 },
      { "label": "כמעט כל יום",       "value": 3 }
    ]
  }
}
```

---

## 11. Validation

The AJV schema enforces:
- Required fields and types on all objects
- ID pattern (`^[a-zA-Z0-9][a-zA-Z0-9_]*$`) on all ID fields
- `options` and `optionSetId` are mutually exclusive on select items (not both)
- `slider` requires `min` and `max`; `step` must be > 0 if present
- `multiselect` options must have only `label` (no `value`); minimum 2 options
- `subscales` map present when `method` is `subscales`
- `customFormula` present when `method` is `custom`

The config loader enforces (post-AJV):
- Questionnaire ID uniqueness across all loaded files
- Item ID uniqueness within each questionnaire
- All `optionSetId` and `defaultOptionSetId` references resolve to a defined option set on the same questionnaire
- Every select item has a resolvable option set (inline, explicit reference, or default)
- All item ID references in `subscales`, `if.then`, `if.else`, `randomize.ids` resolve to defined items
- All questionnaire ID references in battery sequence nodes resolve to defined questionnaires
- `slider` items: `min` must be less than `max`

DSL expressions (`condition`, `customFormula`) are validated lazily — they are parsed and type-checked at the point they are first evaluated, not at load time.

---

## 12. Full Examples

### Single-file instrument with score-based battery branching

```json
{
  "id": "standard",
  "version": "1.0.0",
  "questionnaires": [
    {
      "id": "phq9",
      "title": "PHQ-9",
      "description": "9-item depression severity scale.",
      "keywords": ["depression", "mood", "PHQ"],
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
        { "id": "intro", "type": "instructions", "text": "במשך השבועיים האחרונים, עד כמה סבלת מהבעיות הבאות?" },
        { "id": "1", "type": "select", "text": "חוסר עניין או הנאה מדברים" },
        { "id": "2", "type": "select", "text": "תחושת עצבות, דיכאון או ייאוש" },
        { "id": "9", "type": "select", "text": "מחשבות שעדיף לך למות או לפגוע בעצמך" }
      ],
      "scoring": { "method": "sum", "maxPerItem": 3 },
      "interpretations": {
        "target": "total",
        "ranges": [
          { "min": 0,  "max": 4,  "label": "מינימלי" },
          { "min": 5,  "max": 9,  "label": "קל" },
          { "min": 10, "max": 14, "label": "בינוני" },
          { "min": 15, "max": 19, "label": "בינוני-חמור" },
          { "min": 20, "max": 27, "label": "חמור" }
        ]
      },
      "alerts": [
        { "id": "suicidality", "condition": "item.9 >= 1", "message": "פריט 9 — דיווח על מחשבות אובדניות", "severity": "critical" }
      ]
    }
  ],
  "batteries": [
    {
      "id": "depression_screen",
      "title": "סינון דיכאון",
      "sequence": [
        { "questionnaireId": "phq9" },
        {
          "type": "if",
          "condition": "score.phq9 >= 10",
          "then": [{ "questionnaireId": "pcl5" }],
          "else": []
        }
      ]
    }
  ]
}
```

### Cross-config battery using `dependencies` and qualified item references

`intake.json` — contains a screener and a battery that conditionally routes to instruments defined in `standard.json`:

```json
{
  "id": "intake",
  "version": "1.0.0",
  "dependencies": ["configs/prod/standard.json"],
  "questionnaires": [
    {
      "id": "screener",
      "title": "סינון ראשוני",
      "defaultOptionSetId": "yesno",
      "optionSets": {
        "yesno": [
          { "label": "לא", "value": 0 },
          { "label": "כן", "value": 1 }
        ]
      },
      "items": [
        { "id": "q11", "type": "binary", "text": "יש לי מחשבות חוזרות שאיני רוצה בהן." },
        { "id": "q12", "type": "binary", "text": "אני חוזר על פעולות שוב ושוב כדי להרגיש טוב יותר." }
      ],
      "scoring": { "method": "sum" }
    }
  ],
  "batteries": [
    {
      "id": "clinical_intake",
      "title": "הערכה ראשונית",
      "sequence": [
        { "questionnaireId": "screener" },
        {
          "type": "if",
          "condition": "item.screener.q11 == 1 || item.screener.q12 == 1",
          "then": [{ "questionnaireId": "oci_r" }],
          "else": []
        }
      ]
    }
  ]
}
```

Key points:
- `"dependencies"` declares that `standard.json` must be loaded alongside this file. The Composer adds it automatically to patient URLs.
- Battery conditions use `item.<questionnaireId>.<itemId>` (qualified) to reference answers from completed questionnaires. The unqualified `item.<id>` form is only valid within a questionnaire.
- `oci_r` is defined in `standard.json`, not in `intake.json` — the dependency declaration makes it available at runtime.

