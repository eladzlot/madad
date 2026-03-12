# Clinical Assessment App — Implementation Specification
**Version:** 1.2  
**Status:** Draft  
**Supersedes:** ARCHITECTURE.md  

---

## 1. Purpose

This document specifies how the Clinical Assessment App is to be built. It is intended for the developer or AI implementing the system. It describes module responsibilities, data models, engine behavior, scoring logic, PDF generation, and build/deployment. It should be read alongside the Behavioral Specification, which defines what the system does from the user's perspective.

---

## 2. Technology Stack

- **Runtime:** Vanilla JavaScript, ES Modules. No framework.
- **UI Components:** Lit (`lit` npm package, ~6 kB gzipped). Custom elements only — no Lit-specific routing or state management.
- **Build tool:** Vite. Dev server and production bundler.
- **Testing:** Vitest (unit). Test files are colocated with source (`*.test.js`). Playwright (E2E).
- **PDF:** pdfmake, lazy-loaded at the moment the patient requests the PDF.
- **Validation:** AJV (JSON Schema 2020-12), imported statically in `loader.js`. Not lazy-loaded.
- **Styling:** CSS with logical properties. `dir="rtl"` on `<html>` at root.
- **No other production dependencies.**

---

## 3. Repository Structure

```
.
├── index.html                        # Entry HTML — lang="he" dir="rtl"
├── composer/
│   └── src/
│       └── composer.js               # Clinician URL composer app
├── docs/
│   ├── BEHAVIORAL_SPEC.md
│   ├── CONFIG_SCHEMA_SPEC.md
│   ├── DSL_SPEC.md
│   └── IMPLEMENTATION_SPEC.md
├── public/
│   ├── configs/
│   │   ├── prod/
│   │   │   └── standard.json
│   │   └── test/
│   └── fonts/                        # Noto Sans Hebrew TTF
├── src/
│   ├── app.js                        # Entry point
│   ├── controller.js                 # Wires orchestrator + engine to Lit components
│   ├── controller.test.js
│   ├── components/
│   │   ├── app-shell.js
│   │   ├── app-shell.test.js
│   │   ├── completion-screen.js
│   │   ├── completion-screen.test.js
│   │   ├── item-binary.js
│   │   ├── item-binary.test.js
│   │   ├── item-instructions.js
│   │   ├── item-instructions.test.js
│   │   ├── item-likert.js
│   │   ├── item-likert.test.js
│   │   ├── progress-bar.js
│   │   ├── progress-bar.test.js
│   │   ├── results-screen.js
│   │   ├── results-screen.test.js
│   │   ├── welcome-screen.js
│   │   └── welcome-screen.test.js
│   ├── config/
│   │   ├── loader.js                 # Fetches, validates, merges config
│   │   ├── loader.test.js
│   │   ├── QuestionnaireSet.schema.json
│   │   └── QuestionnaireSet.schema.test.js
│   ├── engine/
│   │   ├── alerts.js
│   │   ├── alerts.test.js
│   │   ├── dsl.js
│   │   ├── dsl.test.js
│   │   ├── engine.js
│   │   ├── engine.test.js
│   │   ├── orchestrator.js
│   │   ├── orchestrator.test.js
│   │   ├── scoring.js
│   │   ├── scoring.test.js
│   │   ├── sequence-runner.js
│   │   └── sequence-runner.test.js
│   ├── helpers/
│   │   ├── gestures.js
│   │   └── gestures.test.js
│   ├── pdf/                          # PDF generation (not yet implemented)
│   └── styles/
│       ├── main.css
│       └── tokens.css
├── tests/
│   ├── e2e/                          # Playwright specs
│   ├── fixtures/
│   │   ├── ocir.json
│   │   ├── pcl5.json
│   │   └── phq9.json
│   ├── setup-dom.js
│   └── setup.js
├── vite.config.js
├── vitest.config.js
├── eslint.config.js
└── package.json
```

---

## 4. Architecture Principles

**No DOM in logic modules.** Everything in the engine layer (`sequence-runner.js`, `orchestrator.js`, `engine.js`, `scoring.js`, `dsl.js`, `alerts.js`) and the config layer (`loader.js`) must be pure logic with no DOM access. This makes unit testing trivial and keeps concerns separated. DOM manipulation lives only in Lit components (`components/`) and `app.js`.

**Flat item list.** Questionnaires have a single flat array of items. Instructions between sections are represented as items with `type: "instructions"` — not as a separate structural entity. The engine treats all item types uniformly for navigation purposes. Scoring, the response table, and progress counting each decide independently how to handle non-answerable item types.

**Lazy loading.** pdfmake is imported dynamically only when the patient requests the PDF. AJV is imported statically in `loader.js` — it is not lazy-loaded. The entry bundle budget is relaxed accordingly (see section 20).

