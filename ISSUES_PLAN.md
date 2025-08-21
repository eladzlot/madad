# Psychology Questionnaire App — Copilot Execution Plan

## 0) One-time GitHub setup

1. **Create a private GitHub repo** (or public if you prefer).

   * Add these files at minimum:

     * `ARCHITECTURE.md` (your finalized architecture)
     * `README.md` (can be minimal)
     * `.gitignore` (Node, macOS, editors)

2. **Enable GitHub Copilot** for your org/repo and the **Copilot coding agent / Workspace** feature.

   * In each Issue you’ll click **Ask Copilot** → **Implement** (or use Workspace) to open an AI PR.

3. **Enable GitHub Actions** (default is on).

4. **Enable GitHub Pages** (for static previews/production):

   * Settings → Pages → Source = “GitHub Actions”.

5. (Optional) Create a **GitHub Project (kanban)** for tracking: Backlog → In Progress → In Review → Done.

6. (Later) Protect `main` with **Require PR** and **Require 1 review**.

---

## 1) How to create these issues

### Option A — GitHub UI (simplest)

* Open each issue section below, copy its **Title** and **Body** into a new GitHub Issue.
* Add the suggested **Labels**.
* In the Issue, click **Ask Copilot → Implement** (or open Workspace) to have Copilot plan and raise a PR.

### Option B — GitHub CLI (fast, scripted)

* Make sure you have the GitHub CLI (`gh`) installed and authed.
* From the repo root, run the blocks below (they create issues directly).
  You can paste one block at a time.

> Tip: If an issue is big, Copilot may split it into multiple PRs. That’s fine—review & merge incrementally.

---

## 2) Issues

Below are all issues, grouped by phases.
Each issue body includes: **Summary**, **Copilot brief**, **Acceptance criteria**, **Out of scope**, **Test instructions**.

---

### PHASE 0 — Repo & scaffolding

#### Issue 0.1 — Initialize repo with architecture and project metadata

**Labels:** `infra`, `docs`
**Title:** Initialize repo with ARCHITECTURE.md and project metadata

**Body:**

* **Summary**: Create a minimal, runnable repository skeleton per `ARCHITECTURE.md` with folders, baseline docs, and local preview instructions.
* **Copilot brief**
  Create/update:

  * `ARCHITECTURE.md` — source of truth (use provided content)
  * `README.md` — quick start (serve locally), link to `ARCHITECTURE.md`
  * `LICENSE` — MIT (or org default)
  * `.gitignore` — Node/macOS/editors
  * Folders: `src/`, `public/configs/`, `composer/`, `docs/`, `tests/` (placeholders OK)
* **Acceptance**

  * Repo clones cleanly; README shows `python -m http.server` preview steps.
  * Structure exists exactly as listed; no console errors when serving.
* **Out of scope**: No app logic/CI/Pages/Composer yet.
* **Test**: Serve root with a static server; page loads without errors.

---

### PHASE 1 — Minimal runnable app shell

#### Issue 1.1 — App shell (RTL), tiny router, Welcome screen

**Labels:** `feat`, `rtl`, `ui`
**Title:** App shell (RTL), tiny router, Welcome screen

**Body:**

* **Summary**: Vanilla ESM app with a tiny hash router and RTL Welcome screen.
* **Copilot brief**
  Follow `ARCHITECTURE.md` §2 and §4.
  Create/update:

  * `index.html` (`<html lang="he" dir="rtl">`, `<main id="app">`, include `style.css`, load `src/app.js` as ESM)
  * `style.css` (minimal; cards, buttons, RTL defaults)
  * `src/router.js` (`addRoute`, `startRouter`, `goto`)
  * `src/app.js` (boot + routes: `/` Welcome with Name & PID inputs + Start → `#/q/0/0`)
* **Acceptance**

  * Welcome renders RTL; Start routes to `#/q/0/0`.
  * Changing hash manually switches views.
  * No console errors in Chrome/Firefox + Mobile Chrome.
* **Out of scope**: No questions, no session, no scoring.
* **Test**: Serve locally; try `/` and `#/q/0/0`.

