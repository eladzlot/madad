# Handover Document
**Project:** Madad — Clinical Assessment App
**Document version:** 3.0
**Last verified against the tree:** 2026-08-21 (file listing, config scan, `npm test`)
**Status:** Living document — update whenever the system state changes
**Purpose:** Everything a developer (human or AI) needs to understand the project, work safely within it, and expand it without breaking things.

> Scope note: this document describes the system as it *is*. The backlog — what
> is next, what is blocked, and why past decisions were made — lives in
> `docs/TODO.md`. Completed-work history lives in `docs/TODO.md` §5 (Task
> Archive) and in `git log`; it is deliberately not duplicated here.

---

## 1. What this system is

A static web application for clinical psychological assessment. No backend, no database, no user accounts. All processing runs in the browser. The only output is a PDF.

**Clinician workflow:** Opens `/composer/`, selects questionnaires or a pre-built battery, enters a patient ID, copies the generated URL, sends it to the patient.

**Patient workflow:** Opens the URL, completes questionnaires one item at a time, downloads a PDF, shares it with the clinician.

**Follow-up workflow:** The clinician drops the PDFs back into `/aggregate/` and gets per-instrument trajectory charts. The PDFs are parsed in the browser; nothing is uploaded.

**What never happens:** No patient data is stored anywhere. Nothing is transmitted. The PDF is the entire output.

**Surfaces:**

| Surface | URL | Audience |
|---|---|---|
| Patient app | `https://app.ezmadad.com/` | patient |
| Composer | `https://app.ezmadad.com/composer/` | clinician |
| Aggregate (סיכום מטופל) | `https://app.ezmadad.com/aggregate/` | clinician |
| Help | `https://app.ezmadad.com/help/` | clinician |
| Landing page | `https://ezmadad.com/` | prospective clinicians |

Hosting: Cloudflare Pages — projects `madad-app` (app entry points) and `madad-landing` (landing).
**Legacy:** `https://eladzlot.github.io/madad/` serves a redirect shim to the new domains (removal pending — migration Stage 9, `docs/CLOUDFLARE_MIGRATION.md`).
**Contact:** Dr. Elad Zlotnick, Hebrew University / CTR — elad.zlotnick@mail.huji.ac.il

---

## 2. Architecture in one page

```
public/configs/prod/*.json     ← Clinical content (instruments, scoring, alerts)
        │
        ▼
shared/config/loader.js        ← Fetches, validates (AJV), merges configs
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
                                 + embedded data.json envelope
                                          │
                                          ▼
                          aggregate/src/parse-pdf.js → charts
```

Clinician-side surfaces (`composer/`, `aggregate/`, `help/`) are separate Vite entry points that share `shared/` (config loading, catalog, envelope, pid, tokens) and `clinician/` (nav bar + design vocabulary).

**Core rule:** `src/engine/` and `shared/` are pure logic — no DOM, no framework. DOM lives only in `src/components/`, `src/controller.js`, `src/app.js`, and the clinician surfaces.

**Technology:** Vanilla JS + ES Modules. Lit for components. Vite for build. Vitest for unit tests. Playwright for E2E. pdfmake for PDF. AJV for config validation.

---

## 3. Current state

### Patient app

- Full patient flow: welcome → items → results (single back-navigable screen; scores/alerts recomputed on entry) → PDF
- Item types: `select` (Likert), `binary` (yes/no, requires explicit option labels), `instructions`, `text`, `slider`, `multiselect`, `rated_text`
- Control-flow nodes: `if` and `randomize`, at both questionnaire level and battery level — resolved by `sequence-runner.js`, scored by `scoring.js` (recurses into `node.ids`), rendered in the PDF by `report.js`
- Binary items require explicit option labels — inline `options`, `optionSetId`, or the questionnaire's `defaultOptionSetId`. The validator rejects bare binary items.
- Back navigation including keyboard and swipe

### Scoring and interpretation