**Config-driven.** All clinical content — instruments, items, scoring rules, alert thresholds, instructions — lives in JSON config files. Nothing clinical is hardcoded in the application logic.

**Lit for components.** All UI elements are Lit custom elements. Components are purely declarative: they receive data as properties, emit custom events, and have no knowledge of the engine, orchestrator, or session state. The controller (`controller.js`) is the sole wiring layer between the engine/orchestrator and the components.

---

## 5. Naming Conventions

These conventions apply uniformly across config JSON, JS source code, and the DSL. Consistency between all three layers avoids transformation and reduces cognitive overhead.

### 5.1 Case

| Layer | Convention | Example |
|---|---|---|
| Config JSON field names | camelCase | `questionnaireId`, `itemId`, `optionSets` |
| JS variables, functions, properties | camelCase | `currentItem`, `evaluateAlerts()` |
| JS module filenames | kebab-case | `sequence-runner.js`, `render-likert.js` |
| CSS class names | kebab-case | `results-screen`, `progress-bar` |

### 5.2 Identifiers in Config

**Questionnaire IDs** — lowercase with underscores. Must be unique within a loaded config set. Examples: `phq9`, `gad7`, `pcl5`, `custom_intake`.

**Battery IDs** — same rules as questionnaire IDs. Examples: `standard_intake`, `trauma_follow_up`.

**Item IDs** — clinician's choice. Must be a string, unique within their questionnaire, and a valid DSL identifier (letters, digits, underscores — no hyphens, no spaces). Examples: `1`, `anhedonia`, `sleep_disturbance`, `q3`. Integers are valid as strings (`"id": "1"`).

**Subscale IDs** — same rules as item IDs. Must be unique within their questionnaire.

**Option set IDs** — same rules as questionnaire IDs.

### 5.3 Item ID Scope

Item IDs are local to their questionnaire. The same ID may appear in two different questionnaires without conflict. In the DSL, `item.<id>` always resolves against the current questionnaire context — there is no way to reference an item from another questionnaire by item ID. Cross-questionnaire references use `score.<questionnaireId>` or `subscale.<questionnaireId>.<subscaleId>` instead.

### 5.4 Reserved Words

The following are reserved and must not be used as IDs: `item`, `score`, `subscale`, `sum`, `avg`, `min`, `max`, `if`.

---

## 6. Session State

Session state is a single plain JS object created by the app shell at startup and passed by reference to the orchestrator. It is the authoritative source of truth for everything that happens during a session. It is never serialized, never written to storage, and is lost when the browser tab is closed.

### 6.1 Shape

```js
{
  // ── Patient ──────────────────────────────────────────────────────
  name: string | null,         // entered on welcome screen; null if skipped
  pid:  string,                // from URL; sanitized on read

  // ── Config ───────────────────────────────────────────────────────
  config: {
    questionnaires: Questionnaire[],  // merged, filtered list
    batteries:      Battery[],        // available batteries
    version:        string,
    resolvedAt:     string,           // ISO timestamp
  },

  // ── Session progress ─────────────────────────────────────────────
  locked: boolean,             // true once patient proceeds to results screen

  // ── Answers ──────────────────────────────────────────────────────
  // Keyed by questionnaireId, then by itemId (local to questionnaire)
  answers: {
    [questionnaireId]: {
      [itemId]: number
    }
  },

  // ── Scores ───────────────────────────────────────────────────────
  // Populated by the orchestrator after each questionnaire completes
  scores: {
    [questionnaireId]: {
      total:      number | null,
      subscales:  { [subscaleId]: number },
      category:   string | null,
    }
  },

  // ── Alerts ───────────────────────────────────────────────────────
  // Populated by the orchestrator after each questionnaire completes
  alerts: {
    [questionnaireId]: Alert[]   // Alert: { id, message, severity? }
  },
}
```

### 6.2 Ownership and Mutation Rules

| Field | Created by | Mutated by | Read by |
|---|---|---|---|
| `name` | App shell (welcome screen) | Never after set | PDF generator |
| `pid` | App shell (URL params) | Never | PDF generator |
| `config` | Config loader | Never after load | Orchestrator, engine |
| `locked` | App shell | App shell only (on results transition) | Router, renderers |
| `answers[qId]` | Orchestrator (on questionnaire start) | Engine (on each answer) | Scoring, DSL context, PDF |
| `scores[qId]` | Orchestrator (on questionnaire complete) | Never after set | Results screen, DSL context, PDF |
| `alerts[qId]` | Orchestrator (on questionnaire complete) | Never after set | PDF generator |

No module other than those listed above should write to any field. Modules that only read state receive it as a function argument — they do not hold a reference to the full session object.

### 6.3 Current Questionnaire Context

The engine maintains a **current questionnaire context** — a derived view of session state scoped to the active questionnaire. This is what gets passed to the DSL interpreter for item-level condition and scoring evaluation:

```js
{
  item:     answers[currentQuestionnaireId],   // { [itemId]: any } — non-numeric values skipped by scoring
  subscale: scores[currentQuestionnaireId]?.subscales ?? {},
}
```

The battery-level context, passed to the DSL for battery-level `if` conditions, is derived by the orchestrator:

```js
{
  score:    { [qId]: scores[qId].total },
  subscale: { [qId]: scores[qId].subscales },
}
```

Neither context object holds a reference to the full session state — they are constructed fresh on each call.

### 6.4 State Transitions

| Event | State change |
|---|---|
| Patient enters name and taps begin | `name` set; config load initiated |
| Config load complete | `config` set; orchestrator initialized |
| Orchestrator starts a questionnaire | `answers[qId]` initialized to `{}` |
| Patient answers an item | `answers[qId][itemId]` set |
| Patient goes back and re-answers | `answers[qId][itemId]` overwritten |
| Questionnaire complete | `scores[qId]` and `alerts[qId]` set by engine |
| Patient taps "view results" | `locked` set to `true` |

Once `locked` is `true`, no further mutations to `answers`, `scores`, or `alerts` are permitted. The router enforces this by not rendering the questionnaire route when locked.

### 5.1 QuestionnaireSet

A config file represents a set of questionnaires. Multiple config files may be loaded and merged in a single session.

A set contains:
- A unique identifier and version string
- An array of questionnaire definitions
- An optional array of battery definitions (each with an ID and a sequence of nodes — see section 9)

### 5.2 Questionnaire

A questionnaire contains:
- A unique identifier within the set
- A display title
- An optional map of option set definitions (`optionSets`) — reusable Likert scale definitions scoped to this questionnaire
- An optional `defaultOptionSetId` — the option set used by any Likert item that declares neither `options` nor `optionSetId`. If a Likert item has no options and no default is set, the config loader throws a descriptive error.
- A flat array of items (see 5.3)
- An optional scoring specification (see 5.4)
- An optional array of interpretation ranges (see 5.5)
- An optional array of alert specifications (see 5.6)

### 5.3 Item

Every entry in the items array is an item. Items have a type that determines how they are rendered and whether they are scored.

**Supported types:**

`likert` — a question with an ordered numeric scale. Contains the question text and either an inline `options` array (each option with a display label and numeric value), or an `optionSetId` referencing a named option set on the questionnaire. If neither is present, the questionnaire's `defaultOptionSetId` is used. Optional flags for reverse scoring and item weight.

`binary` — a yes/no question. Contains the question text and optional custom labels for the two options (defaults to כן/לא). Stores values as 1 (yes) and 0 (no).

`instructions` — a non-scored display item. Contains only a text body. Rendered as an instruction screen with a continue button. Ignored by scoring, excluded from the response table in the PDF.

Future item types (not yet implemented) should be added here as new type values. The engine must fail with a clear error message if it encounters an unknown type.

**Example — a partial PHQ-9 config:**
```json
{
  "id": "phq9",
  "version": "1.0.0",
  "questionnaires": [
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
      },
      "items": [
        {
          "id": "intro",
          "type": "instructions",
          "text": "במשך השבועיים האחרונים, עד כמה סבלת מהבעיות הבאות?"
        },
        {
          "id": "1",
          "type": "likert",
          "text": "חוסר עניין או הנאה מדברים"
        },
        {
          "id": "9",
          "type": "likert",
          "text": "מחשבות שעדיף לך למות או לפגוע בעצמך"
        }
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
          { "min": 15, "max": 19, "label": "בינוני-חמור" },
          { "min": 20, "max": 27, "label": "חמור" }
        ]
      },
      "alerts": [
        {
          "id": "suicidality",
          "condition": "item.9 >= 1",
          "message": "פריט 9 — דיווח על מחשבות אובדניות"
        }
      ]
    }
  ]
}
```

### 5.4 Scoring Specification

Defines how a total score is computed from item responses.

Supported methods:
- `none` — no scoring. Total is null.
- `sum` — sum of all answered item values after applying reverse scoring and weights. Items with no numeric answer are skipped and do not contribute to the total.
- `average` — mean of answered item values. The denominator is the number of items that have a numeric answer — unanswered items are excluded entirely, not counted as 0.
- `subscales` — each subscale is scored independently (same skip-non-numeric rule applies); an overall total may also be defined.

Additional fields:
- `maxPerItem` — used for reverse scoring calculation: `reversedValue = maxPerItem - rawValue`
- `subscales` — a map of subscale identifiers to arrays of item IDs
- `customFormula` — a string expression evaluated by the DSL interpreter (see section 12)

Reverse scoring and item weights are defined per item, not in the scoring spec.

### 5.5 Interpretation Ranges

An array of inclusive `[min, max]` ranges, each with a label. The engine finds the first range that contains the total score and returns its label. Ranges may target the overall total or a named subscale.

### 5.6 Alert Specification