#### Issue 1.2 — Load demo config and list questionnaire titles

**Labels:** `feat`, `config`
**Title:** Load same-origin demo config and list questionnaire titles

**Body:**

* **Summary**: Fetch a demo config and show the questionnaires to be run.
* **Copilot brief**
  Follow `ARCHITECTURE.md` §3, §4.3.

  * `public/configs/depression-anxiety.json` minimal: PHQ-9, GAD-7 (empty `items`)
  * `src/config-loader.js`: `loadConfigs(slugs[])` → fetch same-origin, merge by ID
  * `src/app.js`: default `?config=depression-anxiety`; display titles on Welcome
* **Acceptance**

  * `/` shows PHQ-9 & GAD-7 titles; `?questionnaires=phq9` shows only PHQ-9.
  * Missing/invalid JSON → friendly Hebrew error card, app doesn’t crash.
* **Out of scope**: AJV validation (later).
* **Test**: Toggle query params; rename JSON to simulate error.

---

### PHASE 2 — Question engine (Likert/Binary)

#### Issue 2.1 — Likert renderer with single-tap auto-advance

**Labels:** `feat`, `ui`, `rtl`
**Title:** Likert renderer with single-tap auto-advance

**Body:**

* **Summary**: Implement Likert UI; after selection, advance immediately.
* **Copilot brief**

  * `src/engine/render-likert.js`
  * Update `src/app.js` to route `/q/:qid/:index` progression; Back button.
  * Focus styles + keyboard Enter support.
* **Acceptance**

  * Clicking an option advances; Back returns to previous.
  * Accessible roles for radiogroup/radio.
* **Out of scope**: Scoring, Binary, session.
* **Test**: Seed 2–3 Likert items in config to try flow.

#### Issue 2.2 — Binary renderer with swipe + button fallback

**Labels:** `feat`, `ui`, `mobile`
**Title:** Binary renderer with swipe + button fallback (auto-advance)

**Body:**

* **Summary**: Add Binary type with left/right swipe (\~40px threshold); buttons on desktop.
* **Copilot brief**

  * `src/engine/render-binary.js` with Pointer Events.
  * Auto-advance after choose; Back works.
* **Acceptance**

  * Swipe selects; buttons work; Back works.
* **Out of scope**: Scoring; session.
* **Test**: Add 2 Binary items and verify on mobile + desktop.

#### Issue 2.3 — Required items + sessionStorage recovery

**Labels:** `feat`, `ux`
**Title:** Required items and session recovery (sessionStorage)

**Body:**

* **Summary**: Enforce required items; persist progress to sessionStorage.
* **Copilot brief**

  * Prevent advance if required unanswered (show small hint).
  * Save/restore name, pid, indices, answers.
  * “Start over” clears session.
* **Acceptance**

  * Refresh mid-flow restores position.
  * Required items block advance until answered.
* **Out of scope**: Scoring thresholds; PDF.
* **Test**: Refresh mid-question; confirm state restoration.

---

### PHASE 3 — Scoring, interpretations, alerts

#### Issue 3.1 — Scoring engine (sum/avg + reverse)

**Labels:** `feat`, `scoring`
**Title:** Scoring engine (sum/avg + reverse scoring)

**Body:**

* **Summary**: Implement sum/avg with reverse scoring per item.
* **Copilot brief**

  * `src/engine/scoring.js`: `scoreQuestionnaire(q, answers)`; reverse via `max - value`.
  * Minimal PHQ-9/GAD-7 items to validate totals.
* **Acceptance**

  * After last item: total computed; shown on Results.
* **Out of scope**: Subscales, custom DSL (later).
* **Test**: Known answer sets yield expected totals.

#### Issue 3.2 — Interpretations (ranges)

**Labels:** `feat`, `scoring`
**Title:** Interpretations (range → category label)

**Body:**

* **Summary**: Map totals to labeled categories in Hebrew.
* **Copilot brief**

  * `computeInterpretation()` + chip on Results.
* **Acceptance**

  * Given test vectors, totals map to correct category.
* **Out of scope**: Alerts.
* **Test**: Edge values hit correct buckets.

