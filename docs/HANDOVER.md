# Handover Document
**Project:** Clinical Assessment App (working name: Measure)
**Document version:** 1.0
**Status:** Living document — update whenever the system state changes
**Purpose:** Everything a developer (human or AI) needs to understand the project, work safely within it, and expand it without breaking things.

---

## 1. What this system is

A static web application for clinical psychological assessment. It has no backend, no database, and no user accounts. All processing runs in the patient's browser. The only output is a PDF.

**Clinician workflow:** Opens `/composer/`, selects questionnaires, enters a patient ID, copies the generated URL, and sends it to the patient.

**Patient workflow:** Opens the URL, completes the questionnaires one item at a time, downloads a PDF, and sends it to the clinician.

**What never happens:** No patient data is stored anywhere. Nothing is transmitted. The PDF is the entire output and the clinician's responsibility to handle from that point.

---

## 2. Architecture in one page

```
public/configs/*.json          ← Clinical content lives here (instruments, scoring, alerts)
        │
        ▼
src/config/loader.js           ← Fetches, validates (AJV), merges configs
        │
        ▼
src/engine/
  orchestrator.js              ← Battery-level sequencing (which questionnaires, in what order)
  engine.js                    ← Item-level navigation within a single questionnaire
  sequence-runner.js           ← Shared if/randomize resolver used by both above
  scoring.js                   ← Score computation
  dsl.js                       ← Expression interpreter (alerts, conditions, custom scoring)
  alerts.js                    ← Alert evaluation after scoring
        │
        ▼
src/controller.js              ← Single wiring layer: engine ↔ components
        │
        ▼
src/components/                ← Lit web components (UI only, no logic)
  welcome-screen, item-likert, item-binary, item-instructions,
  completion-screen, results-screen, progress-bar, app-shell
        │
        ▼
src/pdf/report.js              ← PDF generation (pdfmake, lazy-loaded)
```

**The rule that holds everything together:** `src/engine/` and `src/config/` are pure logic — no DOM, no framework. They can be unit-tested in Node with no browser environment. DOM lives only in `src/components/`, `src/controller.js`, and `src/app.js`. If you ever find yourself importing a Lit component from an engine file, something has gone wrong.

**Technology:** Vanilla JS + ES Modules. Lit for components. Vite for build. Vitest for unit tests. Playwright for E2E. pdfmake for PDF. AJV for config schema validation.

---

## 3. Current state (as of handover)

### What is complete and tested
- Full patient flow: welcome → questionnaire items → completion → results → PDF download
- All item types: Likert, binary, instruction items
- Scoring: sum, average, subscales, custom DSL formula
- Alert evaluation (item-level and score-level conditions)
- Back navigation (including across instruction items, including keyboard and swipe)
- Session lock after viewing results
- PDF generation with patient info, alerts, scores, and response table with risk highlighting
- DSL interpreter (all operators, all reference types, error handling)
- Sequence runner with if-node branching and back-navigation through resolved paths
- Config loader with AJV validation, semantic checks, and multi-file merge
- URL Composer at `/composer/`
- Bundle size enforcement script (`npm run size`)
- Config validation script (`npm run validate:configs`)
- Unit tests for all engine modules (coverage ~95%+ on engine layer)

### What is stubbed / not implemented
- **`randomize` node:** The node shape is recognised by the sequence runner and schema, but executing it throws `NotImplementedError`. It is safe to leave this way until actually needed. Do not remove the schema definition.
- **Severity tiers in alerts:** The data model has a `severity` field reserved but it is not rendered in the PDF.
- **`APP_URL` constant:** Hardcoded to `'https://example.com'` in `src/pdf/report.js`. Needs to be replaced with the real URL before any production deployment. See §6 (Known gaps).
- **Embedded JSON attachment in PDF:** Planned for v2 (IMPLEMENTATION_SPEC §18.4). Not started.

### What does not exist yet
- **CI pipeline:** No `.github/workflows/` exists. The scripts (`lint`, `test`, `validate:configs`, `size`) are all written and working locally — they just aren't wired up to run automatically. See §7 (Next steps).
- **Deployment:** Not deployed anywhere. Targeting GitHub Pages.
- **GAD-7 and other instruments:** `standard.json` currently contains only PHQ-9 (and a leftover `test_q` fixture that should be removed). `emotion.json` contains PHQ-9, PCL-5, PDSS-SR, OCI-R, and ASI-3 but has no batteries defined and is not referenced by the Composer. The instrument library is in transition — see §5 (Config state).

---

