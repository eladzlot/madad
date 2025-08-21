# Psychology Questionnaire App — System Architecture v1.1

> **Scope:** 100% client‑side, Hebrew‑first clinical assessment app. No backend. Psychologists configure via JSON and URL params. Patients complete on mobile; results render to a professional RTL PDF with clinical scoring and safety alerts. **Tech:** Vanilla JS (ES Modules) + pdfmake (lazy‑loaded) + AJV validators (lazy‑loaded). 

---

## 1. Goals & Non‑Goals

**Goals**
- Hebrew‑first UI & PDF (RTL correct, embedded fonts — Noto Sans Hebrew)
- Static hosting only (HTTPS). No PHI stored server‑side.
- JSON‑driven assessments, URL‑selectable batteries
- Instant scoring, interpretations, and alerts
- Professional, WCAG‑compliant, minimal UI
- Session recovery via `sessionStorage`
- **Clinician companion app** (URL Composer) to build links including **pid**

**Non‑Goals**
- No accounts, databases, analytics, or remote logging
- No third‑party SDKs; no cross‑origin data posting (CORS may be added later)

---


## 2. High‑Level Architecture

```
+--------------------+           +-------------------------+
|  Static Hosting    |           |  Config JSON (same origin)|
|  (HTTPS + CSP)     |           |  /configs/*.json        |
+---------+----------+           +------------+------------+
          |                                   |
          v                                   v
   [App Shell: index.html + ES modules] <— [Config Loader]
          |
          v
   [Questionnaire Engine] —→ [Scoring Engine] —→ [Alert Engine]
          |                                              |
          v                                              v
   [UI Renderer (RTL)]                           [Interpretations]
          |
          v
   [Report Generator (pdfmake + Hebrew TTF)] → PDF Blob → Share/Download
```

**Runtime state:** In‑memory JS objects. Optional session recovery with `sessionStorage` (clears on tab close).

---

## 3. Technology Choices

- **Runtime:** Vanilla JS (ESM in modern browsers). Optional minify build for prod.
- **Validation:** AJV (JSON Schema 2020‑12). Loaded only when configs are fetched.
- **PDF:** pdfmake (lazy‑loaded at results step). Hebrew TTF (Noto Sans Hebrew) embedded.
- **Styling:** CSS logical properties; minimal utility classes. `dir="rtl"` at root.
- **Gestures:** Pointer Events for swipe; keyboard and click fallbacks.
- **Colors:** Softer, print‑friendly tints (see §9 palette).
- **Companion app:** **URL Composer** at `/composer/`, shares the same Config Loader.
- **No dependencies** beyond AJV + pdfmake.

---


## 4. Modules & Responsibilities

### 4.1 App Shell (`/src/app.js`)
- Bootstraps UI and router
- Reads URL params, invokes Config Loader
- Holds top‑level state (patient name, **pid**, active questionnaire, answers)

### 4.2 Router (`/src/router.js`)
- Tiny hash+query router (≤ 50 lines)
- Routes: `/` (welcome) → `/q/:qid/:index` (items) → `/results` (PDF)

### 4.3 Config Loader (`/src/config/loader.js`)
- Fetches JSON sets by slug (`config` param) from same origin
- Validates against `QuestionnaireSet.schema.json` (AJV)
- Merges sets by ID; filters by `questionnaires` allowlist param
- Emits resolved set + `configVersion` + `resolvedAt`

### 4.4 Questionnaire Engine (`/src/engine/engine.js`)
- Drives flow between items and questionnaires
- Enforces required items; handles back/advance; tracks progress
- Emits `answer` events to Scoring Engine

### 4.5 UI Renderer (`/src/engine/render-likert.js`, `render-binary.js`)
- Likert: **single click/tap = select and advance** (fast flow)
- Binary: swipe left/right; buttons for desktop; auto‑advance on selection
- Accessible roles/ARIA; focus management; RTL text layout

### 4.6 Scoring Engine (`/src/engine/scoring.js`)
- Implements **none**, **sum**, **average**, **subscales**, **custom DSL**
- Reverse scoring per item; weights; subscale aggregation
- Produces totals + subscale map + category labels

### 4.7 DSL Interpreter (`/src/engine/dsl.js`)
- Tiny tokenizer + AST interpreter (no `eval`)
- Functions: `sum`, `avg`, `min`, `max`, `if` with comparisons
- Names: `item.<id>`, `subscale.<id>`

