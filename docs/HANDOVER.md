# Handover Document
**Project:** Madad — Clinical Assessment App
**Document version:** 1.2
**Status:** Living document — update whenever the system state changes
**Purpose:** Everything a developer (human or AI) needs to understand the project, work safely within it, and expand it without breaking things.

---

## 1. What this system is

A static web application for clinical psychological assessment. No backend, no database, no user accounts. All processing runs in the patient's browser. The only output is a PDF.

**Clinician workflow:** Opens `/composer/`, selects questionnaires, enters a patient ID, copies the generated URL, sends it to the patient.

**Patient workflow:** Opens the URL, completes questionnaires one item at a time, downloads a PDF, shares it with the clinician.

**What never happens:** No patient data is stored anywhere. Nothing is transmitted. The PDF is the entire output.

**Deployed at:** `https://eladzlot.github.io/madad/`
**Landing page:** `https://eladzlot.github.io/madad/landing/`
**Composer:** `https://eladzlot.github.io/madad/composer/`
**Contact:** Dr. Elad Zlotnick, Hebrew University / CTR — elad.zlotnick@mail.huji.ac.il

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
- PDF: bold total score on its own line; subscale scores on a second line with Hebrew labels
- PDF: numbers isolated in `direction:ltr` nodes — bypasses pdfmake RTL shaping
- PDF: mixed Hebrew/Latin strings via `bidiNodes()` with cross-script hyphen splitting
- PDF: `APP_URL` resolved dynamically via `window.location.origin`
- Composer at `/composer/` with real-time search by title, description, and keywords
- Landing page at `/landing/` for therapist-facing marketing
- CI workflow: `.github/workflows/ci.yml` — lint → unit tests → validate configs → build → size → E2E
- Deploy workflow: `.github/workflows/deploy.yml` — same + GitHub Pages deployment
- 636 unit tests passing across 24 test files
- E2E tests passing (Chromium; WebKit excluded from CI)

### Instrument library

**`standard.json` v1.2.0** — standard clinical scales:

| ID | Name | Subscales | Alerts |
|---|---|---|---|
| `phq9` | שאלון דיכאון (PHQ-9) | — | Suicidality (item 9 ≥ 1) |
| `gad7` | שאלון חרדה (GAD-7) | — | — |
| `pcl5` | שאלון פוסט טראומה (PCL-5) | Intrusion, Avoidance, Dysphoria, Hyperarousal | — |
| `oci_r` | שאלון טורדנות כפייתית (OCI-R) | Washing, Obsessing, Hoarding, Ordering, Checking, Neutralising | — |
| `pdss_sr` | שאלון פאניקה (PDSS-SR) | — | — |
| `asi_3` | שאלון רגישות לחרדה (ASI-3) | — | — |

**`intake.json` v1.0.0** — initial assessment screeners:

| ID | Name | Alerts |
|---|---|---|
| `diamond_sr` | DIAMOND Self Report Screener | Psychotic ideation (q29/q30), mania (q7), trauma (q19), substance use (q24/q25) |

**Policy:** Only open-source instruments. Do not add proprietary instruments (e.g. BDI-II) without a license.

No batteries defined yet.

### Config files and manifest

```
public/configs/
  prod/standard.json       ← Standard clinical scales (6 instruments)
  prod/intake.json         ← Initial assessment screeners (DIAMOND)
  test/e2e.json            ← E2E test fixtures only — not for clinical use
  CONTRIBUTING.md          ← How to add an instrument (human-readable)
  LLM_GUIDE.md             ← Comprehensive spec for LLM-assisted authoring
public/composer/
  configs.json             ← Composer manifest (lists all prod configs)
```

### What is stubbed / not implemented
- **`randomize` node:** Recognised by schema and runner; execution throws `NotImplementedError`. Do not remove the schema definition.
- **Severity tiers in alerts:** `severity` field exists in data model; not rendered differently in PDF. Planned next.
- **Embedded JSON attachment in PDF:** Planned. Not started.

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
├── landing/                      # Landing page for therapists
├── public/
│   ├── configs/                  # Clinical content (see above)
│   ├── fonts/                    # Noto Sans Hebrew TTF
│   └── composer/configs.json     # Composer manifest
├── tests/
│   ├── fixtures/                 # phq9.json, pcl5.json, ocir.json
│   ├── e2e/                      # patient-flow.e2e.test.js, composer.e2e.test.js
│   └── setup.js / setup-dom.js
├── scripts/
│   ├── validate-configs.mjs      # Cross-file ID collision detection included
│   └── check-size.mjs
├── .github/workflows/
│   ├── ci.yml                    # Runs on push + PRs
│   └── deploy.yml                # Runs on push to main, deploys to Pages
└── docs/
    ├── HANDOVER.md               ← this file
    ├── BEHAVIORAL_SPEC.md
    ├── IMPLEMENTATION_SPEC.md
    ├── CONFIG_SCHEMA_SPEC.md
    ├── COMPOSER_SPEC.md
    ├── INSTRUMENTS.md
    └── (RENDER_SPEC.md, SEQUENCE_SPEC.md, DSL_SPEC.md — implementation detail)