Each alert has:
- A unique identifier
- A condition — a DSL string that evaluates to a boolean (see section 12)
- A message string displayed in the PDF

Severity is not rendered in the current version but the data model should accommodate a future `severity` field with values such as `info`, `warning`, and `critical`.

---

## 8. Config Loading

The config loader is responsible for fetching, validating, and merging one or more QuestionnaireSet config files.

### 8.1 Source resolution

Each source is either a **slug** (no slashes, no protocol) or a **full URL** (starts with `https://`, `http://`, or `/`).

- Slug → `/configs/<slug>.json` (same origin)
- Full URL or absolute path → used as-is

This allows configs to be hosted on a different server.

### 8.2 Steps

1. For each source, fetch and parse the JSON file.
2. Validate against `QuestionnaireSet.schema.json` using AJV (imported at module load — not lazy, since validation is required before the app can start).
3. Run post-schema semantic checks:
   - Duplicate session keys within each battery (see SEQUENCE_SPEC §2.4)
   - Likert items with no resolvable options
4. Merge all questionnaire arrays, deduplicating by ID (later file wins).
5. Merge all battery arrays, deduplicating by ID (later file wins).
6. If `filterIds` is provided, filter questionnaires to that list.
7. Return `{ questionnaires, batteries, version, resolvedAt }`.

Multiple sources are fetched in parallel.

### 8.3 Errors

All errors are typed so the UI layer can catch and display appropriate Hebrew messages. The loader itself is language-agnostic — it throws descriptive English errors only.

| Class | Cause |
|---|---|
| `ConfigFetchError` | HTTP failure or network error; exposes `url` |
| `ConfigValidationError` | AJV schema violation; exposes `url` and `validationErrors` array |
| `ConfigError` | Semantic violation (duplicate session key, missing option set, etc.) |

The UI catches these error classes and maps them to Hebrew UI strings. This keeps the loader language-agnostic and supports future UI language changes.

### 8.4 Default config

If no `config` URL parameter is present, the app shell defaults to `['standard']`. This allows the app to work out of the box without URL params. The loader itself has no knowledge of defaults — defaulting is the app shell's responsibility.

### 8.5 Injectable fetch

The loader accepts a `fetch` option for testing. In production it uses `globalThis.fetch`.

---

## 9. Sequence Runner

The sequence runner is a shared, context-agnostic module used by both the orchestrator and the engine. It contains all control-flow resolution logic. Neither the orchestrator nor the engine implement branching themselves. See SEQUENCE_SPEC.md for full design rationale.

### 7.1 Responsibilities

- Walk a sequence of nodes, yielding resolved leaf nodes one at a time
- Resolve `if` nodes lazily at the moment `advance()` reaches them
- Maintain a **resolved path** — the ordered list of leaf nodes yielded so far, at the current position
- Support back navigation by decrementing position in the resolved path
- On re-advance, replay already-resolved path entries where the branch is unchanged; truncate and diverge where a branch resolves differently
- Never touch the DOM, session state, answers, or scores

### 7.2 Interface

```js
const runner = createSequenceRunner(sequence);

runner.advance(context)          // → leaf node; throws if no nodes remain
runner.back()                    // → leaf node; throws if at first node
runner.canGoBack()               // → boolean
runner.hasNext()                 // → boolean
runner.currentNode()             // → leaf node | null
runner.resolvedPath()            // → readonly array of leaf nodes so far
runner.isSequenceDeterminate()   // → boolean (no pending if nodes)
runner.remainingCount()          // → number | null
```

The context object is provided by the caller on each `advance()` call so conditions always evaluate against the latest session state.

### 7.3 Control Flow Node Types

**`if` node:**
```json
{
  "type": "if",
  "condition": "score.phq9 >= 10",
  "then": [ ... ],
  "else": [ ... ]
}
```
The `condition` is a DSL string evaluated at the point the node is reached. The `else` branch may be empty. Re-evaluation on re-advance is always the behavior — no `rewind` flag needed.

**`randomize` node (v1: not implemented):**
```json
{
  "type": "randomize",
  "ids": [ /* sequence nodes */ ]
}
```
`ids` is an array of sequence nodes to shuffle. v1: throws `NotImplementedError` if encountered.

### 7.4 Condition Syntax

**Battery-level context:**
```js
{ score: { [sessionKey]: number }, subscale: { [sessionKey]: { [id]: number } } }
```

**Item-level context:**
```js
{ item: { [itemId]: number }, subscale: { [subscaleId]: number } }
```

Example battery-level `if`:
```json
{
  "type": "if",
  "condition": "score.phq9 >= 10",
  "then": [{ "questionnaireId": "pcl5" }],
  "else": []
}
```

Example item-level `if`:
```json
{
  "type": "if",
  "condition": "item.3 >= 2",
  "then": [{ "id": "3a", "type": "likert", "text": "..." }],
  "else": []
}
```

