# Madad — Implementation Specification
**Version:** 1.0  
**Status:** Draft  
**Supersedes:** ARCHITECTURE.md  

---

## 1. Purpose

This document specifies how Madad is to be built. It is intended for the developer or AI implementing the system. It describes module responsibilities, data models, engine behavior, scoring logic, PDF generation, and build/deployment. It should be read alongside the Behavioral Specification, which defines what the system does from the user's perspective.

---

## 2. Technology Stack

- **Runtime:** Vanilla JavaScript, ES Modules.
- **Components:** Lit (web components). Used for all UI components; logic modules (`src/engine/`, `src/config/`) remain pure JS with no framework dependency.
- **Build tool:** Vite. Dev server and production bundler.
- **Testing:** Vitest (unit), Playwright (E2E).
- **PDF:** pdfmake, lazy-loaded. `preloadPdf()` is called at session start to begin fetching in the background; the actual import resolves before the patient reaches the results screen.
- **Validation:** AJV (JSON Schema 2020-12). Imported statically in `loader.js` (not lazy) — validation is required synchronously during config loading. AJV is bundled into the `loader` chunk alongside the config loading code.
- **Styling:** CSS with logical properties. `dir="rtl"` at root.
- **No other production dependencies.**

---

## 3. Repository Structure

```
.
├── src/
│   ├── app.js                        # Entry point
│   ├── router.js                     # History API router
│   ├── controller.js                 # Wires orchestrator + engine to components
│   ├── controller.test.js
│   ├── config/
│   │   ├── loader.js                 # Fetches, validates, merges config
│   │   ├── loader.test.js
│   │   ├── QuestionnaireSet.schema.json
│   │   └── QuestionnaireSet.schema.test.js
│   ├── engine/
│   │   ├── sequence-runner.js        # Reusable sequence walker — resolves if/randomize nodes
│   │   ├── sequence-runner.test.js
│   │   ├── orchestrator.js           # Battery sequencing — feeds sequence runner at battery level
│   │   ├── orchestrator.test.js
│   │   ├── engine.js                 # Navigation within a single questionnaire
│   │   ├── engine.test.js
│   │   ├── scoring.js                # Score computation
│   │   ├── scoring.test.js
│   │   ├── dsl.js                    # Formula interpreter
│   │   ├── dsl.test.js
│   │   ├── alerts.js                 # Alert evaluation
│   │   └── alerts.test.js
│   ├── components/                   # Lit web components (UI only, no logic)
│   │   ├── app-shell.js / .test.js
│   │   ├── welcome-screen.js / .test.js
│   │   ├── completion-screen.js / .test.js
│   │   ├── results-screen.js / .test.js
│   │   ├── item-select.js / .test.js
│   │   ├── item-binary.js / .test.js
│   │   ├── item-instructions.js / .test.js
│   │   └── progress-bar.js / .test.js
│   ├── helpers/
│   │   ├── gestures.js               # Touch/pointer gesture utilities (swipe, overscroll)
│   │   └── gestures.test.js
│   ├── pdf/
│   │   ├── report.js                 # PDF generation
│   │   └── report.test.js
│   └── styles/
│       ├── main.css
│       └── tokens.css
├── composer/
│   ├── index.html
│   └── src/
│       └── composer.js
├── public/
│   ├── configs/
│   │   ├── prod/
│   │   └── test/
│   └── fonts/                        # Noto Sans Hebrew TTF
├── tests/
│   ├── setup.js
│   ├── setup-dom.js
│   ├── fixtures/                     # phq9.json, gad7.json, pcl5.json, ocir.json
│   └── e2e/                          # Playwright specs
├── scripts/
│   ├── validate-configs.mjs
│   └── check-size.mjs
├── docs/
│   ├── BEHAVIORAL_SPEC.md
│   ├── IMPLEMENTATION_SPEC.md
│   ├── CONFIG_SCHEMA_SPEC.md
│   ├── DSL_SPEC.md
│   ├── SEQUENCE_SPEC.md
│   └── RENDER_SPEC.md
└── .github/workflows/
```

---

## 4. Architecture Principles

