# מדד — Madad

**Evidence-based clinical assessment without the friction.**

Madad is a free, open-source tool for mental health clinicians. The clinician selects questionnaires, sends a link to the patient via WhatsApp or email, and receives a completed PDF report — no registration, no apps, no data stored anywhere.

**[Live tool](https://eladzlot.github.io/madad/) · [Composer](https://eladzlot.github.io/madad/composer/) · [Landing page](https://eladzlot.github.io/madad/landing/)**

---

## How it works

**Clinician** → opens the [Composer](https://eladzlot.github.io/madad/composer/), selects questionnaires or a pre-built battery, copies the generated link, sends it to the patient.

**Patient** → opens the link, completes the questionnaires on their phone, downloads a PDF report with scores and clinical alerts.

**No data leaves the patient's device.** Everything runs in the browser. The PDF is the only output.

---

## Questionnaire library

| Config file | Contents |
|---|---|
| `standard.json` | PHQ-9, GAD-7, OCI-R, PDSS-SR, ASI-3, HAI, MGH-HPS, SPIN, ISI, DAR-5, OASIS, WSAS, WAI-6, TOP-3 |
| `trauma.json` | PC-PTSD-5 screener, PCL-5, PTCI — with a conditional battery that adds PCL-5 + PTCI automatically when the screener is positive |
| `intake.json` | DIAMOND Self Report Screener + clinical intake battery that selects follow-up questionnaires based on screener results |

All instruments are translated to Hebrew. Scoring, subscales, and clinical alerts are implemented per the validated published versions.

To add a new instrument, see [`public/configs/CONTRIBUTING.md`](public/configs/CONTRIBUTING.md).

---

## Privacy and security

- **No backend, no database, no accounts.** The app is a static site.
- **No data is transmitted.** Config files are fetched; patient answers never leave the device.
- **Config loading is same-origin only** by default — crafted external `?configs=` URLs are rejected. See `docs/IMPLEMENTATION_SPEC.md §9.1` for the full security model.
- Patient data that does appear in the PDF (name, ID, answers) never touches a server.

---

## Tech stack

- **Vanilla JS + ES Modules** — no framework in the engine or config layers
- **[Lit](https://lit.dev/)** — web components for the UI
- **[Vite](https://vitejs.dev/)** — build tool and dev server
- **[Vitest](https://vitest.dev/)** — unit tests
- **[Playwright](https://playwright.dev/)** — end-to-end tests
- **[pdfmake](https://pdfmake.github.io/)** — PDF generation, lazy-loaded
- **[AJV](https://ajv.js.org/)** — JSON schema validation for config files

---

## Getting started

**Prerequisites:** Node.js 20+, npm 10+

```bash
git clone https://github.com/eladzlot/madad.git
cd madad
npm ci
npm run dev          # → http://localhost:5173
```

The patient app is at `/`, the composer at `/composer/`, the landing page at `/landing/`.

---

## Scripts

```bash
npm run dev              # Dev server at localhost:5173
npm run build            # Production build → dist/
npm run preview          # Serve dist/ locally (base /madad/)

npm test                 # Unit tests (870 tests across 30 files)
npm run test:watch       # Unit tests in watch mode
npm run coverage         # Unit tests with coverage report

npm run e2e              # Playwright end-to-end tests
npm run e2e:ui           # Playwright interactive UI

npm run validate:configs # Validate all public/configs/**/*.json against schema
npm run build:validator  # Regenerate src/config/validate-schema.js from schema
npm run lint             # Lint src/ and tests/
npm run lint:fix         # Lint and auto-fix
npm run size             # Assert bundle size budgets (run after build)
```

---

## Repository structure

```
src/
  app.js                    Entry point — URL parsing, session init
  router.js                 History API router
  controller.js             Wiring layer: engine ↔ components
  resolve-items.js          URL tokens → orchestrator sequence
  config/
    loader.js               Fetches, validates (AJV), merges configs
    config-validation.js    Semantic validation (duplicate IDs, option sets)
    QuestionnaireSet.schema.json
  engine/
    orchestrator.js         Battery-level sequencing
    engine.js               Item-level navigation
    sequence-runner.js      Shared if/randomize resolver
    scoring.js              Score computation (sum, average, subscales, DSL)
    dsl.js                  Expression interpreter for conditions and alerts
    alerts.js               Alert evaluation
  components/               Lit web components (UI only, no logic)
  pdf/report.js             PDF generation (pdfmake, lazy-loaded)
  styles/

composer/                   Composer tool (separate Vite entry point)
landing/                    Landing page for therapists

public/
  configs/
    prod/                   Clinical content (standard, trauma, intake)
    test/                   E2E test fixtures only
    CONTRIBUTING.md         How to add an instrument
    LLM_GUIDE.md            LLM-optimised authoring guide
  composer/configs.json     Composer manifest
  fonts/                    Noto Sans Hebrew

tests/
  fixtures/                 Scoring fixtures (phq9, pcl5, ocir, top3)
  e2e/                      Playwright tests

docs/                       Developer specifications (see below)
```

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Full project state, architecture, known gaps, what not to change — start here for a deep dive |
| [`docs/BEHAVIORAL_SPEC.md`](docs/BEHAVIORAL_SPEC.md) | User-facing behavior: clinician and patient workflows |
| [`docs/IMPLEMENTATION_SPEC.md`](docs/IMPLEMENTATION_SPEC.md) | Module responsibilities, data models, PDF RTL rules, security model |
| [`docs/CONFIG_SCHEMA_SPEC.md`](docs/CONFIG_SCHEMA_SPEC.md) | Config JSON format — formal field reference |
| [`public/configs/LLM_GUIDE.md`](public/configs/LLM_GUIDE.md) | Config authoring guide with examples — optimised for LLM-assisted instrument creation (see also CONFIG_SCHEMA_SPEC.md) |
| [`docs/DSL_SPEC.md`](docs/DSL_SPEC.md) | Expression language for scoring conditions and alerts |
| [`docs/COMPOSER_SPEC.md`](docs/COMPOSER_SPEC.md) | Composer UI specification |
| [`docs/SEQUENCE_SPEC.md`](docs/SEQUENCE_SPEC.md) | Sequence runner: branching, back-navigation |
| [`docs/RENDER_SPEC.md`](docs/RENDER_SPEC.md) | Rendering layer: components and controller |
| [`docs/ITEM_TYPES_SPEC.md`](docs/ITEM_TYPES_SPEC.md) | Item type definitions and properties |

---

## Contributing an instrument

The quickest path is to use an LLM:

1. Paste [`public/configs/LLM_GUIDE.md`](public/configs/LLM_GUIDE.md) into Claude or ChatGPT
2. Describe the instrument you want to add
3. Copy the JSON output into the appropriate config file
4. Run `npm run validate:configs` and fix any errors
5. Test at `http://localhost:5173/?configs=configs/prod/standard.json&items=YOUR_ID`

For the full manual process, see [`public/configs/CONTRIBUTING.md`](public/configs/CONTRIBUTING.md).

---

## License

Code: [MIT License](LICENSE)

Clinical instruments: see [CONTENT_LICENSE.md](CONTENT_LICENSE.md) — instruments belong to their respective authors; Madad makes no claim of ownership.

---

## Contact

Dr. Elad Zlotnick · Trauma Recovery Center, Hebrew University of Jerusalem
[elad.zlotnick@mail.huji.ac.il](mailto:elad.zlotnick@mail.huji.ac.il)
