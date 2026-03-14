# Config Schema Specification
**Version:** 1.0  
**Status:** Draft  
**Implements:** Implementation Spec §7  

---

## 1. Purpose

This document specifies the structure of questionnaire config JSON files. It is the reference for clinicians authoring configs, developers implementing the config loader, and the AJV schema that validates them.

Config files are language-specific. Text fields are plain strings — the language is implicit in which file is loaded. There is no localisation nesting.

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
`item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`

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

---

## 4. Questionnaire

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Unique within file and across all loaded files |
| `title` | string | yes | Display title shown on separator screen and in the Composer |
| `description` | string | no | Short description of the instrument shown in the Composer alongside the title. Plain text, any language. |
| `keywords` | array of strings | no | Free-form terms used for search and filtering in the Composer (e.g. `["depression", "screening", "PHQ"]`). Any language. |
| `optionSets` | object | no | Map of Likert option set definitions scoped to this questionnaire |
| `defaultOptionSetId` | string (ID) | no | Used by any Likert item that declares neither `options` nor `optionSetId`. If a Likert item has no options and no default is set, the config loader throws. |
| `items` | array | yes | Flat array of item and control-flow nodes. Min 1. |
| `scoring` | object | no | Scoring specification. If absent, questionnaire is unscored. |
| `interpretations` | object | no | Score-to-label mapping |
| `alerts` | array | no | Clinical alert definitions |

---

## 5. Items

Every entry in the `items` array is a node. Nodes have a `type` field that determines their behaviour.

### 5.1 Likert Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | Local to this questionnaire |
| `type` | `"likert"` | yes | |
| `text` | string | yes | Question text shown to patient |
| `options` | array | yes* | Array of option objects. Required unless `optionSetId` is set. |
| `optionSetId` | string (ID) | no | References a shared option set. Mutually exclusive with `options`. |
| `reverse` | boolean | no | If true, apply reverse scoring. Requires `maxPerItem` on scoring spec. |
| `weight` | number | no | Multiplier applied after reverse scoring. Default 1. |

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

### 5.3 Instructions Item

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"instructions"` | yes | |
| `text` | string | yes | Instruction text displayed with continue button |

### 5.4 If Node

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ID) | yes | |
| `type` | `"if"` | yes | |
| `condition` | string | yes | DSL expression evaluating to boolean |
| `then` | array | yes | Array of item IDs (strings) to splice in if true |
| `else` | array | yes | Array of item IDs (strings) to splice in if false. May be empty. |

### 5.5 Randomize Node

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
| `subscales` | object | no | Map of subscale ID → array of item IDs. Required when method is `subscales`. |
| `customFormula` | string | no | DSL expression returning a number. Required when method is `custom`. |

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
| `severity` | string | no | Reserved for future use. Suggested values: `info`, `warning`, `critical` |

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
| `condition` | string | yes | DSL expression. Battery-level context: `score.<id>`, `subscale.<id>.<subId>` |
| `then` | array | yes | Array of sequence nodes |
| `else` | array | yes | Array of sequence nodes. May be empty. |

**Randomize node:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"randomize"` | yes | |
| `ids` | array | yes | Array of questionnaire ID strings to shuffle |

---

## 10. Option Sets

The `optionSets` field on a questionnaire is an object mapping option set IDs to arrays of option objects (same structure as inline `options` on a Likert item). Scope is per-questionnaire — option sets defined on one questionnaire are not visible to another.

Items reference a named set via `optionSetId`. If neither `options` nor `optionSetId` is present on a Likert item, the questionnaire's `defaultOptionSetId` is used. If none of these are available, the config loader throws a descriptive error at load time.

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
- `options` and `optionSetId` are mutually exclusive on Likert items (not both)
- `subscales` map present when `method` is `subscales`
- `customFormula` present when `method` is `custom`

The config loader enforces (post-AJV):
- Questionnaire ID uniqueness across all loaded files
- Item ID uniqueness within each questionnaire
- All `optionSetId` and `defaultOptionSetId` references resolve to a defined option set on the same questionnaire
- Every Likert item has a resolvable option set (inline, explicit reference, or default)
- All item ID references in `subscales`, `if.then`, `if.else`, `randomize.ids` resolve to defined items
- All questionnaire ID references in battery sequence nodes resolve to defined questionnaires

DSL expressions (`condition`, `customFormula`) are validated lazily — they are parsed and type-checked at the point they are first evaluated, not at load time.

---

## 12. Full Example

```json
{
  "id": "standard",
  "version": "1.0.0",
  "questionnaires": [
    {
      "id": "phq9",
      "title": "PHQ-9",
      "description": "9-item depression severity scale. Recommended for routine screening and monitoring.",
      "keywords": ["depression", "mood", "screening", "PHQ"],
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
        { "id": "1", "type": "likert", "text": "חוסר עניין או הנאה מדברים" },
        { "id": "2", "type": "likert", "text": "תחושת עצבות, דיכאון או ייאוש" },
        { "id": "9", "type": "likert", "text": "מחשבות שעדיף לך למות או לפגוע בעצמך" }
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
        { "id": "suicidality", "condition": "item.9 >= 1", "message": "פריט 9 — דיווח על מחשבות אובדניות" }
      ]
    }
  ],
  "batteries": [
    {
      "id": "standard_intake",
      "title": "הערכה ראשונית",
      "description": "Standard intake battery. Screens for depression; adds PTSD screening if PHQ-9 score is elevated.",
      "keywords": ["intake", "screening", "depression", "PTSD"],
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