**No DOM in logic modules.** Everything under `src/engine/` and `src/config/` must be pure logic with no DOM access. This makes unit testing trivial and keeps concerns separated. DOM manipulation lives only in `src/components/` (Lit web components), `src/controller.js`, and `src/app.js`.

**Lit for components, plain JS for logic.** UI components use Lit; all engine, scoring, DSL, alerting, and config logic is plain ES modules with no framework dependency. This keeps the logic independently testable in a Node environment.

**Flat item list.** Questionnaires have a single flat array of items. Instructions between sections are represented as items with `type: "instructions"` — not as a separate structural entity. The engine treats all item types uniformly for navigation purposes. Scoring, the response table, and progress counting each decide independently how to handle non-answerable item types.

**Lazy loading.** pdfmake is never imported at startup. `preloadPdf()` is called immediately after config loads (before the welcome screen interaction) so the pdfmake chunk begins downloading in the background and is ready by the time the patient reaches results. AJV is imported statically in `loader.js` — it is only ever loaded when the config is fetched (which happens before the session starts), AJV is bundled into the `loader` chunk since it is used synchronously during config loading.

**Config-driven.** All clinical content — instruments, items, scoring rules, alert thresholds, instructions — lives in JSON config files. Nothing clinical is hardcoded in the application logic.

---

## 5. Naming Conventions

These conventions apply uniformly across config JSON, JS source code, and the DSL. Consistency between all three layers avoids transformation and reduces cognitive overhead.

### 5.1 Case