### 4.8 Alerts Engine (`/src/engine/alerts.js`)
- Declarative conditions: `itemAtLeast`, `itemEquals`, `scoreAtLeast`, `anyOf`, `allOf`
- Severities: `info | warning | critical`
- Returns alert list used by UI + PDF

### 4.9 Report Generator (`/src/pdf/report.js`)
- Lazy imports pdfmake + Noto Sans Hebrew font
- Lays out Patient Info (includes **pid**), Clinical Alerts, Results, Responses Table
- Risk coloring: **max** = soft red; **second‑max** = soft yellow (except binary)
- Embeds machine‑readable JSON (EmbeddedFiles + XMP; fallback hidden annotation)

### 4.10 **URL Composer** (Companion app) (`/composer/index.html`, `/composer/src/*.js`)
- Loads the same config sets via the shared Config Loader (AJV‑validated)
- UI: Select config(s) → choose questionnaires → enter **name** + **pid** → generate URL + QR
- Features: Copy URL, open preview, optional template save in **localStorage** (clinician device only)
- Safety nudges: prefer **opaque `pid`**; avoid full PHI in URLs

---


## 5. Data Models

### 5.1 URL Parameters
- `config`: comma‑sep slugs → `/configs/<slug>.json`
- `questionnaires`: comma‑sep questionnaire IDs (optional)
- `name`: prefill patient name (sanitized)
- `pid`: **patient ID/code** (sanitized, length‑capped); shown in PDF header and embedded JSON; recommended to be **opaque** (e.g., `TRC-2025-000123`), not full PHI

**Canonical example**
```
https://app-domain.com/?config=depression-anxiety&questionnaires=phq9,gad7,pcl5&name=יוסי%20כהן&pid=TRC-2025-000123
```

### 5.2 JSON Types (summary)
- `QuestionnaireSet`: `{ id, version, title[he], questionnaires[], optionSets? }`
- `Questionnaire`: `{ id, title, items[], scoring?, interpretations?, alerts?, ui? }`
- `Item`: `{ id, type: 'likert'|'binary', text, reverse?, weight?, required?, options?|binaryLabels?, scaleStart?, scaleStep? }`
- `ScoringSpec`: `{ method, subscales?, customFormula?, maxPerItem? }`
- `InterpretationSpec`: `{ target: 'total'|{subscaleId}, ranges[] }`
- `AlertSpec`: `{ id, severity, when, message }`

---


## 6. Rendering & Interaction Rules

- Root: `<html lang="he" dir="rtl">`
- Likert: **single click/tap both selects and advances**
- Binary: swipe ±40px or button click both auto‑advance
- Back button always available; required items enforced
- Keyboard: arrows to change; Enter to advance
- Accessibility: roles/labels; `aria-live` progress updates; AA contrast

---

## 7. Scoring & Interpretations

- Reverse scoring: `max - value` per item then apply weight
- Methods: none | sum | average | per‑subscale overrides | custom DSL
- Interpretation mapping by inclusive `[min, max]` ranges
- Outputs: `{ total, subscales: Map, category, colorHints }`

---

## 8. Alerts (Clinical Safety)

- Item‑level and score‑level thresholds
- Boolean combinations for complex rules
- UI: prominent banner for `critical`; summary list for others
- PDF: **top section** lists alerts with severity badges

---

## 9. PDF Report (pdfmake)

**Content order**
1) Patient Information (name, **patient ID (pid)**, date/time, questionnaires, config id+version)
2) **Clinical Alerts** (top, severity color)
3) Questionnaire Results (totals, subscales, interpretations)
4) **Responses Table** (No., text, response label, numeric score)
5) Clinical Summary (auto‑generated narrative)
6) Footer (generation timestamp, app version, config version)

**Risk Visualization**
- If value == max → **soft red background**; bold
- Else if value == max‑1 → **soft yellow background** (not for binary)

**Soft Color Palette (print‑friendly)**
- Soft Red (max): `#FCE8E8` fill, text `#8A1C1C`, border `#E3B8B8`
- Soft Yellow (2nd max): `#FFF6DB` fill, text `#8A6A00`, border `#E7D6A8`
- Neutral: white, border `#E5E7EB`