- `scoring.method`: `none` | `sum` | `average` | `subscales` | `custom` (DSL `customFormula`)
- `subscaleMethod`: `sum` | `mean`; `totalMethod`: `sum_of_subscales` | `sum_of_items`
- `subscaleFormulas` — per-subscale DSL expressions, for subscales that are not a plain item sum (e.g. AQ's binary rescoring)
- `scoring.exclude` — item IDs answered and shown in the PDF but excluded from the total and every subscale (PC-PTSD-5 gating exposure item, PROCSI/ROCI filler items)
- `interpretations`: `type` (`severity` | `screening`) + `ranges[]` + explicit `cutoffs[]`; optional `psychometrics` block. `severity` ranges render as chart bands in the Aggregate; `cutoffs` render as lines.
- Alerts: item-level and score-level DSL conditions. Severity is `critical` (red) or `warning` (amber) — **only these two**; `info` was removed from the schema (TODO decision D-3). Alerts sort critical-first in the PDF.

### PDF

- Patient info, alerts, scores, response table with risk highlighting
- Bold total score on its own line; subscale scores on a second line with Hebrew labels; mean subscales rounded to 1 decimal
- Per-item `"display": "block"` renders a `select`/`binary`/`slider` item as a standalone prompt+answer block instead of a response-table row (worksheets); default `"table"` is unchanged for every existing instrument
- Numbers isolated in `direction:'ltr'` nodes — bypasses pdfmake RTL shaping
- Mixed Hebrew/Latin strings via `bidiNodes()` (bidi-js, UAX-9) with cross-script hyphen splitting
- `APP_URL` resolved dynamically via `window.location.origin`
- Every PDF embeds a `data.json` envelope (`shared/pdf/envelope-schema.js`, `IMPLEMENTATION_SPEC.md` §19.4a) — the machine-readable record the Aggregate reads back

### Composer (`/composer/`)

- Data source: generated catalog index (`public/composer/catalog.json`) built by `scripts/build-catalog.mjs` → `shared/catalog/build-catalog.js`, which **scans `public/configs/prod/`** (there is no manifest). Run `npm run build:catalog` after editing configs and commit the result; CI enforces freshness via `npm run validate:catalog`. The composer never downloads full configs. See `docs/COMPOSER_SPEC.md` §Config Discovery.
- Browse by taxonomy tabs + real-time search, drag-to-reorder selection cart, keyboard navigation, instrument preview dialog
- Personal recommended-set pins: the clinician pins/unpins instruments on top of the author-curated `featured` flag; only the `{ added, removed }` difference is persisted (localStorage, per browser) so new author recommendations keep flowing in — `composer/src/composer-profile.js`
- Mobile bar: share button (HTTPS only) with copy-link fallback on HTTP
- Full dark theme via `@media (prefers-color-scheme: dark)`
- Config `meta` taxonomy block (domains/type/populations/tags/featured/durationMinutes) on all prod instruments drives catalog filtering — see `CONFIG_SCHEMA_SPEC.md` §4a

### Aggregate (`/aggregate/`)

Clinician drops Madad PDFs in and gets per-instrument trajectory charts. Stateless, in-browser only. `docs/AGGREGATE_SPEC.md`; envelope contract in `shared/pdf/envelope-schema.js`.

- Upload list with per-file status, zero-dep `data.json` extraction (`parse-pdf.js`), pid filter, raw-data list
- Charts: severity bands, cutoff lines, session window, shared x-domain across instruments
- Tooltips, keyboard navigation, session detail panel, view-as-table
- PNG/SVG export
- Visual refresh + shared clinician shell (`clinician/components/clinician-nav.js`)

### Other surfaces

- Help page at `/help/` — static Hebrew/RTL content, shares the clinician nav and design vocabulary
- Landing page at `/landing/` — direction 5 (radical simplicity), RTL, Hebrew, built separately into `dist-landing/`
- Favicon: SVG `מ` on teal at `public/favicon.svg`; Hebrew `<title>` on all pages

### Build, test, CI

- **1421 unit tests passing across 54 test files** (verified 2026-08-21 via `npm test`)
- E2E passing (Chromium; mobile-safari locally only): patient flow, composer, aggregate, help
- Dist-smoke E2E project (`tests/e2e/*.dist.test.js`) runs Playwright against the *built* bundle served at the production base via `vite preview`. Catches the "works on dev, broken on dist" class of bug (absolute-path fetches that bypass Vite's base, missing chunks, CSP violations). CI runs it at `/` plus a multi-base matrix (`/`, `/some/deep/path/`).
- CI workflow: `.github/workflows/ci.yml` — lint → unit tests → validate configs → validate catalog → build → size → E2E
- Deploy workflow: `.github/workflows/deploy-cloudflare.yml` — same gate + Wrangler deploy of `dist/` (app) and `dist-landing/` (landing); legacy `deploy.yml` now only publishes the github.io redirect shim
- MIT license (`LICENSE`) + instrument notice (`CONTENT_LICENSE.md`)

### Instrument library

`public/configs/prod/` holds **48 files**: 42 production entities (40 questionnaires, 2 batteries) and 6 dev-only fixtures marked `"dev": true`. One entity per file, filename = entity id — enforced by `npm run validate:configs`. Item IDs are URL addresses (`?items=phq9`).

**Depression / mood**

| ID | Name | Notes |
|---|---|---|
| `phq9` | שאלון דיכאון (PHQ-9) | Critical alert: suicidality (item 9 ≥ 1) |
| `dass21` | שאלון דיכאון, חרדה וסטרס (DASS-21) | 3 subscales; severity alerts per subscale |

**Anxiety**

| ID | Name | Notes |
|---|---|---|
| `gad7` | שאלון חרדה מוכללת (GAD-7) | — |
| `pdss_sr` | שאלון חומרת הפרעת פאניקה (PDSS-SR) | — |
| `asi_3` | שאלון רגישות לחרדה (ASI-3) | — |
| `hai` | שאלון חרדת בריאות (HAI) | — |
| `oasis` | שאלון חומרת חרדה ופגיעה תפקודית (OASIS) | — |
| `spin` | שאלון פוביה חברתית (SPIN) | social + anxiety |
| `scared_child` | שאלון חרדה לילדים — דיווח עצמי (SCARED) | 41 items, 5 sum subscales; screening cutoff 25; warning alert |
| `scared_parent` | שאלון חרדה לילדים — דיווח הורי (SCARED) | Parent-report twin of `scared_child`; same scoring and cutoff |

**OCD and related**

| ID | Name | Notes |
|---|---|---|
| `oci_r` | שאלון טורדנות כפייתית (OCI-R) | 6 subscales |
| `mgh_hps` | סולם תלישת שיער (MGH-HPS) | — |
| `ocsrs_m` | שאלון OCD ותסמינים קשורים (OCSRS) | Symptom-checklist screener: multiselect + conditional severity ratings; obsessions/compulsions subscales |
| `procsi` | שאלון אובססיות וכפייתיות ממוקדות-בן/בת-זוג (PROCSI) | 6 subscales; 4 filler items in `scoring.exclude`; clinical cutoff 18; warning alert |
| `roci` | שאלון אובססיות וכפייתיות בקשר רומנטי (ROCI) | 3 subscales; 2 filler items excluded; clinical cutoff 22; warning alert |

**Trauma**

| ID | Name | Notes |
|---|---|---|
| `pc_ptsd5` | סקר טראומה קצר (PC-PTSD-5) | Binary screener; `exposure` item excluded from scoring |
| `pcl5` | שאלון פוסט-טראומה (PCL-5) | 4 subscales; `totalMethod: sum_of_items`; warning alert at ≥ 33 |
| `ptci` | שאלון קוגניציות פוסט-טראומטיות (PTCI) | 3 subscales (mean) |
| `stss` | שאלון סטרס טראומטי משני (STSS) | Secondary traumatic stress in clinicians; 3 sum subscales; cutoff 38 (Bride 2007); warning alert; unvalidated Hebrew; © Bride, free non-commercial |

**Psychosis / prodrome**

| ID | Name | Notes |
|---|---|---|
| `pqb` | סולם מקוצר לבדיקת פרודרום (PQ-B) | 21 yes/no gates + conditional distress ratings; total = yes-count, distress subscale 0–105; critical alert at total ≥ 7 or distress ≥ 24 |
| `cape42` | שאלון חוויות נפשיות בקהילה (CAPE-42) | Validated Hebrew (Fazioli et al. 2025); 42 items + conditional distress follow-ups; positive/negative/depressive + distress subscales; critical alerts: suicidality (item 14), hallucinations (33/34/42 ≥ often); no validated cutoffs |
| `cape15` | שאלון חוויות פסיכוטיות עכשוויות (CAPE-P15) | Current (3-month) version, Capra et al. 2017; 15 items 0–3, 3 subscales (PI/BE/PA); Hebrew adapted from the validated CAPE-42; no validated cutoff; critical alert on hallucination items ≥ often |

**Anger**

| ID | Name | Notes |
|---|---|---|
| `dar5` | שאלון תגובות כעס (DAR-5) | Sum; screening cutoff 12 |
| `novaco_anger_situations` | שאלון מצבי כעס של נובאקו | 25 situations, sum; no validated cutoffs |

**Social, regulation, relationship, functioning**

| ID | Name | Notes |
|---|---|---|
| `sbq` | שאלון התנהגויות חברתיות (SBQ) | 29 items, 0–3; safety behaviours (Clark & Wells); no validated cutoffs |
| `scq` | שאלון קוגניציות חברתיות (SCQ) | 22 items, 1–5 frequency; unvalidated Hebrew; no validated cutoffs (`CONT-1`: rescore 0-based) |
| `ders` | שאלון קשיים בוויסות רגשי (DERS) | 6 subscales |
| `ecrs` | שאלון התקשרות (ECR-S) | 2 subscales (anxiety/avoidance) |
| `wai6` | שאלון ברית טיפולית (WAI-6) | — |
| `wsas` | סולם עבודה והתאמה חברתית (WSAS) | — |
| `isi` | מדד חומרת נדודי שינה (ISI) | — |
| `aq` | שאלון לסריקת תסמינים בספקטרום האוטיסטי (AQ) | 50 items, binary-rescored via `subscaleFormulas`; Israeli screening cutoff ≥ 22 (warning alert); 5 descriptive subscales |

**Worksheets** (`meta.type: worksheet` — no scores, or a score that is not a severity index; render as PDF blocks)

| ID | Name | Notes |
|---|---|---|
| `top3` | שלושת הבעיות המרכזיות | `rated_text` + `if`-node branching; `average` scoring |
| `cpt_abc` | דף אמ"ר (ABC) | CPT/iCPT; `scoring: none` |
| `cpt_exploring` | דף בירור מחשבות (Exploring Questions) | CPT/iCPT; `scoring: none` |
| `cpt_patterns` | דף דפוסי חשיבה (Thinking Patterns) | CPT/iCPT; `scoring: none` |
| `cpt_alternative` | דף מחשבות אלטרנטיביות (Alternative Thoughts) | CPT/iCPT; `scoring: none`; uses `display: block` on its re-rating item |
| `anger_log` | דו"ח כעס | Free-text + slider + select anger log |

**Intake and batteries**

| ID | Type | Name | Notes |
|---|---|---|---|
| `demographics` | questionnaire | פרטים אישיים | — |
| `diamond_sr` | questionnaire | DIAMOND Self Report Screener | Alerts: psychotic ideation, mania, trauma, substance use |
| `clinical_intake` | battery | הערכה ראשונית | DIAMOND → conditional questionnaires per domain; depends on 9 questionnaire configs |
| `trauma_eval` | battery | הערכת טראומה ראשונית | PC-PTSD-5 → if score ≥ 4: PCL-5 + PTCI |

Battery files declare `dependencies` on every questionnaire file they reference. Generated URLs name only the selected items' configs — dependency resolution happens patient-side in `loadConfig`'s BFS auto-fetch.

**Dev-only fixtures** (`"dev": true` — loaded in dev and Playwright, skipped in production builds): `test_q`, `phq9_test`, `all_types_q`, `all_types_battery`, `phq9_intake`, `standard_intake`.

**Policy:** Add instruments that are free to use for non-commercial (research/clinical) purposes — public-domain, open-license, or copyrighted-but-free (e.g. STSS, © Brian E. Bride). Do not add proprietary/commercial instruments that require a paid license or restrict reproduction (e.g. BDI-II).

### Config files

```
public/configs/
  prod/<id>.json           ← ONE questionnaire or battery per file, filename =
                             entity id (48 files, 6 of them `"dev": true`).
                             Enforced by validate:configs. Short name in URLs = id.
  CONTRIBUTING.md          ← How to add an instrument (human-readable)
  LLM_GUIDE.md             ← Comprehensive spec for LLM-assisted authoring
public/composer/
  catalog.json             ← Generated catalog index (the composer's runtime
                             data source) — regenerate with npm run build:catalog.
                             Built by scanning public/configs/prod/; there is
                             no manifest.
```

The pre-collapse bundle files (`standard.json`, `trauma.json`, `intake.json`, `ocd.json`, `anger.json`, `child.json`) were removed in `086c1f8` when item IDs became addresses. Nothing references them: the legacy `configs=` URL parameter is ignored, and old links still resolve because their `items=` tokens name instruments, not bundles.

---

## 4. Repository structure

```
.
├── index.html                    # Patient app entry
├── src/
│   ├── app.js                    # Entry point
│   ├── router.js                 # History API router
│   ├── controller.js             # Wiring layer
│   ├── resolve-items.js          # URL token → orchestrator sequence
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
│   │   ├── item-rated-text.js
│   │   ├── item-slider.js
│   │   ├── item-multiselect.js
│   │   ├── progress-bar.js
│   │   └── results-screen.js
│   ├── helpers/gestures.js       # Swipe gesture handler
│   ├── pdf/report.js             # PDF generation (pdfmake, lazy-loaded)
│   └── styles/{main.css,reset.js}
├── shared/                       # Framework-free, shared by every surface
│   ├── config/
│   │   ├── loader.js             # Fetch + validate + merge
│   │   ├── config-validation.js  # Semantic validation (IDs, options, refs)
│   │   ├── item-types.js         # Item type registry (isScored etc.)
│   │   ├── options.js            # Option-set resolution
│   │   ├── QuestionnaireSet.schema.json
│   │   └── validate-schema.js    # GENERATED — npm run build:validator
│   ├── catalog/build-catalog.js  # Catalog index builder (scans prod/)
│   ├── pdf/envelope-schema.js    # data.json envelope + validateEnvelope
│   ├── pid.js                    # PID_PATTERN + helpers
│   └── styles/tokens.css         # Design tokens incl. dark mode
├── clinician/                    # Shared clinician shell
│   ├── components/clinician-nav.js
│   └── styles/clinician-styles.js
├── composer/                     # Composer (separate Vite entry point)
│   ├── index.html
│   └── src/
│       ├── composer.js           # Composition root
│       ├── composer-store.js     # Reactive store
│       ├── composer-state.js     # URL building, pid, getAppRoot()
│       ├── composer-loader.js    # Catalog fetch, dev filtering
│       ├── composer-profile.js   # Personal pin overlay (localStorage)
│       ├── search.js, taxonomy.js, ui-reset.js
│       ├── preview/preview-model.js
│       └── components/           # composer-app, catalog-{card,list,controls},
│                                 # selection-cart, mobile-bar, preview-dialog
├── aggregate/                    # Aggregate surface (separate Vite entry point)
│   ├── index.html
│   └── src/
│       ├── aggregate.js          # Composition root
│       ├── parse-pdf.js          # Zero-dep data.json extractor
│       ├── store.js              # Session store, pid filter
│       ├── chart/                # scales, chart-model, heatmap-model,
│       │                         # trajectory-chart, export-svg, export-image
│       └── components/           # upload-list, pid-filter, raw-data-list,
│                                 # session-detail
├── help/                         # Help surface (static content + nav)
├── landing/                      # Landing page (built into dist-landing/)
├── pages-redirect/               # github.io redirect shim (Stage 9 deletes)
├── public/
│   ├── configs/                  # Clinical content (see above)
│   ├── composer/catalog.json     # Generated catalog index
│   ├── fonts/                    # Noto Sans Hebrew TTF
│   ├── favicon.svg               # מ on teal
│   └── _headers                  # HTTP security headers (Cloudflare Pages)
├── tests/
│   ├── fixtures/                 # config fixtures + generated PDF fixtures
│   ├── e2e/                      # patient-flow, composer, aggregate, help,
│   │                             # dist-smoke.dist, landing-smoke.dist
│   └── setup.js / setup-dom.js
├── scripts/
│   ├── validate-configs.mjs      # Schema + cross-file ID/reference checks
│   ├── build-catalog.mjs         # Writes public/composer/catalog.json
│   ├── build-validator.mjs       # Regenerates validate-schema.js from AJV
│   ├── generate-test-pdfs.mjs    # PDF fixtures for the aggregate tests
│   ├── build-og-image.sh
│   └── check-size.mjs
├── vite.config.js / vite.landing.config.js / vite.shared.js
├── .github/workflows/
│   ├── ci.yml                    # push + PRs
│   ├── deploy-cloudflare.yml     # push to main → Cloudflare Pages
│   └── deploy.yml                # github.io redirect shim only (Stage 9 removes)
├── docs/                         # Developer specs
├── LICENSE                       # MIT
└── CONTENT_LICENSE.md            # Instrument notice (no ownership claimed)
```

---

## 5. Config and URL strategy

### Config files
All instruments live in `public/configs/prod/`, one questionnaire/battery per file, filename = entity id. Each file is a self-contained `QuestionnaireSet`. There is no manifest — the catalog builder scans the directory; after adding a file run `npm run build:catalog` and commit the regenerated `public/composer/catalog.json` to make it visible in the Composer.

A config marked `"dev": true` at the top level is skipped in production builds (`import.meta.env.DEV === false`) and shown in dev and Playwright runs. That flag lives in the config file itself.

Multi-config dependencies: if a config references instruments defined in another file, declare it in the config's `"dependencies"` array. The patient app's `loadConfig` auto-fetches declared dependencies at runtime (BFS walk), so generated URLs name only the selected items' configs.

### URL design
Patient URLs carry `?items=<id>,<id>` plus the pid in the fragment (`#pid=<pid>`; legacy `?pid=` is still read). **Item IDs are addresses**: the app expands each token to `configs/prod/<id>.json` (one entity per file, filename = id — enforced by `validate:configs`). A legacy `configs=` parameter from bundle-era URLs is ignored; those URLs' items still resolve, so old links keep working. Item IDs are the stable external contract — never rename or delete a prod config file (see `docs/COMPOSER_SPEC.md`).

The loader (`shared/config/loader.js`) accepts short names, full paths, and root-relative paths; all normalise to the same canonical URL internally (visited-set dedupes).

### Adding an instrument
See `public/configs/CONTRIBUTING.md` (human guide) or `public/configs/LLM_GUIDE.md` (LLM guide). The process is config-only — no application code changes required for standard Likert/binary instruments.

---

## 6. Known gaps

| Gap | Risk | Resolution |
|---|---|---|
| PDF-render plumbing in `report.js` uncovered (funcs ~66%) | pdfmake layout callbacks / font preload state machine need a real render surface | E2E tests compensate; score/label builders are directly unit-tested |
| Aggregate `pid-filter.js` / `raw-data-list.js` at 0% | UI regressions in the aggregate surface may go undetected | E2E tests compensate |
| Repeated instances of the same questionnaire collide | Two copies of one instrument in a run share session state (`TODO.md` P1-10); blocks the idiographic stream | Not yet fixed — auto-assign distinct instance keys |
| Alert/formula DSL validated only at evaluation time | A typo'd `condition` or `customFormula` reaches patients | `TODO.md` P0-1/P0-2/P0-7 (deprioritized by user 2026-07-03) |

## 6a. Security model (summary)

The following security controls are in place. Do not remove them without understanding the implications.

| Control | Location | What it prevents |
|---|---|---|
| `allowedOrigins` in `loadConfig` | `shared/config/loader.js` | External servers injecting malicious configs via crafted URLs. Default: same-origin only. |
| `http://` rejection | `shared/config/loader.js` | Config loading over unencrypted transport. |
| Path-traversal rejection (`..` in sources) + short-name allowlist (`SHORT_NAME_RE`) | `shared/config/loader.js` | Crafted `items=` tokens escaping the config base to fetch arbitrary paths. |
| Fetch timeout (`fetchTimeoutMs`, default 10s) | `shared/config/loader.js` | A hung/slow config host stalling the patient app indefinitely. |
| Inbound envelope validation (`validateEnvelope`, never-throw parser) | `shared/pdf/envelope-schema.js`, `aggregate/src/parse-pdf.js` | Malformed or hostile uploaded PDFs crashing or injecting bad data into the Aggregate surface; unknown/newer schema versions are rejected cleanly. |
| SVG-export escaping (`esc`) | `aggregate/src/chart/export-svg.js` | Injection when untrusted envelope text (titles, labels, pid) is stamped into exported SVG/PNG. |
| Lit auto-escaping (framework-level) | all `src/components/`, `composer/`, `aggregate/`, `clinician/` templates | XSS from config- or upload-derived text rendered in the UI — Lit escapes all interpolated bindings; no `unsafeHTML` is used anywhere. |
| DOM-built error rendering (`textContent`) | `src/app.js` (`showError`), `src/controller.js` | XSS via error messages containing HTML from crafted URL parameters. |
| PID validation (`PID_PATTERN`, max 64 chars) | `src/app.js`, `shared/pid.js` | Crafted PIDs entering error surfaces or the PDF filename. |
| PID carried in URL fragment (`#pid=`) | `composer/src/composer-state.js` (writer), `src/app.js` `readPid()` (reader) | Keeps the patient identifier client-side: fragments never reach the request line, so the pid stays out of server/CDN access logs and the `Referer` header. |
| Name length cap (200 chars) + BiDi strip | `src/components/welcome-screen.js` | Oversized or directionally-manipulated names in the PDF. |
| `_isSafePattern` ReDoS guard | `src/components/item-text.js` | Config-supplied `pattern` fields causing catastrophic regex backtracking. |
| DSL length + nesting caps (`MAX_EXPRESSION_LENGTH` 2000, `MAX_PARSE_DEPTH` 100) | `src/engine/dsl.js` | A hostile config expression exhausting the JS stack or memory. Defense-in-depth — only reachable if external configs are ever enabled. |
| Content-Security-Policy (meta tag, build-injected) | `vite.shared.js` `cspPlugin` → all built HTML | Limits the blast radius of any future XSS: no inline scripts, no external connects. Injected at build time into every entry point (patient/composer/aggregate/help/landing); **not** hand-written in `index.html`. |
| HTTP security headers | `public/_headers` (copied to `dist-landing/` by `vite.landing.config.js`) | Header-level CSP incl. `frame-ancestors 'none'` + `X-Frame-Options: DENY` (clickjacking — meta CSP cannot express `frame-ancestors`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`. Served by Cloudflare Pages. |

**To allow an external config server in the future**, pass `allowedOrigins` at the `loadConfig` call site in `src/app.js` — no changes to `loader.js` are needed. See `IMPLEMENTATION_SPEC.md §9.1`. Before doing so, note the DSL caps above already bound untrusted-expression cost.

---

## 7. Next steps

`docs/TODO.md` is the backlog's source of truth (task IDs, status, decisions log). The threads that matter at project level:

### Migration cleanup — Stage 9
Remove the github.io redirect shim, `pages-redirect/`, and `.github/workflows/deploy.yml` after the redirect grace period. Steps in `docs/CLOUDFLARE_MIGRATION.md` §Stage 9; that document deletes itself when the stage completes.

### Dissemination
Tool is ready to ship. Priority actions:
- Send to 3–5 known therapists for feedback
- Post in Israeli therapist Facebook groups (genuine MBC content, not ads)
- Short screen-recording walkthrough (60-90 sec): composer → patient fills → PDF

### Aggregate — remaining slices
`AGG-4` (RCI line + subscale toggles) is blocked on `AGG-P`, the user-owned psychometrics content pass (reliability/SD/source per instrument). `AGG-7` (order charts by number of administrations) and `AGG-8` (capture time spent answering) are open and small-to-medium.

### Instrument content
`CONT-1` SCQ 0-based rescore, `CONT-2` PTCI-9, `CONT-3` PCL-5 short forms — see `docs/TODO.md` §CONT for the open design question shared by the last two.

### Idiographic / personalized measures (exploration)
Custom questionnaires encoded in the URL with patient-specific content — repeated top3, PSYCHLOPS, goal attainment, CPT stuck points. Design options and composer UI sketch in `docs/IDIOGRAPHIC_PLAN.md`; tracked as the `IDIO` band in `docs/TODO.md`. **Nothing decided** — `IDIO-0` is the encoding decision gate. The engine already supports repeated instances via `instanceId`; the blocker is `P1-10`.

---

## 8. How to orient in a new session

Read in this order:
1. This document
2. `docs/TODO.md` §1–§4 — current status, backlog, decisions log
3. `docs/BEHAVIORAL_SPEC.md`
4. `docs/IMPLEMENTATION_SPEC.md`
5. `docs/CONFIG_SCHEMA_SPEC.md` — if touching configs

```bash
npm ci
npm run dev              # localhost:5173 (base /)
npm test                 # 1421 unit tests across 54 files
npm run validate:configs
npm run validate:catalog
npm run build && npm run preview  # localhost:4173/ (base /)
npm run e2e              # Playwright
npm run e2e:dist         # build + dist-smoke against the production base
```

To add a new instrument: `public/configs/CONTRIBUTING.md`.

---

## 9. What not to change without a plan

- **`src/engine/dsl.js`** — used by scoring, alerts, and sequence branching. Full `dsl.test.js` coverage required for any change.
- **`src/engine/sequence-runner.js`** — shared by orchestrator and engine. Back-navigation logic is subtle; tests are the specification.
- **Session state shape** — `answers`, `scores`, `alerts` keyed by `sessionKey` (`node.instanceId ?? node.questionnaireId`). PDF generator, orchestrator, engine, and results screen all read from this shape. See `TODO.md` P1-10 before changing the key.
- **`shared/config/QuestionnaireSet.schema.json`** — changing without running `npm run build:validator` and updating `config-validation.js` and existing configs will break validation. Always run `build:validator` after schema changes (the `schema-change` skill walks the chain).
- **`shared/pdf/envelope-schema.js`** — the contract between the PDF writer and the Aggregate reader, and every PDF ever generated. Adding fields is forward-compatible (unknown fields tolerated); removing or re-typing them is not.
- **`src/pdf/report.js` — RTL rendering** — pdfmake has incomplete bidi support. bidi-js (UAX-9 conformant) is used for mixed Hebrew/Latin text via `bidiNodes()`. Numbers go in `direction:'ltr'` nodes, category on its own line, never `rtl:true`. See `IMPLEMENTATION_SPEC.md §19.3`.
- **`src/pdf/report.js` — pdfmake API** — use `getBuffer()` (Promise-based). `getBlob(callback)` silently hangs in pdfmake 0.3.x.
- **`vite.config.js`** — `base` defaults to `'/'` in all modes (Cloudflare Pages serves at the domain root; was `'/madad/'` under GitHub Pages). Overridable via `MADAD_BASE` for the CI multi-base matrix. `pdfmake` is pinned to a named chunk via `manualChunks` to keep it lazy-loaded and out of the entry bundle.
- **Patient URL format** — `items=` tokens are instrument/battery IDs, expanded to `configs/prod/<id>.json`. The legacy `configs=` param must stay ignored (never re-honor it — the files it named are gone). See §5.
- **`loadConfig` `baseUrl` default** — defaults to `import.meta.env.BASE_URL`, which Vite inlines to the build's `base` at build time. Removing this re-introduces the production-only "לא ניתן לטעון את השאלון" bug: short config names would expand to root-relative paths that bypass Vite's `base` and 404 on every non-root deployment. The dist-smoke Playwright project is the regression gate.
- **`composer-state.js` `getAppRoot()`** — derives app root by stripping `/composer/...` from `window.location.href`. Any change to Composer URL structure requires updating this.
- **Security controls in §6a** — specifically: do not revert error rendering to `innerHTML`, do not remove PID/name validation, do not remove the `allowedOrigins` check from `loadConfig`. Each was introduced to fix a concrete vulnerability.
- **`allowedOrigins` default in `loadConfig`** — defaults to `location.origin` (same-origin only). Making this default permissive re-opens the external config injection vulnerability. The correct pattern for future external-config support is an explicit `allowedOrigins` set at the call site in `src/app.js`.
- **`config-validation.js` binary-item options check** — binary items must have explicit options (inline, via `optionSetId`, or via the questionnaire's `defaultOptionSetId`). The validator rejects bare binary items with an actionable error message including a copy-pasteable fix. Do not loosen this — explicit per-questionnaire labels are clinically safer than a hardcoded global default. The component contains no fallback labels.
- **`public/configs/prod/<id>.json` filenames** — item IDs are the external contract carried in every link a clinician has already sent and every PDF already generated. Never rename or delete one.