| Layer | Convention | Example |
|---|---|---|
| Config JSON field names | camelCase | `questionnaireId`, `itemId`, `optionSets` |
| JS variables, functions, properties | camelCase | `currentItem`, `evaluateAlerts()` |
| JS module filenames | kebab-case | `sequence-runner.js`, `render-select.js` |
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

  // ── Answers ──────────────────────────────────────────────────────
  // Keyed by sessionKey (questionnaireId or instanceId), then by itemId
  answers: {
    [sessionKey]: {
      [itemId]: number
    }
  },

  // ── Scores ───────────────────────────────────────────────────────
  // Populated by the orchestrator after each questionnaire completes
  scores: {
    [sessionKey]: {
      total:      number | null,
      subscales:  { [subscaleId]: number },
      category:   string | null,
    }
  },

  // ── Alerts ───────────────────────────────────────────────────────
  // Populated by the orchestrator after each questionnaire completes
  alerts: {
    [sessionKey]: Alert[]   // Alert: { id, message, severity? }
  },
}
```

The resolved config and the `locked` flag are held by the controller, not on the session state object. The orchestrator's `sessionState()` method returns the `{ answers, scores, alerts }` object above.

### 6.2 Ownership and Mutation Rules

| Field | Created by | Mutated by | Read by |
|---|---|---|---|
| `name` | App shell (welcome screen) | Never after set | PDF generator |
| `pid` | App shell (URL params) | Never | PDF generator |
| `answers[qId]` | Orchestrator (on questionnaire start) | Engine (on each answer) | Scoring, DSL context, PDF |
| `scores[qId]` | Orchestrator (on questionnaire complete) | Never after set | Results screen, DSL context, PDF |
| `alerts[qId]` | Orchestrator (on questionnaire complete) | Never after set | PDF generator |

The resolved config object and the `locked` flag live in the controller, not in session state. No module other than those listed above should write to any field. Modules that only read state receive it as a function argument — they do not hold a reference to the full session object.

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
| App loads | Config fetch initiated; loading indicator shown |
| Config load complete | `preloadPdf()` called; welcome screen shown |
| Patient enters name and taps begin | `name` set; orchestrator initialized |
| Orchestrator starts a questionnaire | `answers[qId]` initialized to `{}` |
| Patient answers an item | `answers[qId][itemId]` set |
| Patient goes back and re-answers | `answers[qId][itemId]` overwritten |
| Questionnaire complete | `scores[qId]` and `alerts[qId]` set by orchestrator |
| Patient taps "view results" | `_locked` set to `true` in controller; router replaces to 'results' |

Once `_locked` is `true` in the controller, no further navigation into the questionnaire is possible. The router enforces this by ignoring popstate events when locked.

## 7. Config Schema

### 7.1 QuestionnaireSet

A config file represents a set of questionnaires. Multiple config files may be loaded and merged in a single session.

A set contains:
- A unique identifier and version string
- An array of questionnaire definitions
- An optional array of battery definitions (each with an ID and a sequence of nodes — see section 9)

### 7.2 Questionnaire

A questionnaire contains:
- A unique identifier within the set
- A display title
- An optional map of option set definitions (`optionSets`) — reusable select scale definitions scoped to this questionnaire
- An optional `defaultOptionSetId` — the option set used by any select item that declares neither `options` nor `optionSetId`. If a select item has no options and no default is set, the config loader throws a descriptive error.
- A flat array of items (see 5.3)
- An optional scoring specification (see 5.4)
- An optional array of interpretation ranges (see 5.5)
- An optional array of alert specifications (see 5.6)

### 7.3 Item

Every entry in the items array is an item. Items have a type that determines how they are rendered and whether they are scored.

**Supported types:**

`select` — a question with an ordered numeric scale. Contains the question text and either an inline `options` array (each option with a display label and numeric value), or an `optionSetId` referencing a named option set on the questionnaire. If neither is present, the questionnaire's `defaultOptionSetId` is used. Optional flags for reverse scoring and item weight.

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
          "type": "select",
          "text": "חוסר עניין או הנאה מדברים"
        },
        {
          "id": "9",
          "type": "select",
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

### 7.4 Scoring Specification

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

### 7.5 Interpretation Ranges

An array of inclusive `[min, max]` ranges, each with a label. The engine finds the first range that contains the total score and returns its label. Ranges may target the overall total or a named subscale.

### 7.6 Alert Specification

Each alert has:
- A unique identifier
- A condition — a DSL string that evaluates to a boolean (see section 12)
- A message string displayed in the PDF

Severity is not rendered in the current version but the data model should accommodate a future `severity` field with values such as `info`, `warning`, and `critical`.

---

## 8. Config Strategy

### 8.1 Single canonical instrument library

All standard questionnaire instruments are defined in a single file: `public/configs/prod/standard.json`. This is the authoritative source for all clinical content used in routine sessions. The Composer's manifest (`public/composer/configs.json`) points to this file.

Adding a new instrument means adding a new questionnaire definition to `standard.json`. See `docs/INSTRUMENTS.md` for the step-by-step process.

### 8.2 Specialised config files

Some future instruments will require their own config files rather than being added to `standard.json`. The criteria for a separate file:

- **Structured diagnostic interviews** (e.g. DIAMOND) — complex branching logic, conditional item sequences, or administrative overhead that would make `standard.json` difficult to maintain
- **Worksheet-style content** (e.g. CPT worksheets) — not scored assessments; different lifecycle and authoring process
- **Research instruments** — instruments used only in specific study contexts, not general clinical practice

Separate config files are loaded alongside `standard.json` via the `configs` URL parameter. All IDs must remain globally unique across all loaded files — the loader enforces this at runtime.

### 8.3 What does not belong in a config file

- Scoring logic or alert thresholds that vary per patient or per session — these must be fixed in the config
- Any data that changes at runtime — configs are loaded once at session start and are immutable for the duration of the session
- Authentication, credentials, or environment-specific URLs

### 8.4 Config namespaces

| Path | Purpose |
|---|---|
| `public/configs/prod/` | Production instruments — loaded by live sessions |
| `public/configs/test/` | Test fixtures — used in automated tests and staging only |

Never put test fixtures in `prod/`. The `validate:configs` script runs over all files in `public/configs/` — test fixtures must still be schema-valid.

---

## 9. Config Loading

The config loader is responsible for fetching, validating, and merging one or more QuestionnaireSet config files.

### 8.1 Source resolution

Each source passed to `loadConfig()` is one of:

| Source type | Example | Resolution |
|---|---|---|
| Slug (no slashes, no `.json`) | `prod/standard` | → `configs/prod/standard.json` (relative) |
| Relative path | `configs/prod/standard.json` | used as-is (relative) |
| Root-relative path | `/configs/prod/standard.json` | used as-is (absolute from origin) |
| Full URL | `https://example.com/q.json` | used as-is |

