# DSL Specification

**Status:** Current — derived from `src/engine/dsl.js` and `src/engine/dsl.test.js`.  
**Version:** 2.0 (adds `count()` and `checked()` for multiselect items)

---

## 1. Purpose

The DSL (Domain-Specific Language) is a small expression language used in two places:

1. **Conditions** on `if` sequence nodes — decide at runtime whether a branch of items is shown to the patient. Must evaluate to `boolean`.
2. **Alert conditions** on questionnaires — decide whether a clinical alert fires after scoring. Must evaluate to `boolean`.

It is intentionally minimal: no variables, no assignment, no loops. Every expression is a pure function of the current scoring context.

---

## 2. Architecture

### 2.1 Pipeline

```
expression string
      │
      ▼
  tokenize()          → Token[]
      │
      ▼
   parse()            → AST node
      │
      ▼
  evalNode()          → number | boolean
      │
      ▼
  evaluate()          → number | boolean   (public API)
```

All three stages are invoked by the single public function `evaluate(expression, context, expected)`. Errors at any stage throw a typed DSL error class (see §5).

### 2.2 File location

`src/engine/dsl.js` — pure ES module, no side effects, no imports.

### 2.3 Public API

```js
import { evaluate } from './dsl.js';

evaluate(expression, context, expected?)
```

| Parameter    | Type                        | Description |
|--------------|-----------------------------|-------------|
| `expression` | `string`                    | DSL expression to evaluate |
| `context`    | `object`                    | Resolution context (see §3) |
| `expected`   | `'number'|'boolean'|undefined` | If provided, throws `DSLTypeError` if result type does not match |

Returns `number` or `boolean`.

### 2.4 Tokenizer

Scans the expression left-to-right, producing a flat array of typed tokens:

| Token type | Examples |
|------------|---------|
| `NUMBER`   | `0`, `3`, `1.5`, `-2` |
| `IDENT`    | `item`, `score`, `sum`, `if` |
| `DOT`      | `.` |
| `COMMA`    | `,` |
| `LPAREN`   | `(` |
| `RPAREN`   | `)` |
| `OP`       | `+`, `-`, `*`, `/`, `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`, `!` |
| `EOF`      | end of input (sentinel) |

Whitespace is skipped. Unknown characters throw `DSLSyntaxError`.

### 2.5 Parser

Recursive-descent parser producing an AST. Operator precedence (highest to lowest):

| Level | Operators | Associativity |
|-------|-----------|---------------|
| 1 (highest) | unary `-`, unary `!` | right |
| 2 | `*`, `/` | left |
| 3 | `+`, `-` | left |
| 4 | `<`, `>`, `<=`, `>=`, `==`, `!=` | none (no chaining) |
| 5 | `&&` | left |
| 6 (lowest) | `||` | left |

AST node shapes:

```
{ kind: 'literal',    value: number }
{ kind: 'ref',        ref: 'item'|'subscale'|'score', id: string }
{ kind: 'ref',        ref: 'subscale_q', questionnaireId: string, subscaleId: string }
{ kind: 'unary',      op: '-'|'!', operand: node }
{ kind: 'binary',     op: '+'|'-'|'*'|'/', left: node, right: node }
{ kind: 'comparison', op: '<'|'>'|'<='|'>='|'=='|'!=', left: node, right: node }
{ kind: 'logical',    op: '&&'|'||', left: node, right: node }
{ kind: 'call',       name: string, args: node[] }
```

### 2.6 Evaluator

Tree-walks the AST recursively. Enforces strict types — no implicit coercion. Short-circuits `&&` and `||`. Throws typed errors for type mismatches, missing references, and runtime errors.

---

## 3. Context

The context object is built by the engine and passed into `evaluate()`. Its shape depends on where the expression is evaluated:

### 3.1 Within a questionnaire (item conditions, alerts, scoring formulas)

```js
{
  item: {
    // Keyed by item id — answers in the CURRENT questionnaire only.
    // select / binary / slider → number
    // multiselect              → number[] of 1-based indices
    // text                     → not exposed
    '1': 2,
    'phq9_9': 1,
    'symptoms': [1, 3],
  },
  subscale: {
    // Keyed by subscale id → number (score for that subscale)
    'intrusion': 14,
    'avoidance': 8,
  }
}
```

### 3.2 At battery level (battery sequence conditions)

```js
{
  score: {
    // Keyed by questionnaire id → total score
    'phq9': 17,
    'gad7': 12,
  },
  subscale: {
    // Keyed by questionnaire id → subscale map → number
    'pcl5': { intrusion: 14, avoidance: 8 }
  },
  item: {
    // Keyed by questionnaire id → item id → value
    // Use as item.<questionnaireId>.<itemId> in expressions
    'diamond_sr': { q11: 1, q12: 0, q19: 0, ... },
    'phq9':       { '1': 2, '9': 1, ... },
  }
}
```

