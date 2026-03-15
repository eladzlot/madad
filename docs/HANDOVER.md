# Handover Document
**Project:** Clinical Assessment App (working name: Measure)
**Document version:** 1.1
**Status:** Living document — update whenever the system state changes
**Purpose:** Everything a developer (human or AI) needs to understand the project, work safely within it, and expand it without breaking things.

---

## 1. What this system is

A static web application for clinical psychological assessment. No backend, no database, no user accounts. All processing runs in the patient's browser. The only output is a PDF.

**Clinician workflow:** Opens `/composer/`, selects questionnaires, enters a patient ID, copies the generated URL, sends it to the patient.

**Patient workflow:** Opens the URL, completes questionnaires one item at a time, downloads a PDF, shares it with the clinician.

**What never happens:** No patient data is stored anywhere. Nothing is transmitted. The PDF is the entire output.

---

## 2. Architecture in one page

```
public/configs/*.json          ← Clinical content (instruments, scoring, alerts)
        │
        ▼
src/config/loader.js           ← Fetches, validates (AJV), merges configs
        │
        ▼
src/engine/
  orchestrator.js              ← Battery-level sequencing
  engine.js                    ← Item-level navigation
  sequence-runner.js           ← Shared if/randomize resolver
  scoring.js                   ← Score computation
  dsl.js                       ← Expression interpreter
  alerts.js                    ← Alert evaluation
        │
        ▼
src/controller.js              ← Single wiring layer: engine ↔ components
        │
        ▼
src/components/                ← Lit web components (UI only, no logic)
        │
        ▼
src/pdf/report.js              ← PDF generation (pdfmake, lazy-loaded)
```

**Core rule:** `src/engine/` and `src/config/` are pure logic — no DOM, no framework. DOM lives only in `src/components/`, `src/controller.js`, and `src/app.js`.

**Technology:** Vanilla JS + ES Modules. Lit for components. Vite for build. Vitest for unit tests. Playwright for E2E. pdfmake for PDF. AJV for config validation.

---

## 3. Current state

### What is complete and tested
- Full patient flow: welcome → items → completion → results → PDF
- All item types: Likert, binary, instructions
- Scoring: sum, average, subscales, custom DSL formula
- Alert evaluation (item-level and score-level conditions)
- Back navigation including keyboard and swipe
- PDF: patient info, alerts, scores, response table with risk highlighting
- PDF: bold total score on its own line; subscale scores on a second line with Hebrew labels from `subscaleLabels`
- PDF: numbers isolated in `direction:ltr` nodes — bypasses pdfmake RTL shaping
- PDF: mixed Hebrew/Latin strings via `bidiNodes()` with cross-script hyphen splitting
- PDF: `APP_URL` resolved dynamically via `window.location.origin`
- Composer at `/composer/` with real-time search by title, description, and keywords
- CI workflow: `.github/workflows/ci.yml`
- 635 unit tests passing across 24 test files

### Instrument library (`standard.json` v1.2.0)

| ID | Name | Subscales | Alerts |
|---|---|---|---|
| `phq9` | שאלון דיכאון (PHQ-9) | — | Suicidality (item 9 ≥ 1) |
| `gad7` | שאלון חרדה (GAD-7) | — | — |
| `pcl5` | שאלון פוסט טראומה (PCL-5) | Intrusion, Avoidance, Dysphoria, Hyperarousal | — |
| `oci_r` | שאלון טורדנות כפייתית (OCI-R) | Washing, Obsessing, Hoarding, Ordering, Checking, Neutralising | — |
| `pdss_sr` | שאלון פאניקה (PDSS-SR) | — | — |
| `asi_3` | שאלון רגישות לחרדה (ASI-3) | — | — |

No batteries defined yet — deferred until the instrument library is more complete.

### What is stubbed / not implemented
- **`randomize` node:** Recognised by schema and runner; execution throws `NotImplementedError`. Do not remove the schema definition.
- **Severity tiers in alerts:** `severity` field exists in data model; not rendered in PDF.
- **Embedded JSON attachment in PDF:** Planned v2. Not started.

### What does not exist yet
- **Deployment:** Not deployed. CI workflow is ready; deploy workflow is not.
- **Batteries:** Deliberately deferred until instrument library is complete enough.

---

## 4. Repository structure