Relative and slug-resolved paths are resolved by the browser relative to the current page URL. This means the same path works correctly at any base path deployment (`/`, `/madad/`, etc.) without any runtime path detection.

**Rule:** Always use relative paths or slugs in `configs=` URL parameters. Root-relative paths (`/configs/...`) are only used internally by the Composer loader, which resolves them against the app root before passing to `loadConfig`.

### 8.2 Steps

1. For each source, fetch and parse the JSON file.
2. Validate against `QuestionnaireSet.schema.json` using AJV.
3. Run post-schema semantic checks (duplicate session keys, missing options, cross-entity ID collision within file).
4. Merge all questionnaire and battery arrays in order. **Duplicate IDs across files throw a `ConfigError` immediately.**
5. Return `{ questionnaires, batteries, version, resolvedAt }`.

Multiple sources are fetched in parallel.

### 8.3 Return shape

```js
{
  questionnaires: Questionnaire[],
  batteries:      Battery[],
  version:        string | null,
  resolvedAt:     string,
}
```

### 8.4 Errors

| Class | Cause |
|---|---|
| `ConfigFetchError` | HTTP failure or network error; exposes `url` |
| `ConfigValidationError` | AJV schema violation; exposes `url` and `validationErrors` array |
| `ConfigError` | Semantic violation: duplicate ID (within or across files), missing option set, cross-entity collision |

### 8.5 Default config

If no `configs` URL parameter is present, the app shell defaults to the slug `prod/standard`, which resolves to `configs/prod/standard.json`. The loader has no knowledge of defaults.

### 8.6 Injectable fetch

The loader accepts a `fetch` option for testing. In production it uses `globalThis.fetch`.

---

## 10. Sequence Runner

The sequence runner is a shared, context-agnostic module used by both the orchestrator and the engine. It contains all control-flow resolution logic. Neither the orchestrator nor the engine implement branching themselves. See SEQUENCE_SPEC.md for full design rationale.

### 9.1 Responsibilities

- Walk a sequence of nodes, yielding resolved leaf nodes one at a time
- Resolve `if` nodes lazily at the moment `advance()` reaches them
- Maintain a **resolved path** — the ordered list of leaf nodes yielded so far, at the current position
- Support back navigation by decrementing position in the resolved path
- On re-advance, replay already-resolved path entries where the branch is unchanged; truncate and diverge where a branch resolves differently
- Never touch the DOM, session state, answers, or scores

### 9.2 Interface

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

### 9.3 Control Flow Node Types

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

### 9.4 Condition Syntax

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
  "then": [{ "id": "3a", "type": "select", "text": "..." }],
  "else": []
}
```

---

## 11. Orchestrator — Battery Sequencing

The orchestrator manages the session at the battery level. It is responsible for initializing the sequence runner with a battery-level sequence and handing each resolved questionnaire to the engine in turn.

### 10.1 Session Source

The orchestrator accepts a `source` object as its second argument:

```js
// Named battery — looks up battery by ID in config.batteries (Map)
createOrchestrator(config, { batteryId: 'intake' }, callbacks)