**Key distinction:**
- Within a questionnaire: `item.<id>` (unqualified) — refers to the current questionnaire's items.
- At battery level: `item.<questionnaireId>.<itemId>` (qualified) — refers to a specific item from a specific completed questionnaire. The unqualified `item.<id>` form is not available at battery level.

---

## 4. Syntax Reference

### 4.1 References

References resolve values from the current context.

#### `item.<id>` — within a questionnaire

The patient's answer to item `<id>` within the **current questionnaire**. Only valid in questionnaire-level expressions (item `if` conditions, alert conditions, custom scoring formulas).

- For `select`, `binary`, `slider` items: resolves to `number`.
- For `multiselect` items: resolves to `number[]`. Use `count()` or `checked()`.
- `text` item answers are **not exposed** to the DSL.
- The `<id>` may be numeric (`item.1`, `item.9`) or alphanumeric with underscores (`item.phq9_9`).
- Throws `DSLReferenceError` if the item has not been answered yet.

```
item.1          → the answer to item "1" in the current questionnaire
item.phq9_9     → the answer to item "phq9_9" in the current questionnaire
item.symptoms   → [1, 3] if multiselect options 1 and 3 were selected
```

#### `item.<questionnaireId>.<itemId>` — at battery level

The patient's answer to a specific item in a **specific completed questionnaire**. Only valid in battery-level expressions (battery `if` conditions).

This form is required at battery level because multiple questionnaires may share item IDs (e.g. both PHQ-9 and GAD-7 have an `item.1`). The qualified form is unambiguous.

- The questionnaire must have already completed before this expression is evaluated.
- Throws `DSLReferenceError` if the questionnaire or item is not found in the context.

```
item.diamond_sr.q11   → answer to item "q11" in the completed "diamond_sr" questionnaire
item.phq9.9           → answer to item "9" in the completed "phq9" questionnaire
```

#### `subscale.<id>`

A subscale score within the current questionnaire.

```
subscale.intrusion    → number
```

#### `subscale.<questionnaireId>.<subscaleId>`

A subscale score from a specific questionnaire. Used at battery level.

```
subscale.pcl5.intrusion    → number
```

#### `score.<questionnaireId>`

The total score for a completed questionnaire. Used at battery level.

```
score.phq9    → number
score.gad7    → number
```

### 4.2 Literals

Only numeric literals are supported. There are no string literals or boolean literals.

```
0       integer zero
3       positive integer
1.5     float
-2      negative (parsed as unary minus applied to literal)
```

### 4.3 Arithmetic operators

All require `number` operands. Result is `number`.

| Operator | Meaning | Example |
|----------|---------|---------|
| `+` | addition | `item.1 + item.2` |
| `-` | subtraction | `score.phq9 - 5` |
| `*` | multiplication | `item.1 * 2` |
| `/` | division | `item.1 / 2` |
| `-` (unary) | negation | `-item.1` |

Division by zero throws `DSLRuntimeError`.

### 4.4 Comparison operators

Require `number` operands on both sides. Result is `boolean`. Comparisons cannot be chained (`1 < x < 3` is a syntax error).

| Operator | Meaning |
|----------|---------|
| `<`  | less than |
| `>`  | greater than |
| `<=` | less than or equal |
| `>=` | greater than or equal |
| `==` | equal |
| `!=` | not equal |

```
item.9 >= 1
score.phq9 == 0
subscale.intrusion != subscale.avoidance
```

### 4.5 Logical operators

Require `boolean` operands. Result is `boolean`. Short-circuits: `&&` stops at the first `false`, `||` stops at the first `true`.

| Operator | Meaning |
|----------|---------|
| `&&` | logical AND |
| `||` | logical OR |
| `!` (unary) | logical NOT |

```
item.9 >= 1 && score.phq9 >= 15
score.phq9 >= 10 || score.gad7 >= 8
!(item.1 == 0)
```

### 4.6 Parentheses

Override default precedence.

```
(item.1 + item.2) * 3
```

### 4.7 Functions

#### `sum(a, b, ...)` → `number`

Sum of one or more numeric arguments.

```
sum(item.1, item.2, item.3)
sum(subscale.intrusion, subscale.avoidance)
```

#### `avg(a, b, ...)` → `number`

Arithmetic mean of one or more numeric arguments.

```
avg(item.1, item.2, item.3)
```

#### `min(a, b, ...)` → `number`

Minimum of one or more numeric arguments.

```
min(item.1, item.2)
```

#### `max(a, b, ...)` → `number`

Maximum of one or more numeric arguments.

```
max(subscale.intrusion, subscale.avoidance)
```

#### `if(condition, thenValue, elseValue)` → `number | boolean`

Conditional expression. `condition` must be `boolean`. Both branches must return the same type.

```
if(item.9 >= 1, 1, 0)
if(score.phq9 >= 10, sum(item.1, item.2), 0)
```

#### `count(ref)` → `number`

Returns the number of selected options in a `multiselect` answer.