#### Issue 3.3 — Alerts (item/score thresholds, anyOf/allOf)

**Labels:** `feat`, `alerts`, `safety`
**Title:** Alerts engine: item/score thresholds (anyOf/allOf)

**Body:**

* **Summary**: Declarative alerts (info/warning/critical).
* **Copilot brief**

  * `checkAlert()` supporting: `itemAtLeast`, `itemEquals`, `scoreAtLeast`, `anyOf`, `allOf`.
  * Example: PHQ-9 item 9 ≥ 1 → critical banner.
* **Acceptance**

  * Alerts visible at top of Results; toggling answer toggles banner.
* **Out of scope**: PDF integration.
* **Test**: Trigger and clear alert via answers.

---

### PHASE 4 — PDF (pdfmake)

#### Issue 4.1 — Minimal PDF export (name + pid + results)

**Labels:** `feat`, `pdf`
**Title:** PDF export: Patient Info (name/pid) + results header

**Body:**

* **Summary**: Generate basic PDF with patient info and results summary.
* **Copilot brief**

  * `src/pdf/report.js` using pdfmake; button on Results.
  * Include **name** and **pid** from state/URL.
* **Acceptance**

  * Clicking “Download PDF” saves a file with Hebrew header, name, pid.
* **Out of scope**: Responses table, colors, embedded data.
* **Test**: Open PDF; text appears RTL.

#### Issue 4.2 — PDF responses table + soft risk colors

**Labels:** `feat`, `pdf`, `ui`
**Title:** PDF table: responses + soft risk colors (max/red, second/yellow)

**Body:**

* **Summary**: Add responses table with risk shading.
* **Copilot brief**

  * Columns: #, text, response label, numeric score.
  * Colors: max → soft red; second-max → soft yellow; binary → only red.
* **Acceptance**

  * Sample answers show correct shading rules.
* **Out of scope**: Embedded data/XMP.
* **Test**: Export and visually confirm shades.

#### Issue 4.3 — PDF embedded data (EmbeddedFiles + XMP)

**Labels:** `feat`, `pdf`, `data`
**Title:** PDF embedded data: EmbeddedFiles + XMP (includes pid)

**Body:**

* **Summary**: Attach compact `data.json` and add minimal XMP.
* **Copilot brief**

  * Embed answers, scores, alerts, config id+version, `{name,pid}`, timestamp.
  * Add minimal XMP metadata (same identifiers).
* **Acceptance**

  * PDF contains `data.json` attachment; XMP fields set.
* **Out of scope**: Font swap to Noto (next step if not done).
* **Test**: Inspect PDF attachments/metadata.

---

### PHASE 5 — AJV validation + real configs

#### Issue 5.1 — JSON Schema + runtime validation (AJV lazy)

**Labels:** `feat`, `validation`, `config`
**Title:** Add QuestionnaireSet JSON Schema + AJV runtime validation

**Body:**

* **Summary**: Validate configs at runtime; show Hebrew errors.
* **Copilot brief**

  * Add `src/config/schema/QuestionnaireSet.schema.json`.
  * Lazy-load AJV on config load; friendly error card on failure.
* **Acceptance**

  * Invalid config fails with readable message; valid proceeds.
* **Out of scope**: CI AJV (next issue).
* **Test**: Introduce a deliberate schema error → see message.

#### Issue 5.2 — Full Hebrew configs for PHQ-9, GAD-7, PCL-5

**Labels:** `feat`, `content`, `config`
**Title:** Full Hebrew configs: PHQ-9, GAD-7, PCL-5 (validated)

**Body:**

* **Summary**: Replace demo items with full validated Hebrew instruments.
* **Copilot brief**

  * Update `/public/configs/depression-anxiety.json` (PHQ-9, GAD-7) and add `/public/configs/pcl5.json`.
  * Ensure cutoffs/labels reflect validated ranges; pass AJV.
* **Acceptance**

  * App runs all three; totals match known cutoffs; alerts work.
* **Out of scope**: Subscales/custom DSL (future).
* **Test**: Use known answer keys to confirm totals/categories.