// Pre-built sequence — used by the items URL model (see §12)
createOrchestrator(config, { sequence: [...] }, callbacks)
```

Both forms produce an identical sequence structure handed to the sequence runner. The pre-built sequence path is used by the app shell when resolving `items` URL tokens; the `batteryId` path is available for internal use.

### 10.2 Initialization

At session start the orchestrator:
1. Resolves the source (named battery lookup or pre-built sequence)
2. Initializes the sequence runner with the battery sequence
3. Calls `isSequenceDeterminate()` on the runner to determine progress display mode
4. Hands the first questionnaire to the engine

### 10.3 Transition

When the engine signals completion (its `advance()` returns `null`), the UI calls `orchestrator.engineComplete()`. The orchestrator then:
1. Reads scores and alerts from the completed engine and persists them into session state
2. Builds the battery-level DSL context from all completed scores so far
3. Calls `advance(context)` on the battery runner to get the next questionnaire node
4. Initializes a new engine for that node, or fires `onSessionComplete` if none remain

### 10.4 Progress Exposure

The orchestrator exposes to the UI:
- `isSequenceDeterminate` — from the sequence runner
- `totalQuestionnaires` — from `remainingCount()` if determinate, null if not
- `currentQuestionnaireIndex` — always known
- `currentQuestionnaireName` — always known

---

## 12. Engine — Navigation Within a Questionnaire

The engine manages navigation within a single questionnaire. It initializes its own sequence runner instance with the questionnaire's item list and delegates all sequence walking to it.

### 11.1 Responsibilities

- Initializes the sequence runner with the questionnaire's flat item array
- Calls `advance(context)` to get the next item, passing current item responses as context
- Calls `back()` to return to the previous item
- Records answers by item ID via `recordAnswer(itemId, value)` — never cleared
- On completion: runs `score()` and `evaluateAlerts()`, stores results
- Returns `null` from `advance()` to signal completion to the orchestrator
- Has no knowledge of the DOM or what questionnaire comes next

### 11.2 Progress Exposure

The engine exposes to the UI:
- `currentItem` — the resolved leaf node currently being displayed
- `totalItems` — from `remainingCount()` on the sequence runner (always determinate at item level unless item-level `if` nodes are present)
- `currentItemIndex` — always known

---

## 13. DSL Interpreter

The DSL interpreter is used in two contexts: evaluating scoring formulas and evaluating conditions in `if` nodes and alert specifications. It is the single expression language used throughout the system. It never uses `eval`.

### 12.1 Capabilities

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

### 12.2 Return Types

The interpreter returns either a numeric value (for scoring formulas) or a boolean value (for conditions). The caller determines which is expected. The interpreter throws a descriptive error if the expression returns the wrong type for the context.

### 12.3 Examples

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

### 12.4 Error Handling

The interpreter must throw a descriptive error for any unrecognised token, malformed expression, unresolved reference, or type mismatch. Errors should identify the offending expression and the context in which it was evaluated.

---

## 14. Alert Evaluation

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

## 15. Rendering

Each item type has a dedicated Lit web component. Components are passive — they receive resolved item data as properties, display it, and fire events. They contain no navigation logic.

**`<item-select>`** — receives a resolved item (with options array). Renders the question text and one button per option. On tap or Enter, fires `answer` (with value) then `advance`. The controller delays 150 ms between `answer` and calling `engine.advance()`.

**`<item-binary>`** — renders the question text and two buttons. Also listens for horizontal pointer swipe events via `gestures.js` (threshold: 40% of element width). On selection or committed swipe, fires `answer` then `advance`.

**`<item-instructions>`** — renders instruction text and a continue button. Fires `advance` without an `answer` event (instruction items are not scored).

All components must:
- Support RTL text layout
- Implement appropriate ARIA roles and labels
- Support keyboard navigation (arrow keys to change selection, Enter to advance)

---

## 16. Application Shell and Router

### 15.1 App Shell (`src/app.js`)

#### URL Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `configs` | No | `prod/standard` | Comma-separated config sources (slugs or relative paths). Slug `prod/standard` resolves to `configs/prod/standard.json`. |
| `items` | Yes | — | Comma-separated ordered list of questionnaire or battery IDs |
| `pid` | No | — | Optional patient identifier |

If `items` is absent or empty, a pre-welcome error screen is shown in Hebrew. If `configs` is absent, the default config is loaded.

#### Startup sequence
1. Parse URL parameters: `configs`, `items`, `pid`
2. If `items` is missing or empty: show error screen, halt
3. Show loading indicator
4. Fetch and validate all configs in parallel via `loadConfig(configSources)`
5. Call `resolveItems(itemTokens, config)` to build the session sequence
   - On `ItemResolutionError`: show error screen, halt
6. Call `preloadPdf()` (fire-and-forget background fetch)
7. Initialise router, show welcome screen
8. On begin: pass `config` and `{ sequence }` to the controller, which initialises the orchestrator

Session state is a plain in-memory object. It is never written to `localStorage` or `sessionStorage`.

#### Item resolution (`src/resolve-items.js`)

`resolveItems(tokens, config)` converts URL tokens into an orchestrator sequence:

- **Battery token** → the battery's full sequence is expanded inline, preserving all control-flow nodes (`if`, `randomize`). Each questionnaire reference within the battery is validated for existence and unambiguity.
- **Questionnaire token** → wrapped as `{ questionnaireId: token }`.
- **Conflicted token** (same ID in multiple configs) → throws `ItemResolutionError`.
- **Both-type token** (ID present as both questionnaire and battery across configs) → throws `ItemResolutionError`.
- **Not found** → throws `ItemResolutionError`.

Tokens are resolved in URL order, which defines the session order.

### 15.2 Router (`src/router.js`)
A minimal History API router using `pushState` / `replaceState`. Target under 60 lines. Screen names (stored as state values, not URL hashes):
- `'welcome'` — replaced onto the stack before the welcome screen shows
- `'q'` — pushed on each item advance (including first item of each questionnaire)
- `'complete'` — pushed when session completes
- `'results'` — replaces `'complete'` (one-way: patient cannot pop back to completion screen)

Direction is determined by comparing a monotonic `pos` counter embedded in every state entry. The controller registers `onBack` / `onForward` handlers and receives the screen name string.

---

## 17. Completion Screen

Shown when the engine reports the last item has been answered. Displays:
- A completion message
- A reminder that the Back button can still be used to review or change answers
- A "view results" button

Once the patient taps "view results", the router navigates to `#/results`. This transition is one-way — the back button is hidden or disabled on the results screen.