---

## 10. Orchestrator — Battery Sequencing

The orchestrator manages the session at the battery level. It is responsible for initializing the sequence runner with a battery-level sequence and handing each resolved questionnaire to the engine in turn.

### 8.1 Battery Definition

A battery may be defined in two ways:

**Named battery in config** — a `batteries` array in the config file, alongside `questionnaires`. Each battery has an ID and a sequence of nodes. The URL `battery` param references the battery ID.

**Implicit from URL** — if the URL contains a `questionnaires` param with no `battery` param, the orchestrator constructs a linear battery at runtime from that list. This preserves backward compatibility.

Both cases produce an identical sequence structure that is handed to the sequence runner.

### 8.2 Initialization

At session start the orchestrator:
1. Resolves the battery (named or implicit)
2. Initializes the sequence runner with the battery sequence
3. Calls `isSequenceDeterminate()` on the runner to determine progress display mode
4. Hands the first questionnaire to the engine

### 8.3 Transition

When the engine signals completion (its `advance()` returns `null`), the UI calls `orchestrator.engineComplete()`. The orchestrator then:
1. Reads scores and alerts from the completed engine and persists them into session state
2. Builds the battery-level DSL context from all completed scores so far
3. Calls `advance(context)` on the battery runner to get the next questionnaire node
4. Initializes a new engine for that node, or fires `onSessionComplete` if none remain

### 8.4 Progress Exposure

The orchestrator exposes to the UI:
- `isSequenceDeterminate` — from the sequence runner
- `totalQuestionnaires` — from `remainingCount()` if determinate, null if not
- `currentQuestionnaireIndex` — always known
- `currentQuestionnaireName` — always known

---

## 11. Engine — Navigation Within a Questionnaire

The engine manages navigation within a single questionnaire. It initializes its own sequence runner instance with the questionnaire's item list and delegates all sequence walking to it.

### 9.1 Responsibilities

- Initializes the sequence runner with the questionnaire's flat item array
- Calls `advance(context)` to get the next item, passing current item responses as context
- Calls `back()` to return to the previous item
- Records answers by item ID via `recordAnswer(itemId, value)` — never cleared
- On completion: runs `score()` and `evaluateAlerts()`, stores results
- Returns `null` from `advance()` to signal completion to the orchestrator
- Has no knowledge of the DOM or what questionnaire comes next

### 9.2 Progress Exposure

The engine exposes to the UI:
- `currentItem` — the resolved leaf node currently being displayed
- `totalItems` — from `remainingCount()` on the sequence runner (always determinate at item level unless item-level `if` nodes are present)
- `currentItemIndex` — always known

---

## 12. DSL Interpreter

The DSL interpreter is used in two contexts: evaluating scoring formulas and evaluating conditions in `if` nodes and alert specifications. It is the single expression language used throughout the system. It never uses `eval`.

### 10.1 Capabilities

**Numeric functions:** `sum`, `avg`, `min`, `max`

**Conditional expression:** `if(condition, valueIfTrue, valueIfFalse)` — returns a numeric value. Not to be confused with the `if` sequence node, which uses a DSL condition string.

**References:**
- `item.<id>` — response value of a named item in the current questionnaire
- `subscale.<id>` — computed subscale value of the current questionnaire
- `score.<questionnaireId>` — total score of a completed questionnaire (battery-level context only)
- `subscale.<questionnaireId>.<subscaleId>` — subscale score of a completed questionnaire (battery-level context only)

**Comparison operators:** `<`, `>`, `<=`, `>=`, `==`, `!=`

**Boolean operators:** `&&`, `||`, `!`

**Literals:** numeric values

### 10.2 Return Types

The interpreter returns either a numeric value (for scoring formulas) or a boolean value (for conditions). The caller determines which is expected. The interpreter throws a descriptive error if the expression returns the wrong type for the context.

### 10.3 Examples

Scoring formula:
```
if(subscale.intrusion > 10, sum(subscale.intrusion, subscale.avoidance), avg(item.pcl1, item.pcl2))
```

Item-level condition in an `if` node:
```
item.phq9_3 >= 2 && item.phq9_4 == 0
```

Battery-level condition in an `if` node:
```
score.phq9 >= 10 || score.gad7 >= 8
```

Alert condition:
```
item.phq9_9 >= 1
```

Complex alert condition:
```
score.phq9 >= 15 && (item.phq9_9 >= 1 || subscale.phq9.somatic >= 6)
```

### 10.4 Error Handling

The interpreter must throw a descriptive error for any unrecognised token, malformed expression, unresolved reference, or type mismatch. Errors should identify the offending expression and the context in which it was evaluated.

---

## 13. Alert Evaluation

Alerts are evaluated after scoring is complete, against the full answers map and computed scores for the session.

Alert conditions are DSL expression strings evaluated by the DSL interpreter (see section 12). This is the same mechanism used by `if` nodes in the sequence runner — there is no separate condition evaluator.