## 4. Repository structure

```
.
├── src/                          # Application source
│   ├── app.js                    # Entry point — URL params, startup sequence
│   ├── router.js                 # History API router (~60 lines)
│   ├── controller.js             # Wires orchestrator + engine to components
│   ├── resolve-items.js          # Converts URL tokens to orchestrator sequence
│   ├── config/
│   │   ├── loader.js             # Fetch + validate + merge configs
│   │   ├── config-validation.js  # Semantic checks (post-AJV)
│   │   └── QuestionnaireSet.schema.json
│   ├── engine/
│   │   ├── sequence-runner.js    # if/randomize resolver — used by both engine and orchestrator
│   │   ├── orchestrator.js       # Battery-level sequencing
│   │   ├── engine.js             # Item-level navigation
│   │   ├── scoring.js            # Score computation
│   │   ├── dsl.js                # Expression interpreter
│   │   └── alerts.js             # Alert evaluation
│   ├── components/               # Lit web components
│   ├── helpers/gestures.js       # Touch/pointer swipe detection
│   ├── pdf/report.js             # PDF generation
│   └── styles/
├── composer/                     # Clinician URL-builder tool (separate entry point)
├── public/
│   ├── configs/
│   │   ├── prod/                 # standard.json, emotion.json
│   │   └── test/                 # (empty — for staging fixtures)
│   ├── fonts/                    # Noto Sans Hebrew TTF (Regular + Bold)
│   └── composer/configs.json     # Composer manifest (which config files to offer)
├── tests/
│   ├── fixtures/                 # phq9.json, pcl5.json, ocir.json (test vectors)
│   ├── e2e/                      # Playwright: patient flow, composer flow
│   └── setup.js / setup-dom.js
├── scripts/
│   ├── validate-configs.mjs      # Validate all public/configs/**/*.json
│   └── check-size.mjs            # Assert bundle size budgets after build
└── docs/
    ├── BEHAVIORAL_SPEC.md        # What the system does (user perspective)
    ├── IMPLEMENTATION_SPEC.md    # How it is built (developer perspective)
    ├── CONFIG_SCHEMA_SPEC.md     # Config JSON format reference
    ├── DSL_SPEC.md               # Expression language reference
    ├── SEQUENCE_SPEC.md          # Sequence runner design
    ├── RENDER_SPEC.md            # Component contract and controller wiring
    └── COMPOSER_SPEC.md          # Composer behavior
```

---

## 5. Config state and strategy

### The config model
Instruments (questionnaires and their scoring/alert rules) are defined in JSON files under `public/configs/`. The app loads one or more config files at runtime via the `configs` URL parameter and merges them. **IDs must be globally unique across all loaded files.**

### Current prod configs

| File | ID | Contains | Status |
|---|---|---|---|
| `prod/standard.json` | `standard` | PHQ-9 + `test_q` (leftover) + 2 batteries | Needs cleanup |
| `prod/emotion.json` | `clinical_scales_he` | PHQ-9, PCL-5, PDSS-SR, OCI-R, ASI-3 — no batteries | Intermediate state |

### Intended strategy (settled during handover)
- **`standard.json`** is the canonical instrument library. All instruments go here. It is the single source of truth for clinical content.
- **Thematic config files** (future) will be used for complex or specialised instruments that don't belong in the general library — e.g. DIAMOND (structured diagnostic interview), CPT worksheets, disorder-specific batteries. These will be loaded alongside `standard.json` via the multi-config URL mechanism.
- **`emotion.json` is a transitional artifact.** Its instruments (PCL-5, PDSS-SR, OCI-R, ASI-3) need to be migrated into `standard.json` and `emotion.json` retired. Until that migration is done, `emotion.json` is not referenced by the Composer.

### Immediate cleanup required
1. Remove `test_q` from `standard.json`
2. Migrate `emotion.json` instruments into `standard.json`
3. Add GAD-7 to `standard.json`
4. Define batteries in `standard.json`
5. Update `public/composer/configs.json` to reflect the final config structure
6. Update BEHAVIORAL_SPEC §9 to list the actual configured instruments

### How to add a new instrument — see `docs/INSTRUMENTS.md`

---

## 6. Known gaps and risks