---

## 18. Results Screen

Displayed after session lock. Shows summary scores only — one total per questionnaire. Does not show interpretation labels, alerts, subscales, or individual responses.

Contains a single button to generate and deliver the PDF. The button label adapts to the device:
- **Mobile (Web Share API available):** "שתף דוח PDF" — triggers `navigator.share({ files: [...] })` so the patient can send the file directly via a messaging app or email.
- **Desktop (Web Share API unavailable):** "הורד דוח PDF" — triggers an anchor download.
- **Loading:** "מכין דוח..." while PDF generation is in progress.

The PDF is generated at the moment the patient taps the button; it is not generated automatically. `preloadPdf()` has already been called at session start so pdfmake and fonts are ready.

---

## 19. PDF Generation

pdfmake is imported dynamically via `preloadPdf()` at session start. By the time the patient reaches the results screen, the chunk is already cached. The Noto Sans Hebrew font (Regular + Bold) is embedded and loaded as separate hashed assets.

### 19.1 Public API

```js
preloadPdf()
// Fire-and-forget. Called once at session start. Begins fetching pdfmake + fonts.

generateReport(sessionState, config, session)
// → Promise<{ blob: Blob, filename: string }>
// Awaits preload internally. Safe to call at any time after preloadPdf().
// Does NOT trigger download — caller is responsible for share or anchor download.
```

### 19.2 pdfmake 0.3.x API

```js
// ✓ Correct — Promise-based, returns Uint8Array
const buffer = await pdfDoc.getBuffer();
const blob   = new Blob([buffer], { type: 'application/pdf' });

// ✗ Wrong — getBlob(callback) silently hangs in 0.3.x, callback never fires
```

### 19.3 RTL rendering rules

pdfmake has **incomplete Unicode Bidirectional Algorithm support**. It applies its own RTL reordering rather than delegating to the Unicode standard. This has several non-obvious consequences that have been resolved through careful implementation. Do not change any of the following without understanding the full impact.

**Rule 1 — Never use `rtl: true` on text nodes.**
Setting `rtl: true` on a node inside an RTL paragraph causes double-reversal — pdfmake reverses the content once for the `rtl` flag and once for the paragraph direction. The document default is `alignment: 'right'`; that is sufficient.

**Rule 2 — Never concatenate numbers into Hebrew strings.**
pdfmake reverses digit strings inside RTL text. `'ציון כולל: ' + score` will render the score digits in reverse order (e.g. `39` → `93`). All numeric values must be isolated in their own `{ text: String(n), direction: 'ltr' }` nodes.