Each alert has:
- A unique identifier
- A condition — a DSL string that evaluates to a boolean
- A message string displayed in the PDF
- An optional `severity` field for future use

The evaluator returns a list of triggered alerts. An empty list means no alerts were triggered. The result is used only by the PDF generator — it is never surfaced in the patient UI.

Example:
```json
{
  "id": "phq9_suicidality",
  "condition": "item.phq9_9 >= 1",
  "message": "פריט 9 — דיווח על מחשבות אובדניות"
}
```

Complex example:
```json
{
  "id": "high_risk_combined",
  "condition": "score.phq9 >= 15 && item.phq9_9 >= 1",
  "message": "דיכאון חמור עם אידיאציה אובדנית"
}
```

---

## 14. Rendering

The render layer is built on Lit custom elements. All components follow the contract defined in the DSL_SPEC.md render layer section: they receive data as properties, emit custom events, and have no knowledge of the engine or session state.

### 14.1 Item Components

**`<item-likert>`** — renders the question text and one button per option as a vertical `radiogroup`. On tap or Enter, fires `answer` (with `detail.value`) then `advance`. Space selects without advancing. Arrow keys move focus between options. Preserves the current selection via the `selected` property.

**`<item-binary>`** — renders the question text and two large tap targets (positive/negative). Supports two input methods:

- **Tap:** clicking either button fires `answer` then `advance` immediately.
- **Horizontal swipe:** `attachSwipe` from `gestures.js` is attached to the host element in `firstUpdated()`. Swipe right fires `answer` for option 0 (positive); swipe left fires `answer` for option 1 (negative). The commit threshold is `SWIPE_THRESHOLD` (0.4 × element width). During drag, the card translates and rotates with the pointer (`translateX` + `rotate` capped at ±12°). The target button highlights (`drag-target`) when the drag direction exceeds 10 px but has not yet committed; it switches to `drag-commit` styling once the threshold is crossed.

**`<item-instructions>`** — renders instruction text (split on `\n` into paragraphs) and a continue button. On tap or Enter/Space, fires only `advance` — no `answer` event. The engine advances without recording a response.

### 14.2 Navigation Gesture — `<app-shell>`

`<app-shell>` manages the scrollable content region and attaches `attachOverscroll` from `gestures.js` to the `.content` element in `firstUpdated()`. This provides pull-to-navigate alongside the header Back/Forward buttons:

- **Pull down past top boundary** (`onPullDown`) → fires `back` event — equivalent to tapping the Back button.
- **Pull up past bottom boundary** (`onPullUp`) → fires `forward` event — equivalent to tapping the Forward button.

Both gestures are gated by `gesturesEnabled` (a Lit property, default `true`) and the corresponding `canGoBack` / `canGoForward` flags. The gesture fires only when both the enabled flag and the nav flag are true.

The overscroll threshold is `OVERSCROLL_THRESHOLD` (60 px) from `gestures.js`.

**Completion screen gesture lockout:** when the session completes and the completion screen is shown, `gesturesEnabled` is set to `false` for 400 ms to absorb any trailing touch from the last answer tap, then restored to `true`. This prevents the pull-down gesture from accidentally triggering back navigation immediately on arrival at the completion screen, while still allowing swipe-back once the patient intentionally interacts with the screen.

### 14.3 Shell Layout

`<app-shell>` renders:
- A sticky header containing Back (chevron up) and Forward (chevron down) nav buttons, and a `<slot name="progress">` for the `<progress-bar>`.
- A scrollable `.content` main area with a centred `.content-inner` column, containing the default `<slot>` where item components and screen components are placed.

Nav buttons are hidden (`opacity: 0`, `pointer-events: none`) when disabled — they remain in layout to prevent reflow.

### 14.4 Other Components

**`<progress-bar>`** — display-only. Shows questionnaire name, item count (`שאלה N מתוך M`), a CSS-animated fill track, and battery-level progress when the battery contains more than one questionnaire.

**`<welcome-screen>`** — standalone (not inside `<app-shell>`). Full-viewport flex layout. Collects optional patient name and fires `begin` with `detail.name`.

**`<completion-screen>`** — placed inside `<app-shell>`'s default slot. Fires `view-results` when the patient proceeds. Has no scrollable content.

**`<results-screen>`** — placed inside `<app-shell>`'s default slot after session lock. Shows one score row per questionnaire. PDF download button (currently placeholder, pending implementation).

### 14.5 Accessibility

All item components must:
- Support RTL text layout (inherited via `dir="rtl"` on `<html>`)
- Implement appropriate ARIA roles and labels (`radiogroup`, `radio`, `aria-checked`, `aria-label` on nav buttons)
- Support keyboard navigation (arrow keys for Likert options, Enter to advance, Space to select-only on Likert)

---

## 15. Application Shell, Router, and Controller

