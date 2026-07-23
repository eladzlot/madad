# מדד — Madad

**Evidence-based clinical assessment without the friction.**

A free, open-source, browser-only tool for mental health clinicians. The clinician picks questionnaires in the Composer and sends a link; the patient fills it in on their phone and gets a PDF report with scores and clinical alerts. No backend, no accounts, no data stored anywhere — the PDF is the only output.

**[Composer](https://app.ezmadad.com/composer/) · [Landing](https://ezmadad.com/) · [Example (PHQ-9)](https://app.ezmadad.com/?items=phq9)** — the patient app opens from a Composer-generated link (`?items=…`); it has no standalone home page.

---

## How it works

- **Clinician** → opens the [Composer](https://app.ezmadad.com/composer/), selects questionnaires or a battery, copies the generated link, sends it to the patient.
- **Patient** → opens the link, answers one item at a time, downloads a PDF.
- **Aggregate** → `/aggregate/` (סיכום מטופל): drop past Madad PDFs in to see per-instrument trajectory charts. Stateless, in-browser.

Everything runs client-side. Patient answers never leave the device; the patient ID rides in the URL fragment so it never reaches a server log. Instruments are one file each under `public/configs/prod/` — item IDs are URL addresses (`?items=phq9,gad7`). All content is in Hebrew.

## Stack

Vanilla JS + ES Modules (framework-free engine), [Lit](https://lit.dev/) components, [Vite](https://vitejs.dev/), [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/), [pdfmake](https://pdfmake.github.io/) (lazy-loaded), [AJV](https://ajv.js.org/) config validation.

## Getting started

```bash
npm ci
npm run dev      # → http://localhost:5173  (/, /composer/, /landing/, /aggregate/)
npm test         # unit tests
npm run e2e      # Playwright end-to-end tests
```

Common tasks: `npm run build` (→ `dist/`), `npm run validate:configs`, `npm run build:catalog` (after editing configs), `npm run lint`. See `package.json` for the full script list.

## Adding an instrument

Config-only — no app code for standard Likert/binary scales. Start from [`public/configs/CONTRIBUTING.md`](public/configs/CONTRIBUTING.md) (human) or [`public/configs/LLM_GUIDE.md`](public/configs/LLM_GUIDE.md) (LLM-assisted), then `npm run validate:configs` and `npm run build:catalog`.

## Documentation

**Start with [`docs/HANDOVER.md`](docs/HANDOVER.md)** — full project state, architecture, the instrument library, security model, and what not to change. From there the `docs/` folder holds the detailed specs (behavioral, implementation, config schema, DSL, composer, sequence, rendering, item types).

## License

Code: [MIT](LICENSE). Clinical instruments: see [CONTENT_LICENSE.md](CONTENT_LICENSE.md) — instruments belong to their respective authors; Madad claims no ownership.

## Contact

Dr. Elad Zlotnick · Trauma Recovery Center, Hebrew University of Jerusalem · [elad.zlotnick@mail.huji.ac.il](mailto:elad.zlotnick@mail.huji.ac.il)