**Rule 3 — Text node array order is right-to-left.**
In an RTL paragraph, pdfmake lays out text node arrays from right to left. Array index 0 renders on the right. To achieve the visual order `54 :ציון כולל` (right to left), the array must be `[number_node, colon_node, label_node]` — number first.

**Rule 4 — Use `bidiNodes()` for mixed Hebrew/Latin strings.**
pdfmake reverses Latin runs inside Hebrew text (e.g. `"OCD"` → `"DCO"`). The `bidiNodes()` function in `report.js` works around this by pre-reversing mixed-script runs before they reach pdfmake, so pdfmake's second reversal restores the correct visual order.

`bidiNodes()` is appropriate for:
- Subscale labels: `"שטיפה (Washing)"`, `"חדירה (Intrusion)"`
- Category labels: `"חשד ל-OCD"`, `"חשד ל-PTSD"`
- Alert messages and questionnaire titles containing Latin acronyms
- Item text in response table cells

`bidiNodes()` must **not** be used in the scores line text array alongside isolated number nodes — the pre-reversal conflicts with the explicit node ordering (Rule 3). In that context, pass the string as a plain `{ text: string }` node or use `bidiNodes()` on its own dedicated line.

**Rule 5 — Use NBSP (U+00A0) instead of regular spaces within Hebrew phrases.**
pdfmake drops regular spaces between Hebrew words in some contexts. All space characters within Hebrew label strings should be NBSP.

**Rule 6 — Category and subscale layout.**
The scores section uses a stack of separate lines:
1. Bold total line: `[number_node (ltr), colon_node, hebrew_label_node]`
2. Category line (if present): `bidiNodes(category)` — its own line to prevent bidi interference with the number
3. Subscale line (if present): per-subscale entries of `[number_node (ltr), colon_node, ...bidiNodes(label)]`, separated by `|`

Keeping the category on its own line is essential — mixing a Hebrew category string with a numeric node in the same text array causes pdfmake to pull the Hebrew rightward regardless of array position.

### 19.4 Document structure (in order)

1. **Patient information header** — name (if provided), patient ID, date/time.
2. **Clinical alerts** — all triggered alerts, each with its questionnaire title and message. Omitted if no alerts fired. Alert title uses `!` prefix (not `⚠` — that glyph is not in Noto Sans Hebrew).
3. **Questionnaire results** — for each instrument: bold total score line, category line (if defined), subscale line (if defined).
4. **Response table** — one row per answerable item (instruction items excluded): item number, item text, response label, numeric value. Risk highlighting:
   - Maximum possible value: soft red background (`#FCE8E8`, text `#8A1C1C`)
   - Second-highest value (select only): soft yellow background (`#FFF6DB`, text `#8A6A00`)
5. **Footer** — generation timestamp, app version, config version, app URL (`window.location.origin`).

### 19.6 Future: replace bidiNodes() with bidi-js

The current `bidiNodes()` function is a hand-rolled approximation of the Unicode Bidirectional Algorithm. It handles common cases (Hebrew+Latin mixing, digit isolation, parenthesis mirroring) but is fragile — each new punctuation pattern discovered in instrument content may require a new special case.

The correct long-term fix: add `bidi-js` (~15KB, no dependencies, full UAX-C1 conformance) as a pre-processor. Pre-apply the full Unicode BiDi Algorithm before text reaches pdfmake, then pass already-reordered strings as `direction:'ltr'` nodes so pdfmake never applies its own incorrect reordering. This eliminates all special cases and correctly handles any future content.

Implementation: replace `bidiNodes()` in `report.js` with a function that calls `bidi.getEmbeddingLevels()`, `bidi.getReorderSegments()`, and `bidi.getMirroredCharactersMap()` from `bidi-js`, then assembles the result as a single `{ text: reordered, direction: 'ltr' }` node. The change is ~50 lines in `report.js` plus one lazy-loaded dependency.

---

## 20. URL Composer

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

## 21. Bundle Size Constraints