### 15.1 App Entry (`app.js`)

The entry point performs the following in order:
1. Reads URL parameters: `config`, `battery`, `pid` (and optionally `questionnaires` for implicit battery mode).
2. Creates the router via `createRouter()` and calls `router.replace('welcome')` to seed the history stack.
3. Loads the config via `loadConfig()`. Displays a loading message while fetching; shows a Hebrew error on failure.
4. Finds the battery by ID and extracts its title for the welcome screen.
5. Mounts `<welcome-screen>` with the battery title.
6. On `begin` event: stores the patient name and pid in a session object, removes the welcome screen, creates a `createController(container, router)` instance, and calls `controller.start(config, batteryId, { createOrchestrator, session })`.

### 15.2 Router (`src/router.js`)

A minimal wrapper around the browser History API. Exposes `push(screen)`, `replace(screen)`, `onBack(handler)`, `onForward(handler)`, `currentScreen()`, and `destroy()`.

**Screen names:** `'welcome'`, `'q'`, `'complete'`, `'results'`.

**URL:** The URL never changes. `pushState` and `replaceState` are called without a new URL argument so the address bar stays fixed on the original patient link. This is intentional — the URL is a one-time clinical link and should not accumulate fragments or path changes.

**Back vs forward detection:** `history` does not expose a stack index, so the router embeds a monotonic `pos` counter in every state object. On `popstate`, it compares `state.pos` to its tracked `_currentPos`: lower means back, higher means forward. `replace()` keeps `_currentPos` unchanged so it never triggers either handler.

**Testability:** accepts an optional `win` parameter (default: `globalThis`) for injecting a mock window in unit tests.

### 15.3 Controller (`controller.js`)

The controller is the single wiring layer between the orchestrator/engine and the Lit components. It is created once per session and receives the router as a constructor argument.

**Navigation model:** all back and forward navigation — in-app buttons, overscroll gesture, and the browser's own buttons — is routed exclusively through `history.back()` / `history.forward()` → `popstate` → `_onPopBack()` / `_onPopForward()`. The shell `back` and `forward` events call `history.back()` and `history.forward()` respectively; they do not invoke the engine directly. This keeps the history stack in sync at all times.

**Responsibilities:**
- Registers `router.onBack(_onPopBack)` and `router.onForward(_onPopForward)` at start.
- Mounts `<app-shell>` and `<progress-bar>` at session start.
- On `onQuestionnaireStart`: calls `router.push('q')`, creates or reuses the appropriate item component, sets its `item` and `selected` properties, and updates nav state.
- On `answer` event: calls `engine.recordAnswer()` and updates nav state.
- On `advance` event: waits `ADVANCE_DELAY_MS` (150 ms) for answerable items (0 ms for instructions), calls `engine.advance()`, calls `router.push('q')` for the next item, or calls `orchestrator.engineComplete()` if the engine is done.
- On `onSessionComplete`: removes item and progress elements, sets `canGoBack: true`, briefly disables gestures (400 ms), calls `router.push('complete')`, and mounts `<completion-screen>`. On `view-results`, sets `_locked = true`, calls `router.replace('results')`, and mounts `<results-screen>`.
- `_onPopBack(screen)`: if `_locked`, ignored. If `screen === 'welcome'`, reloads the page. Otherwise dismisses any completion screen, calls `engine.back()` or `orchestrator.engineCrossBack()`.
- `_onPopForward(screen)`: if `_locked`, ignored. If `screen === 'complete'`, re-mounts the completion screen. If `screen === 'q'` and the current item has an answer, advances the engine without pushing a new history entry (replaying existing history).

**Item resolution:** before mounting, `resolveItem()` fills in the `options` array from the questionnaire's `optionSets` map if the item references an `optionSetId` or relies on `defaultOptionSetId`.

---

## 16. Completion Screen

Shown when the engine reports the last item has been answered. Displays:
- A completion message
- A reminder that the Back button can still be used to review or change answers
- A "view results" button

Once the patient taps "view results", the session is locked and the results screen is shown. This transition is one-way — back navigation is disabled on the results screen.

---

## 17. Results Screen

Displayed after session lock. Shows summary scores only — one total per questionnaire. Does not show interpretation labels, alerts, subscales, or individual responses.

Contains a single "download PDF" button. Tapping it triggers PDF generation (section 18).

---

## 18. PDF Generation

pdfmake is imported dynamically at the moment the patient requests the PDF. The Noto Sans Hebrew font is embedded and loaded as a separate hashed asset.

**Document structure (in order):**
1. Patient information header — name (if provided), patient ID, date/time, questionnaire list, config ID and version
2. Clinical alerts — all triggered alerts, each with its message. If no alerts were triggered, this section is omitted.
3. Questionnaire results — for each instrument: title, total score, subscale scores if applicable
4. Response table — one row per answerable item (instruction items excluded): item number, item text, response label, numeric value. Risk highlighting rules:
   - If the response value equals the maximum possible value for that item: soft red background (`#FCE8E8`, text `#8A1C1C`)
   - If the response value equals the second-highest possible value (Likert only, not binary): soft yellow background (`#FFF6DB`, text `#8A6A00`)