```
.
├── src/
│   ├── app.js                    # Entry point
│   ├── router.js                 # History API router
│   ├── controller.js             # Wiring layer
│   ├── resolve-items.js          # URL token → orchestrator sequence
│   ├── config/
│   │   ├── loader.js
│   │   ├── config-validation.js
│   │   └── QuestionnaireSet.schema.json
│   ├── engine/
│   │   ├── sequence-runner.js
│   │   ├── orchestrator.js
│   │   ├── engine.js
│   │   ├── scoring.js
│   │   ├── dsl.js
│   │   └── alerts.js
│   ├── components/               # Lit web components
│   ├── helpers/gestures.js
│   ├── pdf/report.js             # PDF generation
│   └── styles/
├── composer/                     # Composer tool (separate entry point)
├── public/
│   ├── configs/
│   │   ├── prod/standard.json    # Canonical instrument library (v1.2.0)
│   │   ├── prod/emotion.json     # Archive — superseded, not referenced
│   │   └── test/                 # Staging fixtures (currently empty)
│   ├── fonts/                    # Noto Sans Hebrew TTF
│   └── composer/configs.json     # Composer manifest
├── tests/
│   ├── fixtures/                 # phq9.json, pcl5.json, ocir.json
│   ├── e2e/
│   └── setup.js / setup-dom.js
├── scripts/
│   ├── validate-configs.mjs
│   └── check-size.mjs
├── .github/workflows/ci.yml
└── docs/
    ├── HANDOVER.md               ← this file
    ├── BEHAVIORAL_SPEC.md
    ├── IMPLEMENTATION_SPEC.md
    ├── CONFIG_SCHEMA_SPEC.md
    ├── DSL_SPEC.md
    ├── SEQUENCE_SPEC.md
    ├── RENDER_SPEC.md
    ├── COMPOSER_SPEC.md
    └── INSTRUMENTS.md
```

---

## 5. Config strategy

All standard instruments live in `public/configs/prod/standard.json`. Adding an instrument is config-only — no code changes required for standard Likert/binary instruments. See `docs/INSTRUMENTS.md`.

Specialised config files (DIAMOND, CPT worksheets, research instruments) will be loaded alongside `standard.json` via the multi-config URL mechanism. All IDs must be globally unique across loaded files.

`emotion.json` is an archive. Schema-valid but not referenced. Delete when ready.

---

## 6. Known gaps

| Gap | Risk | Resolution |
|---|---|---|
| No deploy workflow | Cannot ship without one | Add `.github/workflows/deploy.yml` gated on CI |
| `randomize` throws `NotImplementedError` | Safe now; breaks if config author uses it | Already documented; add pre-flight warning to `validate:configs` |
| Component branch coverage ~60% | UI regressions may go undetected | E2E tests compensate; acceptable until CI is running |
| `emotion.json` still on disk | Minor confusion | Delete when ready |
| `package.json` name is `psychology-questionnaire` | Minor inconsistency | Rename when product name is settled |

---

## 7. Next steps

### ~~Step 1 — Config cleanup~~ ✓ Complete
All instruments in `standard.json` v1.2.0. GAD-7 included. PCL-5 and OCI-R have subscales and `subscaleLabels`.

### ~~Step 2 — Fix `APP_URL`~~ ✓ Complete
`report.js` uses `window.location.origin` via lazy `getAppUrl()`.

### ~~Step 3 — Composer search UI~~ ✓ Already implemented
Search, keyword chips, descriptions — fully built before this handover.

### Step 4 — Deploy to GitHub Pages
- Add `.github/workflows/deploy.yml` gated on CI passing on `main`
- Short-TTL cache for config JSON; immutable long-cache for hashed assets

### Step 5 — Batteries
Define clinical batteries in `standard.json` once the instrument library feels complete. Each battery needs `id`, `title`, `description`, `keywords`, and a `sequence`. See `docs/CONFIG_SCHEMA_SPEC.md §9`.

### Step 6 — Expand instrument library
Low-risk with CI in place. Follow the checklist in `docs/INSTRUMENTS.md`.

---

## 8. How to orient in a new session

Read in this order:
1. This document
2. `docs/BEHAVIORAL_SPEC.md`
3. `docs/IMPLEMENTATION_SPEC.md`
4. `docs/CONFIG_SCHEMA_SPEC.md` — if touching configs

```bash
npm ci
npm run dev              # localhost:5173
npm test                 # 635 unit tests
npm run validate:configs
```

To add a new instrument: `docs/INSTRUMENTS.md`.

---

## 9. What not to change without a plan

- **`src/engine/dsl.js`** — used by scoring, alerts, and sequence branching. Full `dsl.test.js` coverage required for any change.
- **`src/engine/sequence-runner.js`** — shared by orchestrator and engine. Back-navigation logic is subtle; tests are the specification.
- **Session state shape** — `answers`, `scores`, `alerts` keyed by `sessionKey`. PDF generator, orchestrator, engine, and results screen all read from this shape.
- **`QuestionnaireSet.schema.json`** — changing without updating `config-validation.js` and existing configs will break validation.
- **`src/pdf/report.js` — RTL rendering** — pdfmake has incomplete bidi support. Numbers must be isolated in `direction: 'ltr'` nodes. Mixed Hebrew/Latin strings go through `bidiNodes()`. Do not concatenate numbers into Hebrew strings. Do not use `rtl: true` on text nodes. The `bidiNodes()` hyphen-splitting only fires at **cross-script boundaries** — do not broaden it.
- **`src/pdf/report.js` — pdfmake API** — uses Promise-based `getBuffer()`. The callback form `getBlob(callback)` silently hangs.
- **`vite.config.js` chunk assignment** — `pdfmake` and `ajv` are pinned to named chunks. Removing `manualChunks` will pull them into the entry bundle.