The entry bundle includes the app shell, router, orchestrator, sequence runner, engine, and all renderers. Given this scope, the budget is set at 30 kB gzipped. pdfmake and AJV must remain lazy-loaded under all circumstances — this is a hard constraint regardless of entry size.

| Chunk | Budget |
|---|---|
| Entry (app shell, router, orchestrator, sequence runner, engine, renderers) | ≤ 30 kB gzipped |
| AJV (lazy) | ≤ 40 kB gzipped |
| pdfmake + font (lazy) | 250–400 kB (acceptable, lazy only) |

pdfmake and AJV must be pinned to separate named chunks in the Vite config to prevent them from being pulled into the entry bundle by static analysis.

---

## 22. Security

- CSP: `default-src 'self'`; `script-src 'self'`; `font-src 'self' data:`; `img-src 'self' data:`; `connect-src 'self'`
- All URL parameter values (name, pid) must be sanitized on read: NFKC normalization, length cap, strip markup.
- SRI attributes on font and pdfmake script tags.
- No secrets, tokens, or credentials exist anywhere in this system.

---

## 23. Testing Strategy

### Unit tests (Vitest, Node environment, no DOM)

Unit test files live next to the source file they test (`dsl.test.js` alongside `dsl.js`). The only exceptions are `tests/fixtures/` (shared JSON test vectors) and `tests/e2e/` (Playwright specs).

Vitest is configured to include `src/**/*.test.js` in its test glob.

- `dsl.test.js` — formula evaluation, all reference types, all operators, boolean logic, type enforcement, all error classes
- `scoring.test.js` — sum/average/subscale/reverse scoring, one fixture per instrument (PHQ-9, GAD-7, PCL-5) with known inputs and expected totals, subscales, and category labels
- `alerts.test.js` — DSL condition evaluation, triggered and untriggered cases, empty result
- `engine.test.js` — item-level navigation, back through instruction items, completion signal, answer storage and retrieval
- `sequence-runner.test.js` — `if` node evaluation, `randomize` (seeded), `isSequenceDeterminate`, `remainingCount`, back navigation through resolved sequences, nested control flow
- `orchestrator.test.js` — battery resolution (named and implicit), transition scoring, progress exposure
- `loader.test.js` — merge logic, filter logic, validation failure handling

### E2E tests (Playwright, Chromium + WebKit)
Located in `tests/e2e/`. Cover full flows that span multiple modules and require a real browser.
- Full patient flow: welcome → name entry → select item advance → binary → instruction item → completion screen → back navigation → results → PDF download
- PDF content assertions: text extraction to verify Hebrew content, patient ID, scores, and alert presence
- Composer flow: config load → battery/questionnaire selection → URL generation → copy
- Accessibility: axe-core injected on each screen, asserting WCAG AA

### Config validation (CI only)
- AJV CLI over all files in `public/configs/**` on every PR touching that path

### Bundle size (CI)
- Node script asserts gzipped entry chunk size after every build

---

## 24. Deployment

- Static hosting: GitHub Pages at `https://eladzlot.github.io/madad/` (primary), compatible with Netlify or Cloudflare Pages
- HTTPS required
- Cache strategy: immutable long-cache headers for hashed app assets; short TTL for config JSON files
- Config namespaces: `public/configs/prod/` for production, `public/configs/test/` for staging
- `APP_VERSION` injected at build time via Vite define; printed in PDF footer and embedded JSON

### Base path strategy

The app is deployed at `/madad/` on GitHub Pages but served at `/` in development. Vite's `base` config handles asset paths at build time (`mode === 'development'` → `'/'`, otherwise → `'/madad/'`). Runtime config fetches use **relative paths** so they resolve correctly at any base path without code changes:

- `configs/prod/standard.json` from `https://eladzlot.github.io/madad/` → `https://eladzlot.github.io/madad/configs/prod/standard.json` ✓
- `configs/prod/standard.json` from `http://localhost:5173/` → `http://localhost:5173/configs/prod/standard.json` ✓

The Composer manifest (`public/composer/configs.json`) stores root-relative paths (`/configs/...`). The Composer loader resolves these against the app root URL at runtime before fetching and stores them as relative paths (`configs/...`) in generated patient URLs.