5. Footer — generation timestamp, app version, config version

**Embedded data:** The raw response data is embedded in the PDF as a machine-readable JSON attachment (`data.json`) using pdfmake's EmbeddedFiles mechanism, with an XMP summary. A hidden annotation fallback is included for PDF viewers that do not support EmbeddedFiles.

---

## 19. URL Composer

The Composer is a self-contained app at `/composer/`. It shares the config loader with the main app.

**Behavior:**
1. On load, fetches all available config files and presents two modes of selection:

   **Battery mode** — the clinician selects a named battery from the list of batteries defined in the config. The generated URL uses the `battery` param. This is the recommended path for standard clinical workflows.

   **Custom mode** — the clinician selects individual questionnaires from the full list. The generated URL uses the `questionnaires` param, which the orchestrator resolves as an implicit linear battery. This is the fallback for ad-hoc or non-standard sessions.

2. The clinician enters a patient ID.
3. The app generates and displays the patient URL.
4. A copy-to-clipboard button copies the URL.

The Composer uses no persistent storage of any kind.

---

## 20. Bundle Size

AJV is included in the entry bundle (statically imported in `loader.js`). pdfmake remains lazy-loaded — it is imported dynamically only when the patient requests the PDF.

| Chunk | Budget |
|---|---|
| Entry (app shell, controller, orchestrator, sequence runner, engine, components, AJV) | ≤ 80 kB gzipped |
| pdfmake + font (lazy) | 250–400 kB (acceptable, lazy only) |

pdfmake must be pinned to a separate named chunk in the Vite config (`pdf-vendor`) to prevent it from being pulled into the entry bundle by static analysis. AJV is similarly chunked (`ajv-vendor`) to keep the chunk graph legible, but is loaded eagerly.

---

## 21. Security

- CSP: `default-src 'self'`; `script-src 'self'`; `font-src 'self' data:`; `img-src 'self' data:`; `connect-src 'self'`
- All URL parameter values (name, pid) must be sanitized on read: NFKC normalization, length cap, strip markup.
- SRI attributes on font and pdfmake script tags.
- No secrets, tokens, or credentials exist anywhere in this system.

---

## 22. Testing Strategy

### Unit tests (Vitest, Node environment)

Unit test files are colocated with the source file they test, using the `.test.js` suffix (e.g. `dsl.test.js` alongside `dsl.js`). The exceptions are `tests/fixtures/` (shared JSON test vectors), `tests/setup.js`, and `tests/setup-dom.js`.

Vitest is configured with `include: ['**/*.test.js']` (project root glob).

- `dsl.test.js` — formula evaluation, all reference types, all operators, boolean logic, type enforcement, all error classes
- `scoring.test.js` — sum/average/subscale/reverse scoring, one fixture per instrument (PHQ-9, PCL-5, OCIR) with known inputs and expected totals, subscales, and category labels
- `alerts.test.js` — DSL condition evaluation, triggered and untriggered cases, empty result
- `engine.test.js` — item-level navigation, back through instruction items, completion signal, answer storage and retrieval
- `sequence-runner.test.js` — `if` node evaluation, `isSequenceDeterminate`, `remainingCount`, back navigation through resolved sequences, nested control flow
- `orchestrator.test.js` — battery resolution (named and implicit), transition scoring, progress exposure
- `loader.test.js` — merge logic, filter logic, validation failure handling
- `gestures.test.js` — swipe and overscroll attachment and threshold behaviour
- Component tests (`app-shell.test.js`, `item-*.test.js`, etc.) — property setting, event emission, keyboard navigation

### E2E tests (Playwright, Chromium + WebKit)
Located in `tests/e2e/`. Cover full flows that span multiple modules and require a real browser.
- Full patient flow: welcome → name entry → Likert advance → binary swipe → instruction item → completion screen → swipe back → results → PDF download
- PDF content assertions: text extraction to verify Hebrew content, patient ID, scores, and alert presence
- Composer flow: config load → battery/questionnaire selection → URL generation → copy
- Accessibility: axe-core injected on each screen, asserting WCAG AA

### Config validation (CI only)
- AJV CLI over all files in `public/configs/**` on every PR touching that path

---

## 23. Deployment

- Static hosting: GitHub Pages (primary), compatible with Netlify or Cloudflare Pages
- HTTPS required
- Cache strategy: immutable long-cache headers for hashed app assets; short TTL for config JSON files
- Config namespaces: `public/configs/prod/` for production, `public/configs/test/` for staging
- `APP_VERSION` injected at build time via Vite define; printed in PDF footer and embedded JSON