**Hebrew support**
- Noto Sans Hebrew embedded; right‑aligned tables/paragraphs

**Data Embedding**
- EmbeddedFiles (`data.json`) + XMP summary (includes **pid**)
- Fallback: hidden annotation

---


## 10. Privacy, Security, Compliance

- No network calls after configs/fonts are loaded
- No persistent storage except optional sessionStorage for recovery; Composer uses localStorage **only** for templates on the clinician’s device
- URL/name/**pid** sanitization (length caps; NFKC; strip markup)
- Recommend **opaque `pid`** (clinic code) instead of personally identifying numbers
- CSP: `default-src 'self'`; `script-src 'self'`; `font-src 'self' data:`; `img-src 'self' data:`; `connect-src 'self'`
- SRI for fonts/pdfmake; Referrer‑Policy; Permissions‑Policy; X‑Content‑Type‑Options
- Input validation & schema checks block malformed configs

---


## 11. Performance Budgets & Loading Strategy

- **Entry (app shell + engine):** ≤ 15 kB gz
- **AJV validator (lazy):** ≤ 40 kB gz (only on config load)
- **pdfmake + font (lazy):** 250–400 kB (only on results)
- Fonts served as separate, long‑cache assets

---

## 12. Deployment & Environments

- Any static host (Cloudflare Pages/Netlify/GitHub Pages); HTTPS required
- Cache‑control: immutable hashed app files; short TTL for configs
- Namespaces: `/configs/test/…` and `/configs/prod/…`
- Versioning: `APP_VERSION` + config `version` printed in PDF and embedded JSON
- **Composer served at** `/composer/` under same origin to reuse loaders and avoid CORS

---


## 13. QA & Verification

- Schema validation: AJV on load; Hebrew error messages
- Scoring test vectors (PHQ‑9, GAD‑7, PCL‑5)
- Alerts unit tests (thresholds)
- PDF snapshot tests (layout, RTL tables, soft color rules)
- Manual RTL print sweeps

---

## 14. Roadmap

**Phase 1**: Likert/Binary (single‑click advance), sum/avg, alerts, Hebrew PDF (EmbeddedFiles+XMP), PHQ‑9 & GAD‑7 built‑ins, **URL Composer** MVP with `pid`

**Phase 2**: Subscales, custom DSL, richer interpretations, add **PCL‑5**

**Phase 3**: Conditional logic, polish, performance tuning, optional shell‑only PWA, group/longitudinal exports

---

## 15. Testing Strategy (free, minimalistic, systematic)

**Goals:** fast, deterministic tests that protect clinical correctness and privacy.

### 15.1 Unit tests (logic only)
- **Scope:** scoring engine, reverse scoring, interpretations, alert rules, URL parsing/sanitization.
- **Runner:** `vitest` or `uvu` (tiny). No DOM.
- **Fixtures:** JSON test vectors per instrument (PHQ‑9/GAD‑7/PCL‑5) with expected totals/categories.

### 15.2 Schema validation tests
- **Tool:** `ajv` with `QuestionnaireSet.schema.json`.
- **CI job:** validate every `/public/configs/**/*.json` (fail fast with readable messages in Hebrew for clinicians).

### 15.3 E2E tests (browser)
- **Tool:** `Playwright` (Chromium + WebKit on CI for mobile parity).
- **Flows:**
  - Welcome → enter name/pid → Likert single‑tap advance → Binary swipe → Back → Results.
  - Composer: load config → select questionnaires → generate URL → preview opens and preselects.
- **Accessibility:** inject `axe-core` into Playwright to assert critical WCAG rules (landmarks, color contrast, focus order, labels/roles).

### 15.4 PDF verification
- **Export** a report in CI; use `pdfjs` or text extraction to assert: RTL Hebrew lines present, totals match, sections exist (Alerts/Results/Table), and **config id+version/pid** appear.
- **Visuals:** optional screenshot of a sample PDF page via Playwright for visual regression (stored as an artifact, not committed).

### 15.5 Performance & size budgets
- Assert gzipped **entry** ≤ 15 kB (excluding fonts/libs), **pdf chunk** lazy‑loaded. Use a tiny Node script to compute sizes on CI.

### 15.6 What we do **not** test
- No analytics, no server calls. No flakey network tests. Keep CI < 3–5 minutes.

---

## 16. Engineering Workflow & Repo Management (GitHub, free)

### 16.1 Repository layout
- `src/` (app + engines), `public/configs/`, `composer/`, `docs/`, `tests/`.

### 16.2 Branching & PRs
- Branch names: `feat/*`, `fix/*`, `config/*`, `doc/*`.
- **PR template** includes: scope, screenshots/GIF of flow, checklist (schema valid, tests pass, manual RTL check).
- Require **1 review** (clinician review label required for: changes under `/public/configs/**` and `/src/pdf/**`).

### 16.3 Issues & planning
- **GitHub Projects (kanban)**: Backlog → In Progress → In Review → Done.
- Issue templates: *feature*, *bug*, *config change*, *clinical copy change*.
- Labels: `clinical`, `config`, `rtl`, `pdf`, `a11y`, `good-first-issue`.

### 16.4 Code ownership
- `CODEOWNERS`:
  - `/public/configs/**` → clinician lead + tech lead
  - `/src/pdf/**` → tech lead
  - `/src/engine/**` → core devs

### 16.5 CI/CD with GitHub Actions (all free)
**Workflows** (store under `.github/workflows/`):
1. `quality.yml` — install deps, run unit tests + lints.
2. `validate-configs.yml` — run AJV over `/public/configs/**`. Fails PR with human‑readable errors.
3. `e2e.yml` — Playwright headless E2E (Chromium + WebKit), axe checks, PDF export assertions.
4. `deploy-pages.yml` — on `main` merge, build (minify) and deploy to **GitHub Pages**; on PR, publish **preview** to Pages (or Netlify/Cloudflare if preferred).

**Example: `validate-configs.yml` (essence)**
```yaml
name: validate-configs
on: [pull_request]
jobs:
  ajv:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run validate:configs
```

### 16.6 Security & compliance in CI
- Verify CSP via a static check on `index.html` (grep required directives).
- `license-checker` (dev) to ensure only approved licenses.
- No secrets in repo; Pages only.

### 16.7 Dependency hygiene (free)
- **Renovate** or **Dependabot** weekly batch PRs.
- Lockfile committed; reproducible builds.

### 16.8 Releases
- **Tags** `vMAJOR.MINOR.PATCH`; auto‑generated **CHANGELOG.md** via conventional commits or a release GitHub Action.
- Attach **artifact** PDFs from CI for the release (sample report), useful for clinical sign‑off.

### 16.9 Documentation
- `/docs` as Markdown; homepage includes: Quick Start, URL schema, Config authoring, Alerts cookbook, PDF policy, Troubleshooting.
- Publish docs alongside app via Pages under `/docs/` route (no extra tooling), or use a single README if preferred.

---



## 15. Companion **URL Composer** App

**Purpose**: Clinician tool to generate correct patient URLs. Lives at `/composer/`. Shares config loader with main app.

**Flow**
1. **Load Config(s)** → select config sets
2. **Pick Questionnaires** → checklist with counts
3. **Patient Details** → Name (optional), **Patient ID (pid)** (recommended, opaque code)
4. **Advanced (future)** → lang, autoAdvance, ui
5. **Generated Output** → URL textbox + copy button + QR code + Preview button
6. **Safety Note** → “Avoid full PHI in URLs; prefer clinic codes.”

**Storage**: optional localStorage for clinician templates (local only).

**Tech**: Vanilla JS; QR via small encoder lib; reuses Config Loader + AJV.

---

## 16. Decisions Finalized

1. **Font**: Noto Sans Hebrew embedded in PDF
2. **Config hosting**: same origin (CORS ready for future)
3. **Session recovery**: enabled via sessionStorage
4. **Data embedding**: EmbeddedFiles + XMP summary
5. **Risk colors**: softer palette (soft red / soft yellow)
6. **Built‑in instruments**: PHQ‑9, GAD‑7, **PCL‑5**
7. **URL params**: `config, questionnaires, name, pid` (future: lang, autoAdvance, ui)
8. **PWA**: off by default; shell‑only caching if enabled later
9. **UI choice**: **single selection = immediate advance** for fastest flow (Back button for correction)
10. **Composer app**: ships alongside, to help clinicians build URLs and QR codes safely

---

*End v1.1 (Vanilla JS, pdfmake).*