---

### PHASE 6 — URL Composer

#### Issue 6.1 — Composer MVP at `/composer/`

**Labels:** `feat`, `composer`, `ux`
**Title:** Composer MVP: same loader, generate URL (name + pid)

**Body:**

* **Summary**: Build a same-origin Composer UI.
* **Copilot brief**

  * Fields: config slugs, questionnaire checklist, name, **pid**.
  * Output URL; “Open Preview” launches patient app.
  * Shared loader to ensure parity with app.
* **Acceptance**

  * Generated URL pre-populates app; preview works.
* **Out of scope**: QR.
* **Test**: Compose URL, open, confirm prefill.

#### Issue 6.2 — Composer QR (SVG, no deps)

**Labels:** `feat`, `composer`
**Title:** Composer QR button (inline SVG, no external deps)

**Body:**

* **Summary**: Add QR generation for the URL.
* **Copilot brief**

  * Tiny QR encoder (JS), render inline SVG.
* **Acceptance**

  * Scanning QR opens the prefilled app link.
* **Out of scope**: Saving PNG/PDF.
* **Test**: Scan with phone.

---

### PHASE 7 — Accessibility, docs

#### Issue 7.1 — Accessibility pass with axe (Playwright)

**Labels:** `a11y`, `e2e`
**Title:** Accessibility pass (axe) + keyboard/focus improvements

**Body:**

* **Summary**: Add axe checks and ensure roles/labels/focus/keyboard work.
* **Copilot brief**

  * Roles for radiogroup/radio; `aria-live` for progress; Enter/Arrows work.
  * Playwright test injects `axe-core` and asserts no critical issues.
* **Acceptance**

  * Axe passes on Welcome, Question, Results, Composer pages.
* **Out of scope**: Visual redesign.
* **Test**: Run Playwright a11y spec.

#### Issue 7.2 — Docs site (Markdown) published via Pages

**Labels:** `docs`, `pages`
**Title:** Docs site (/docs): Quick Start, URL schema, Config authoring, Alerts, Troubleshooting

**Body:**

* **Summary**: Minimal docs site; published via Pages.
* **Copilot brief**

  * Markdown in `/docs`; index page with nav.
  * Link from README.
* **Acceptance**

  * Pages serves `/docs/`; internal links work.
* **Out of scope**: Fancy doc generator (keep simple).
* **Test**: Visit Pages URL.

---

### PHASE 8 — CI/CD & quality bar

#### Issue 8.1 — GitHub Actions: quality (lint + unit tests)

**Labels:** `ci`, `tests`
**Title:** CI: quality workflow (lint + unit tests)

**Body:**

* **Summary**: Add `quality.yml` to run lint + unit tests on PRs.
* **Copilot brief**

  * `package.json` scripts: `lint`, `test`.
  * Choose `vitest` or `uvu` for unit tests (logic only).
* **Acceptance**

  * Failing tests/lint block merge.
* **Out of scope**: E2E.
* **Test**: Open a PR with a failing unit test; CI fails.

#### Issue 8.2 — GitHub Actions: validate configs (AJV)

**Labels:** `ci`, `validation`, `config`
**Title:** CI: validate `/public/configs/**` with AJV

**Body:**

* **Summary**: Add `validate-configs.yml`.
* **Copilot brief**

  * Node script to run AJV on all config files; readable errors in Hebrew.
* **Acceptance**

  * Invalid JSON/schema fails CI with file + path.
* **Out of scope**: E2E, deploy.
* **Test**: Break a config in a PR; CI fails with message.

#### Issue 8.3 — GitHub Actions: E2E (Playwright + PDF text)

**Labels:** `ci`, `e2e`, `pdf`
**Title:** CI: Playwright E2E (Chromium + WebKit) + PDF text assertions

**Body:**

* **Summary**: Add `e2e.yml` to run flows and verify PDF text.
* **Copilot brief**

  * Flows: Welcome→flow (Likert/ Binary), Back, Results; Composer generate+preview.
  * Export PDF; assert Hebrew header, totals, pid appear (text extraction).