```

---

## 5. Config and URL strategy

### Config files
All standard instruments live in `public/configs/prod/`. Each file is a self-contained `QuestionnaireSet`. The Composer manifest (`public/composer/configs.json`) lists all prod configs — add a new file here to make it visible in the Composer.

The `test/e2e.json` file contains test-only instruments (`phq9_test`, `test_q`) and batteries used exclusively by E2E tests. It is listed in the manifest but clearly labelled.

### URL design
Config paths in `configs=` URL parameters are **relative** (no leading slash): `configs/prod/standard.json`. This resolves correctly from any base path (`/`, `/madad/`, etc.) without runtime detection. The Composer's `getAppRoot()` in `composer-state.js` derives the app root from `window.location.href` and prepends it to manifest paths for fetching, then stores the path without a leading slash as `sourceUrl` for use in generated URLs.

Do not use absolute paths (`/configs/...`) in generated patient URLs — they break at non-root deployments.

### Adding an instrument
See `public/configs/INSTRUMENTS.md` (human guide) or `public/configs/LLM_GUIDE.md` (LLM guide). The process is config-only — no application code changes required for standard Likert/binary instruments.

---

## 6. Known gaps

| Gap | Risk | Resolution |
|---|---|---|
| `randomize` throws `NotImplementedError` | Safe now; breaks if config author uses it | Documented in schema spec; validate:configs could warn |
| Alert severity not rendered in PDF | `critical` and `warning` look identical | Next planned feature |
| Embedded JSON in PDF | Machine-readable output for clinic systems | Planned, not started |
| Component branch coverage ~60% | UI regressions may go undetected | E2E tests compensate |

---

## 7. Next steps

### ~~Steps 1–4~~ ✓ Complete
Config cleanup, APP_URL fix, Composer search, GitHub Pages deployment — all done.

### ~~Step 5 — Landing page~~ ✓ Complete
`/landing/` live with Hebrew therapist-facing content, instrument cards, CTR attribution.

### ~~Step 6 — CI/CD~~ ✓ Complete
Both `ci.yml` and `deploy.yml` working. E2E passing on Chromium.

### ~~Step 7 — PDF: alert severity rendering~~ ✓ Complete
Critical/warning/info alerts now render with distinct colours. Alerts are sorted critical-first.

### Step 8 — PDF: embedded JSON attachment
Embed a machine-readable `data.json` attachment in the PDF using pdfmake's EmbeddedFiles. Allows clinic systems to parse scores without reading the visual PDF.

### Step 9 — PDF: replace bidiNodes() with bidi-js
The current `bidiNodes()` is a fragile hand-rolled approximation of the Unicode BiDi Algorithm. Replace it with `bidi-js` (15KB, no deps, fully conformant) to handle all mixed-script content correctly without special cases. See `IMPLEMENTATION_SPEC.md §19.6` for the full design.

### Step 10 — Batteries
Define the first clinical battery in `standard.json`. A `standard_intake` battery sequencing PHQ-9 → GAD-7 → conditionally PCL-5 is the obvious first candidate.

### Step 11 — Expand instrument library
Open-source instruments only. Use `public/configs/LLM_GUIDE.md` + an LLM to author efficiently. Candidates: SPIN, STAI, Y-BOCS self-report.

---

## 8. How to orient in a new session

Read in this order:
1. This document
2. `docs/BEHAVIORAL_SPEC.md`
3. `docs/IMPLEMENTATION_SPEC.md`
4. `docs/CONFIG_SCHEMA_SPEC.md` — if touching configs

```bash
npm ci
npm run dev              # localhost:5173 (base /)
npm test                 # 636 unit tests
npm run validate:configs
npm run build && npm run preview  # localhost:4173/madad/ (base /madad/)
```

To add a new instrument: `public/configs/CONTRIBUTING.md`.

---

## 9. What not to change without a plan

- **`src/engine/dsl.js`** — used by scoring, alerts, and sequence branching. Full `dsl.test.js` coverage required for any change.
- **`src/engine/sequence-runner.js`** — shared by orchestrator and engine. Back-navigation logic is subtle; tests are the specification.
- **Session state shape** — `answers`, `scores`, `alerts` keyed by `sessionKey`. PDF generator, orchestrator, engine, and results screen all read from this shape.
- **`QuestionnaireSet.schema.json`** — changing without updating `config-validation.js` and existing configs will break validation.
- **`src/pdf/report.js` — RTL rendering** — pdfmake has incomplete bidi support. Six rules documented in `IMPLEMENTATION_SPEC.md §19.3`. Short version: numbers in `direction:'ltr'` nodes, mixed Hebrew/Latin through `bidiNodes()`, category on its own line, never `rtl:true`, never concatenate numbers into Hebrew strings.
- **`src/pdf/report.js` — pdfmake API** — use `getBuffer()` (Promise-based). `getBlob(callback)` silently hangs in pdfmake 0.3.x.
- **`vite.config.js`** — `base` is `'/'` in development mode and `'/madad/'` in all other modes. `pdfmake` is pinned to a named chunk via `manualChunks` to keep it lazy-loaded and out of the entry bundle.
- **Config URL format** — `configs=` params must use relative paths (no leading slash). See §5 above.
- **`composer-state.js` `getAppRoot()`** — derives app root by stripping `/composer/...` from `window.location.href`. Any change to Composer URL structure requires updating this.