- If `ref` resolves to an array: returns its length.
- If `ref` resolves to `null` (unanswered): returns `0`.
- If `ref` resolves to a non-null scalar: returns `1` (defensive, for non-multiselect items).

```
count(item.symptoms)          → 0 if nothing selected, 3 if three options selected
count(item.symptoms) >= 2     → true if 2 or more options were checked
count(item.symptoms) == 0     → true if the item was skipped or nothing checked
```

#### `checked(ref, n)` → `boolean`

Returns `true` if the 1-based index `n` is among the selected options of a `multiselect` answer.

- `n` must be a positive integer literal or numeric expression evaluating to a positive integer.
- If `ref` resolves to `null` or an empty array: returns `false`.
- If `ref` resolves to a non-array scalar: returns `false`.

```
checked(item.symptoms, 1)     → true if option 1 was selected
checked(item.symptoms, 3)     → true if option 3 was selected
checked(item.symptoms, 1) && checked(item.symptoms, 2)   → both options selected
```

---

## 5. Error Types

All errors include the original expression string in their message to aid debugging.

| Class | Thrown when |
|-------|------------|
| `DSLSyntaxError` | Unexpected character, unexpected token, unknown function name, malformed expression |
| `DSLReferenceError` | `item.x`, `subscale.x`, or `score.x` not found in context |
| `DSLTypeError` | Wrong type for operator (e.g. adding booleans), wrong return type |
| `DSLArgumentError` | Function called with wrong number or type of arguments |
| `DSLRuntimeError` | Runtime fault: currently only division by zero |

All are exported from `dsl.js` and can be caught individually:

```js
import { evaluate, DSLReferenceError } from './dsl.js';

try {
  evaluate('item.9 >= 1', context, 'boolean');
} catch (e) {
  if (e instanceof DSLReferenceError) { /* item not yet answered */ }
}
```

---

## 6. Usage Examples

### Alert on a specific item value

```json
{ "condition": "item.9 >= 1", "message": "...", "severity": "critical" }
```

### Alert combining score and item

```json
{ "condition": "score.phq9 >= 15 && item.9 >= 1", "message": "...", "severity": "critical" }
```

### Conditional branch in a questionnaire

```json
{
  "id": "branch_trauma",
  "type": "if",
  "condition": "item.phq9_screen >= 3",
  "then": [ "..." ],
  "else": []
}
```

### Battery-level branch (show PCL-5 if PHQ-9 ≥ 10 or GAD-7 ≥ 8)

```json
{
  "type": "if",
  "condition": "score.phq9 >= 10 || score.gad7 >= 8",
  "then": [ { "questionnaireId": "pcl5" } ],
  "else": []
}
```

### Battery-level branch on individual screener item (qualified form required)

```json
{
  "type": "if",
  "condition": "item.diamond_sr.q11 == 1 || item.diamond_sr.q12 == 1",
  "then": [ { "questionnaireId": "oci_r" } ],
  "else": []
}
```

### Multiselect alert: patient selected a specific symptom

```json
{ "condition": "checked(item.symptoms, 3)", "message": "חרדה דווחה", "severity": "warning" }
```

### Multiselect: alert if 3 or more symptoms were selected

```json
{ "condition": "count(item.symptoms) >= 3", "message": "תסמינים מרובים", "severity": "warning" }
```

### Multiselect: conditional follow-up branch

```json
{
  "id": "branch_sleep",
  "type": "if",
  "condition": "checked(item.symptoms, 4)",
  "then": [ { "id": "sleep_followup", "type": "select", "text": "..." } ],
  "else": []
}
```

---

## 7. Constraints and Limitations

- **`item.<id>` is questionnaire-scoped.** Within a questionnaire, `item.<id>` always refers to the current questionnaire's items. At battery level, you must use the qualified form `item.<questionnaireId>.<itemId>` — the unqualified form is not available.
- **No string values.** Text item answers are not available in the DSL.
- **No boolean literals.** Write `1 == 1` not `true`. Conditions are always built from comparisons.
- **No assignment.** The DSL is purely functional — no side effects.
- **No chained comparisons.** `1 < x < 3` is a syntax error. Write `x > 1 && x < 3`.
- **References must be present in context.** Referencing an unanswered item throws `DSLReferenceError`. When used in sequence conditions, the engine only evaluates conditions after the referenced items have been answered.
- **`count` and `checked` are lenient on non-arrays.** This prevents crashes when a condition accidentally references a scalar item — `count` returns 1 and `checked` returns false.
- **Integer check for `checked` second argument.** Floats (e.g. `1.5`) throw `DSLArgumentError`. Zero and negatives also throw.

---

## 8. Reserved Identifiers

The following identifiers are reserved as function names and reference namespaces. They must not be used as item IDs in config files:

**Reference namespaces:** `item`, `score`, `subscale`

**Function names:** `sum`, `avg`, `min`, `max`, `if`, `count`, `checked`