* **Acceptance**

  * PR shows green E2E; artifacts include sample PDF + screenshots.
* **Out of scope**: Visual diff tooling (Percy).
* **Test**: Trigger; confirm artifacts present.

#### Issue 8.4 — GitHub Pages deploy (main + PR previews)

**Labels:** `ci`, `pages`, `deploy`
**Title:** CI: Deploy to GitHub Pages (main) + PR preview links

**Body:**

* **Summary**: Add `deploy-pages.yml` to publish the app (and docs).
* **Copilot brief**

  * On `main`: deploy app to Pages root; docs under `/docs/`.
  * On PR: publish a preview and post its URL to the PR comments.
* **Acceptance**

  * Pages serves app; PRs show preview URL.
* **Out of scope**: Cloudflare/Netlify.
* **Test**: Merge to main; load production URL.

---

### PHASE 9 — Management guardrails

#### Issue 9.1 — CODEOWNERS + PR template + labels

**Labels:** `process`, `governance`
**Title:** Governance: CODEOWNERS, PR template, labels

**Body:**

* **Summary**: Enforce clinical review for configs & PDF changes.
* **Copilot brief**

  * `CODEOWNERS`: `/public/configs/**` → clinician lead + tech lead; `/src/pdf/**` → tech lead.
  * `.github/PULL_REQUEST_TEMPLATE.md` with checklist (schema valid, tests, RTL check, PDF diff).
  * Repo labels: `clinical`, `config`, `pdf`, `a11y`, `rtl`, `good-first-issue`.
* **Acceptance**

  * PRs touching those paths require correct reviewers; template appears.
* **Out of scope**: Branch protection rules (manual).
* **Test**: Open a PR changing a config; see review requirement.

#### Issue 9.2 — GitHub Project board (kanban) + templates

**Labels:** `process`, `planning`
**Title:** Project board & issue templates (feature/bug/config/clinical copy)

**Body:**

* **Summary**: Lightweight planning system using GitHub Projects.
* **Copilot brief**

  * Create Issue templates: *feature*, *bug*, *config change*, *clinical copy change*.
  * Set up a Project board with columns: Backlog → In Progress → In Review → Done.
* **Acceptance**

  * New issues offer templates; board exists and can be used immediately.
* **Out of scope**: Automation rules (optional later).
* **Test**: Create issue → appears with template; add to board.

---

## 3) Create issues quickly with GitHub CLI (optional)

> Run from the repo root. Each block creates a single issue. Repeat for the ones you want to open now.

```bash
# 0.1
gh issue create --title "Initialize repo with ARCHITECTURE.md and project metadata" --label "infra,docs" --body-file - <<'EOF'
<PASTE BODY FROM "Issue 0.1" HERE>
EOF

# 1.1
gh issue create --title "App shell (RTL), tiny router, Welcome screen" --label "feat,rtl,ui" --body-file - <<'EOF'
<PASTE BODY FROM "Issue 1.1" HERE>
EOF

# 1.2
gh issue create --title "Load same-origin demo config and list questionnaire titles" --label "feat,config" --body-file - <<'EOF'
<PASTE BODY FROM "Issue 1.2" HERE>
EOF
```

*(Continue for the remaining issues. If your shell limits heredocs, you can save each body to a `tmp-issue.md` file and pass `--body-file tmp-issue.md`.)*

---

## 4) Running Copilot on each issue

1. Open an issue → click **Ask Copilot** (or open **Copilot Workspace**).
2. Choose **Implement**. Copilot will draft a plan, then open a PR.
3. Review the PR (look for CI results and the Pages preview link).
4. Request changes if needed; merge when green.
5. Move the issue on your Project board to **Done**.

---

## 5) Smoke test checklist (after each merge)

* **Flow**: Welcome → Likert single-tap advance → Binary swipe → Back → Results
* **PID**: Provided via Welcome/URL; appears on Results & in PDF
* **Composer**: Generates URL; Preview opens app with correct prefill
* **PDF**: Hebrew renders; soft risk colors visible; `data.json` attachment exists; XMP filled

---

*End of `ISSUES_PLAN.md`*
