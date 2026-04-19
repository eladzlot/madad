# Handover Document
**Project:** Madad — Clinical Assessment App
**Document version:** 2.0
**Status:** Living document — update whenever the system state changes
**Purpose:** Everything a developer (human or AI) needs to understand the project, work safely within it, and expand it without breaking things.

---

## 1. What this system is

A static web application for clinical psychological assessment. No backend, no database, no user accounts. All processing runs in the patient's browser. The only output is a PDF.

**Clinician workflow:** Opens `/composer/`, selects questionnaires or a pre-built battery, enters a patient ID, copies the generated URL, sends it to the patient.

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
- All item types: select (Likert), binary (yes/no, requires explicit option labels), instructions, text, slider, multiselect
- Binary items require explicit option labels — supplied inline as `options`, via `optionSetId`, or via the questionnaire's `defaultOptionSetId`. The validator rejects bare binary items.
- Scoring: sum, average, subscales (sum or mean), custom DSL formula
- Scoring `exclude` field: item IDs listed in `scoring.exclude` are answered and shown in PDF but do not contribute to the total or any subscale. Used by PC-PTSD-5 for the gating exposure question.
- Alert evaluation (item-level and score-level conditions)
- Back navigation including keyboard and swipe
- PDF: patient info, alerts, scores, response table with risk highlighting
- PDF: bold total score on its own line; subscale scores on a second line with Hebrew labels
- PDF: numbers isolated in `direction:'ltr'` nodes — bypasses pdfmake RTL shaping
- PDF: mixed Hebrew/Latin strings via `bidiNodes()` with cross-script hyphen splitting
- PDF: `APP_URL` resolved dynamically via `window.location.origin`
- Composer at `/composer/` with real-time search, drag-to-reorder, keyboard navigation
- Composer mobile bar: share button (HTTPS only) with copy-link fallback on HTTP
- Composer dark mode: full dark theme via `@media (prefers-color-scheme: dark)`
- Landing page at `/landing/` — redesigned, direction 5 (radical simplicity), RTL, Hebrew
- Favicon: SVG `מ` on teal background at `public/favicon.svg`, linked in all index.html files
- Hebrew `<title>` on all pages
- Config manifest `dev: true` flag: configs marked `dev:true` are skipped in production builds, loaded in dev and test
- CI workflow: `.github/workflows/ci.yml` — lint → unit tests → validate configs → build → size → E2E
- Deploy workflow: `.github/workflows/deploy.yml` — same + GitHub Pages deployment
- **870 unit tests passing across 30 test files**
- E2E tests passing (Chromium; mobile-safari locally only)
- Dist-smoke E2E project (`tests/e2e/*.dist.test.js`) — runs Playwright against the *built* bundle served at the production base (`/madad/`) via `vite preview`. Catches the class of "works on dev, broken on dist" bugs that unit tests and the dev e2e suite cannot see (absolute-path fetches that bypass Vite's base, missing chunks, CSP violations). CI runs it at `/madad/` plus a multi-base matrix (`/`, `/some/deep/path/`).
- MIT license (`LICENSE`) + instrument notice (`CONTENT_LICENSE.md`)

### Instrument library

**`standard.json` v1.6.1** — 14 standard clinical scales:

| ID | Name | Notes |
|---|---|---|
| `phq9` | שאלון דיכאון (PHQ-9) | Alert: suicidality (item 9 ≥ 1) |
| `gad7` | שאלון חרדה (GAD-7) | — |
| `oci_r` | שאלון טורדנות כפייתית (OCI-R) | 6 subscales |
| `pdss_sr` | שאלון פאניקה (PDSS-SR) | — |
| `asi_3` | שאלון רגישות לחרדה (ASI-3) | — |
| `hai` | שאלון חרדת בריאות (HAI) | — |
| `mgh_hps` | סולם תלישת שיער MGH (MGH-HPS) | — |
| `spin` | שאלון פוביה חברתית (SPIN) | — |
| `isi` | מדד חומרת נדודי שינה (ISI) | — |
| `dar5` | שאלון תגובות כעס (DAR-5) | — |
| `oasis` | שאלון חומרת חרדה ופגיעה תפקודית (OASIS) | — |
| `wsas` | סולם עבודה והתאמה חברתית (WSAS) | — |
| `wai6` | שאלון ברית טיפולית (WAI-6) | — |
| `top3` | שלושת הבעיות המרכזיות | if-node branching; custom DSL formula |

Note: `pcl5` and `ptci` were moved from `standard.json` to `trauma.json` at v1.6.1.

**`trauma.json` v1.0.0** — trauma assessment:

| ID | Type | Name | Notes |
|---|---|---|---|
| `pc_ptsd5` | questionnaire | סקר טראומה קצר (PC-PTSD-5) | Binary screener; `exposure` item excluded from scoring via `scoring.exclude` |
| `pcl5` | questionnaire | שאלון פוסט טראומה (PCL-5) | 4 subscales (mean); alert at score ≥ 33 |
| `ptci` | questionnaire | שאלון קוגניציות פוסט-טראומטיות (PTCI) | 3 subscales (mean) |
| `trauma_eval` | battery | הערכת טראומה ראשונית | PC-PTSD-5 → if score ≥ 4: PCL-5 + PTCI |

**`intake.json` v1.2.1** — initial assessment:

| ID | Type | Name | Notes |
|---|---|---|---|
| `demographics` | questionnaire | פרטים אישיים | — |
| `diamond_sr` | questionnaire | DIAMOND Self Report Screener | Alerts: psychotic ideation, mania, trauma, substance use |
| `clinical_intake` | battery | הערכה ראשונית | DIAMOND → conditional questionnaires per domain |

`intake.json` declares `"dependencies": ["configs/prod/trauma.json"]` so the composer includes trauma.json automatically when clinical_intake is selected (needed because the DIAMOND trauma item conditionally adds pcl5 which now lives in trauma.json).

**Policy:** Only open-source or public-domain instruments. Do not add proprietary instruments (e.g. BDI-II) without a verified license.

### Config files and manifest

```
public/configs/
  prod/standard.json       ← 14 standard clinical scales
  prod/trauma.json         ← PC-PTSD-5, PCL-5, PTCI, trauma_eval battery
  prod/intake.json         ← DIAMOND, demographics, clinical_intake battery
  test/e2e.json            ← E2E test fixtures only (dev:true in manifest)
  CONTRIBUTING.md          ← How to add an instrument (human-readable)
  LLM_GUIDE.md             ← Comprehensive spec for LLM-assisted authoring
public/composer/
  configs.json             ← Composer manifest (lists all configs)
```

The e2e config has `"dev": true` in the manifest — it is skipped entirely in production builds (`import.meta.env.DEV === false`) but loads normally in dev and Playwright tests.

### What is stubbed / not implemented

- **`randomize` node:** Fully implemented. Recognised by schema, shuffled by `sequence-runner.js`, scored by `scoring.js` (recurses into `node.ids`), and rendered in the PDF response table by `report.js`.
- **Alert severity rendering in PDF:** fully implemented — `critical` (red), `warning` (amber), `info` (blue), `default` (grey). Alerts sorted critical-first. PHQ-9 suicidality is `critical`; PC-PTSD-5 and PCL-5 threshold alerts are `warning`.
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
│   ├── item-types.js             # Item type registry (isScored etc.)
│   ├── config/
│   │   ├── loader.js             # Fetch + validate + merge
│   │   ├── config-validation.js  # Semantic validation (IDs, options, etc.)
│   │   └── QuestionnaireSet.schema.json
│   ├── engine/
│   │   ├── sequence-runner.js    # Shared if/randomize resolver
│   │   ├── orchestrator.js       # Battery-level sequencing
│   │   ├── engine.js             # Item-level navigation
│   │   ├── scoring.js            # Score computation
│   │   ├── dsl.js                # Expression interpreter
│   │   └── alerts.js             # Alert evaluation
│   ├── components/               # Lit web components
│   │   ├── app-shell.js
│   │   ├── welcome-screen.js
│   │   ├── item-select.js
│   │   ├── item-binary.js        # Two-button yes/no — labels supplied by config
│   │   ├── item-instructions.js
│   │   ├── item-text.js
│   │   ├── item-slider.js
│   │   ├── item-multiselect.js
│   │   ├── progress-bar.js
│   │   ├── completion-screen.js
│   │   └── results-screen.js
│   ├── helpers/gestures.js       # Swipe gesture handler
│   ├── pdf/report.js             # PDF generation (pdfmake, lazy-loaded)
│   └── styles/
│       ├── main.css
│       └── tokens.css            # Design tokens incl. dark mode
├── composer/                     # Composer tool (separate Vite entry point)
│   ├── index.html
│   └── src/
│       ├── composer.js
│       ├── composer-state.js
│       ├── composer-handlers.js
│       ├── composer-loader.js    # Manifest fetch, dev:true filtering
│       └── composer-render.js   # Full UI + dark mode overrides
├── landing/                      # Landing page for therapists
│   └── index.html
├── public/
│   ├── configs/                  # Clinical content (see above)
│   ├── fonts/                    # Noto Sans Hebrew TTF
│   ├── favicon.svg               # מ on teal — favicon for all pages
│   └── composer/configs.json     # Composer manifest
├── tests/
│   ├── fixtures/                 # phq9.json, pcl5.json, ocir.json, top3.json
│   ├── e2e/
│   │   ├── patient-flow.e2e.test.js
│   │   └── composer.e2e.test.js  # mobile-safari skips for output-panel tests
│   └── setup.js / setup-dom.js
├── scripts/
│   ├── validate-configs.mjs      # Schema + cross-file ID collision check
│   ├── build-validator.mjs       # Regenerates validate-schema.js from AJV
│   └── check-size.mjs
├── .github/workflows/
│   ├── ci.yml                    # push + PRs
│   └── deploy.yml                # push to main → GitHub Pages
├── docs/                         # Developer specs (see README §Documentation)
├── LICENSE                       # MIT
└── CONTENT_LICENSE.md            # Instrument notice (no ownership claimed)
```

---

## 5. Config and URL strategy

### Config files
All standard instruments live in `public/configs/prod/`. Each file is a self-contained `QuestionnaireSet`. The Composer manifest (`public/composer/configs.json`) lists all prod configs — add a new file there to make it visible in the Composer.

Multi-config dependencies: if a config references instruments from another config (e.g. `intake.json` references `pcl5` from `trauma.json`), declare the dependency in the config's `"dependencies"` array. The loader records this and the composer includes the dependency automatically in generated URLs.

The `test/e2e.json` file is marked `"dev": true` in the manifest — never loads in production.

### URL design
The Composer emits **short names** in `configs=` URL parameters (e.g. `?configs=standard,intake`). Short names are the manifest entry's URL with the `configs/prod/` prefix and `.json` suffix stripped. They are a stable external contract — see `docs/COMPOSER_SPEC.md` for the full rules (don't rename prod configs, don't reuse short names across namespaces, etc.).

The loader (`src/config/loader.js`) also accepts full paths (`configs/prod/standard.json`) and root-relative paths (`/configs/prod/standard.json`) for hand-crafted URLs and legacy callers. All three forms normalise to the same canonical URL internally, so a config appearing in both `configs=` and as a declared dependency is only fetched once.

**Do not use absolute paths (`/configs/...`) in generated patient URLs** — they break at non-root deployments. Use short names.

### Adding an instrument
See `public/configs/CONTRIBUTING.md` (human guide) or `public/configs/LLM_GUIDE.md` (LLM guide). The process is config-only — no application code changes required for standard Likert/binary instruments.

---

## 6. Known gaps

| Gap | Risk | Resolution |
|---|---|---|
| Alert severity rendering | ✓ Complete | — |
| Embedded JSON in PDF | Machine-readable output for clinic systems | Planned, not started |
| Component branch coverage ~60% | UI regressions may go undetected | E2E tests compensate |
| Production-only failures invisible to dev/unit tests | Bugs reach patients (e.g. the base-path bug that produced "לא ניתן לטעון את השאלון" on `/madad/` while dev worked) | ✓ Resolved — `dist-smoke` Playwright project runs against the built bundle at the production base in CI; deploy is gated on it |

## 6a. Security model (summary)

The following security controls are in place. Do not remove them without understanding the implications.

| Control | Location | What it prevents |
|---|---|---|
| `allowedOrigins` in `loadConfig` | `src/config/loader.js` | External servers injecting malicious configs via crafted `?configs=` URLs. Default: same-origin only. |
| `http://` rejection | `src/config/loader.js` | Config loading over unencrypted transport. |
| `textContent` in error rendering | `src/app.js`, `src/controller.js` | XSS via error messages containing HTML from crafted URL parameters. |
| PID validation (`PID_PATTERN`, max 64 chars) | `src/app.js` | Crafted PIDs entering error surfaces or the PDF filename. |
| Name length cap (200 chars) + BiDi strip | `src/components/welcome-screen.js` | Oversized or directionally-manipulated names in the PDF. |
| `_isSafePattern` ReDoS guard | `src/components/item-text.js` | Config-supplied `pattern` fields causing catastrophic regex backtracking. |
| Content-Security-Policy meta tag | `index.html`, `composer/index.html` | Limits the blast radius of any future XSS: no inline scripts, no external connects. |

**To allow an external config server in the future**, pass `allowedOrigins` at the `loadConfig` call site in `src/app.js` — no changes to `loader.js` are needed. See `IMPLEMENTATION_SPEC.md §9.1`.

---

## 7. Completed work (session history)

- Full patient flow, all item types, scoring, alerts, back navigation
- PDF: RTL rendering, subscale labels, alert sorting, risk highlighting
- Composer: search, drag-to-reorder, keyboard navigation, mobile bar, dark mode
- Config system: AJV validation, semantic validation, cross-file merging, `dependencies` field
- `scoring.exclude` field — items answered and shown in PDF but excluded from total/subscales
- Trauma config: `pc_ptsd5` (binary screener with `exclude`), `pcl5`, `ptci`, `trauma_eval` battery
- Binary item labels: supplied per-questionnaire via `options`, `optionSetId`, or `defaultOptionSetId` — no hardcoded fallback
- Composer manifest `dev: true` flag — e2e config invisible in production
- Landing page: direction 5 redesign (typographic, minimal, RTL Hebrew)
- Favicon: SVG `מ` on teal, all index.html files updated
- Hebrew page titles on all pages
- MIT license + CONTENT_LICENSE.md instrument notice
- 932 unit tests across 30 files; E2E passing on Chromium
- Alert severity rendering: `critical` (red), `warning` (amber), `info` (blue); all alerts tagged
- Interpretation labels audited and standardised — severity vs screening threshold language
- WSAS top band label fixed ("פסיכופתולוגיה" → "פגיעה תפקודית חמורה")
- bidi-js integrated (replaced hand-rolled bidiNodes approximation)
- Documentation: README rewritten, HANDOVER updated, INSTRUMENTS/CONTRIBUTING consolidated, CHANGELOG created
- Test coverage: 90%+ statements/lines, 84%+ branches — all thresholds passing
- Coverage config: validate-schema.js, composer.js, composer-render.js excluded (generated/DOM entry files)
- Scroll fix: `overflow: hidden` removed from `.content-inner`; `body` and `app-shell` host use fixed height (`block-size: 100dvh` / `block-size: 100%`) so `.content` scroll container is properly constrained
- `totalMethod: sum_of_items` added to scoring engine and schema — allows subscale mean + raw item sum total (used by PCL-5)
- Mean subscale values rounded to 1 decimal in PDF (integers remain whole)
- Questionnaire title naming convention: Hebrew name + initials in parentheses e.g. `שאלון דיכאון (PHQ-9)`. Convention only, not enforced by schema.
- Validator cross-file battery reference check: `checkCrossFileBatteryRefs()` in `config-validation.js` — catches undeclared dependencies at `npm run validate:configs` time
- `intake.json` dependency fix: added `standard.json` to dependencies (v1.2.2)
- Composer sidebar contrast improved: section labels, hints, URL box, placeholder nudged lighter
- **Base-path resolution fix** — `loadConfig` now accepts a `baseUrl` option (default `import.meta.env.BASE_URL`) and prepends it to short-name and legacy-relative config paths. Without this, the production bundle fetched `/configs/prod/standard.json` instead of `/madad/configs/prod/standard.json` and every patient saw "לא ניתן לטעון את השאלון". Closed by the `dist-smoke` Playwright project (runs against built bundle at production base) plus a CI multi-base matrix. `ConfigFetchError` gained an `httpStatus` field; `app.js` now distinguishes timeout / HTTP error / network error and shows a more honest message in each case (the previous catch told every patient to check their internet, including for 404s — which are not patient-fixable).

## 8. Next steps

### Step A — PDF: embedded JSON attachment
Embed a machine-readable `data.json` attachment in the PDF. Allows clinic systems to parse scores without reading the visual PDF.

### Step B — Interpretation type field (optional)
Add `"type": "severity" | "screening"` to interpretation blocks so the PDF and future tooling can distinguish validated severity bands from screening cutoffs. Current approach: encode the distinction in the label text (e.g. "סף סינון"). Revisit if UI needs change.

### Step C — Dissemination
Tool is ready to ship. Priority actions:
- Send to 3–5 known therapists for feedback
- Post in Israeli therapist Facebook groups (genuine MBC content, not ads)
- Short screen-recording walkthrough (60-90 sec): composer → patient fills → PDF

### ~~Step D — Documentation: update remaining specs~~ ✓ Complete
COMPOSER_SPEC.md rewritten. All specs current.

---

## 9. How to orient in a new session

Read in this order:
1. This document
2. `docs/BEHAVIORAL_SPEC.md`
3. `docs/IMPLEMENTATION_SPEC.md`
4. `docs/CONFIG_SCHEMA_SPEC.md` — if touching configs

```bash
npm ci
npm run dev              # localhost:5173 (base /)
npm test                 # 932 unit tests
npm run validate:configs
npm run build && npm run preview  # localhost:4173/madad/ (base /madad/)
```

To add a new instrument: `public/configs/CONTRIBUTING.md`.

---

## 10. What not to change without a plan

- **`src/engine/dsl.js`** — used by scoring, alerts, and sequence branching. Full `dsl.test.js` coverage required for any change.
- **`src/engine/sequence-runner.js`** — shared by orchestrator and engine. Back-navigation logic is subtle; tests are the specification.
- **Session state shape** — `answers`, `scores`, `alerts` keyed by `sessionKey`. PDF generator, orchestrator, engine, and results screen all read from this shape.
- **`QuestionnaireSet.schema.json`** — changing without running `npm run build:validator` and updating `config-validation.js` and existing configs will break validation. Always run `build:validator` after schema changes.
- **`src/pdf/report.js` — RTL rendering** — pdfmake has incomplete bidi support. bidi-js (UAX-9 conformant) is used for mixed Hebrew/Latin text via `bidiNodes()`. Numbers go in `direction:'ltr'` nodes, category on its own line, never `rtl:true`. See `IMPLEMENTATION_SPEC.md §19.3`.
- **`src/pdf/report.js` — pdfmake API** — use `getBuffer()` (Promise-based). `getBlob(callback)` silently hangs in pdfmake 0.3.x.
- **`vite.config.js`** — `base` is `'/'` in development mode and `'/madad/'` in all other modes (overridable via `MADAD_BASE` env var for the CI multi-base matrix). `pdfmake` is pinned to a named chunk via `manualChunks` to keep it lazy-loaded and out of the entry bundle.
- **Config URL format** — `configs=` params must use relative paths (no leading slash). See §5 above.
- **`loadConfig` `baseUrl` default** — defaults to `import.meta.env.BASE_URL`, which Vite inlines to `'/madad/'` at build time. Removing this re-introduces the production-only "לא ניתן לטעון את השאלון" bug: short config names would expand to root-relative paths (`/configs/prod/...`) that bypass Vite's `base` and 404 on every non-root deployment. The dist-smoke Playwright project (`tests/e2e/*.dist.test.js`, run by `npm run e2e:dist`) is the regression gate — it loads the built bundle at the production base and asserts no same-origin 4xx responses.
- **`composer-state.js` `getAppRoot()`** — derives app root by stripping `/composer/...` from `window.location.href`. Any change to Composer URL structure requires updating this.
- **Security controls in §6a** — specifically: do not revert error rendering to `innerHTML`, do not remove PID/name validation, do not remove the `allowedOrigins` check from `loadConfig`. Each of these was introduced to fix a concrete vulnerability.
- **`allowedOrigins` default in `loadConfig`** — defaults to `location.origin` (same-origin only). If you change this default to be permissive, you re-open the external config injection vulnerability. The correct pattern for future external-config support is to pass an explicit `allowedOrigins` set at the call site in `src/app.js`.
- **`config-validation.js` binary-item options check** — binary items must have explicit options (inline, via `optionSetId`, or via the questionnaire's `defaultOptionSetId`). The validator rejects bare binary items with an actionable error message that includes a copy-pasteable fix snippet. Do not loosen this — explicit per-questionnaire labels are clinically safer (Hebrew vs. English, different wording per instrument) than a hardcoded global default. The component contains no fallback labels.