| Gap | Risk | Resolution |
|---|---|---|
| `APP_URL` hardcoded to `example.com` in `src/pdf/report.js` | Low while not deployed; **must fix before going live** | Replace with `window.location.origin` — no build config needed |
| No CI pipeline | Any change can silently break lint, tests, config validity, or bundle budget | Create `.github/workflows/ci.yml` — see §7 |
| `emotion.json` instruments not in `standard.json` | Composer can't offer PCL-5 etc. to clinicians | Migrate per §5 |
| `test_q` in `prod/standard.json` | Exposes a non-clinical test fixture to real clinicians via Composer | Remove immediately |
| `randomize` node throws `NotImplementedError` | Safe for now; becomes an issue if a config author uses it | Document clearly; add a pre-flight check in `validate-configs` that warns if any config uses `randomize` |
| Branch coverage on components ~60% | UI regressions may go undetected | E2E tests compensate partially; acceptable until CI is running |
| Composer manifest (`configs.json`) only lists `standard.json` | `emotion.json` instruments invisible to clinicians | Resolved once migration is complete |
| `package.json` name is `psychology-questionnaire` | Minor inconsistency | Rename when product name is settled |

---

## 7. Next steps (in order)

These are sequenced so that each step leaves the project in a clean, working state. Do not skip ahead.

### Step 1 — Config cleanup (do first)
- Remove `test_q` from `standard.json`
- Migrate `emotion.json` instruments → `standard.json`
- Add GAD-7 to `standard.json`
- Define clinical batteries in `standard.json`
- **Add `description` and `keywords` to each instrument and battery** — optional fields now in schema; clinical lead authors these in any language. Keywords drive search in the Composer.
- Update Composer manifest
- Run `npm run validate:configs` to confirm everything is valid
- Update BEHAVIORAL_SPEC §9

### Step 2 — Fix `APP_URL` before any deployment
- Replace the hardcoded `https://example.com` in `src/pdf/report.js` with `window.location.origin`

### Step 3 — Composer search UI
The schema and spec are ready. The Composer UI (`composer/src/composer.js`) needs:
- A search input that filters the questionnaire/battery list in real time
- Match against `title`, `description`, and `keywords`
- Show keyword tags on each list entry if present
- This is a self-contained change to the Composer only; no engine or config changes required

### Step 3 — CI pipeline
Create `.github/workflows/ci.yml` running on every push and PR:
```
lint → unit tests → validate:configs → build → size check
```
The scripts for the last two already exist and work. This step makes the safety net automatic.

### Step 4 — Deploy to GitHub Pages
- Add a deploy workflow that runs after CI passes on `main`
- Document the config namespace convention: `prod/` for live, `test/` for staging

### Step 5 — Expand instrument library
With CI and a clean config baseline, adding new instruments is low-risk:
- Each instrument is a self-contained JSON block in `standard.json`
- Validated by `npm run validate:configs` on every PR
- No code changes required for standard Likert/binary instruments

---

## 8. How to orient in a new session

If starting a fresh session on this project, read in this order:
1. This document (done)
2. `docs/BEHAVIORAL_SPEC.md` — what the system does
3. `docs/IMPLEMENTATION_SPEC.md` — how it is built
4. `docs/CONFIG_SCHEMA_SPEC.md` — if you are touching configs

To run the project:
```bash
npm ci
npm run dev          # dev server at localhost:5173
npm test             # unit tests
npm run e2e          # Playwright E2E (requires dev server or preview)
npm run validate:configs
```

To add a new instrument: see `docs/INSTRUMENTS.md`.

---

## 9. What not to change without a plan

These are the parts of the system where a seemingly small change can have wide impact:

- **`src/engine/dsl.js`** — used by scoring, alerts, and sequence branching. A change here affects the entire DSL surface. Any change needs full `dsl.test.js` coverage.
- **`src/engine/sequence-runner.js`** — shared by both the orchestrator and the engine. Back-navigation logic is subtle; the test suite is the specification.
- **Session state shape** (`src/controller.js` §6 of IMPLEMENTATION_SPEC) — `answers`, `scores`, `alerts` keyed by `sessionKey`. The PDF generator, orchestrator, engine, and results screen all read from this. A shape change touches all of them.
- **`QuestionnaireSet.schema.json`** — changing the schema without updating `config-validation.js` and all existing config files will break validation.
- **The `pdfmake` API usage in `src/pdf/report.js`** — pdfmake 0.3.x uses Promise-based `getBuffer()`, not `getBlob(callback)`. The callback form silently hangs. Do not "fix" this.
- **Bundle chunk assignment in `vite.config.js`** — `pdfmake` and `ajv` are pinned to named chunks (`pdf-vendor`, `ajv-vendor`) to prevent them from being pulled into the entry bundle. Removing `manualChunks` will almost certainly blow the 60KB entry budget.
