# CODE_ORGANIZATION

How code is organized across surfaces in the Madad project.

This describes where files live, how directories relate, and what rules
govern cross-imports — for the surfaces today (Patient, Composer,
Aggregate, Help, Landing) and any future surface (Questionnaire Viewer,
Outcome Atlas, etc.) that the project might add.

The reorganization this document specifies has landed: `shared/` and
`clinician/` exist and the rules below are in force.

---

## 1. The two-axis split

The project's code splits on two independent axes:

**Axis 1 — surface.** Which deployable HTML page does this code belong
to? `index.html` (Patient), `composer/index.html`, `aggregate/index.html`,
`landing/index.html`. Every JS file belongs to exactly one surface, or
to a shared layer used by multiple surfaces.

**Axis 2 — audience.** Patient or clinician? The Patient surface is
patient-facing. Composer, Aggregate, and Landing (and any future
admin/clinician surface) are clinician-facing. This axis matters because:

- Patient code must stay distraction-free, lightweight, and audited for
  privacy contracts (no analytics, no external requests, no clinician
  affordances bleeding through).
- Clinician surfaces share UI conventions (top nav, palette, denser
  layouts) that would be wrong on the patient surface.
- Bundle size: every byte of clinician code that leaks into the patient
  bundle is a regression. Patient bundle stays under its existing
  budget (~30 KB gzipped).

The two axes mostly align — patient code is on the patient surface,
clinician code is on clinician surfaces — but not perfectly. A small
shared layer crosses both.

---

## 2. Three zones

```
shared/      cross-surface, cross-audience. Used by ≥2 surfaces.
clinician/   cross-surface but clinician-only. Used by ≥2 clinician surfaces.
src/         the patient surface. Stays at root for clarity.
```

Surface entry points live at the root:

```
index.html              → src/app.js              Patient
composer/index.html     → composer/src/...        Composer
aggregate/index.html     → aggregate/src/...        Aggregate
landing/index.html      → (static, no JS)         Landing
```

The patient app stays at the root. It is the public-facing surface, the
URL anchor, and the historical core — moving it would be churn for
churn's sake. Every other surface lives in its own peer directory
(`composer/`, `aggregate/`, `landing/`).

`shared/` and `clinician/` are libraries imported by surface code. They
do not have HTML entry points.

---

## 3. What lives where

### 3.1 `shared/`

Code used by **both patient and clinician surfaces**. Today this is a
very small set:

```
shared/
  pid.js                        PID validation regex + warning helper
  config/
    loader.js                   loadConfig() — fetches and merges configs
    validate-schema.js          generated schema validator
    config-validation.js        cross-validation rules (item IDs unique, etc.)
    item-types.js               item type registry (isScored, canAdvance, ...)
    options.js                  option-set resolution
    QuestionnaireSet.schema.json
  catalog/
    build-catalog.js            builds the composer catalog index from prod/
  pdf/
    envelope-schema.js          embedded data.json envelope + validateEnvelope
  styles/
    tokens.css                  design tokens (--color-*, --space-*, etc.)
```

(Tests live beside each module; omitted here for brevity.)

That's it. The criterion for `shared/` is **strict**: a file lives here
only if it is actually imported by the patient surface AND at least one
clinician surface. Speculative sharing is out — move things here when a
second importer appears, not before.

### 3.2 `clinician/`

Code used by **two or more clinician surfaces but NOT the patient
surface**. The home for the cross-clinician design language and any
utilities the clinician surfaces will all want.

```
clinician/
  components/                   Lit components shared across clinician surfaces
    clinician-nav.js            top-bar nav (Composer / Aggregate / Landing links)
    clinician-nav.test.js
  styles/
    clinician-styles.js         clinician design vocabulary, adopted at the
                                document level by each clinician surface
  helpers/                      (when shared utilities emerge)
```

Files start their life in their owning surface (e.g. `composer/src/...`
or `aggregate/src/...`). They migrate to `clinician/` only when a second
clinician surface needs them. The goal is to avoid premature shared
abstractions — three concrete copies tell you what the right shared
shape is; one copy doesn't.

### 3.3 `src/` — the patient surface

Stays at the root. Everything in `src/` that is patient-only stays.
What moved out:

- `src/pid.js` → `shared/pid.js`
- `src/config/*` → `shared/config/*`
- `src/item-types.js` → `shared/config/item-types.js`
- `src/styles/tokens.css` → `shared/styles/tokens.css`
- `src/styles/main.css` — stayed (patient-specific layout)
- `src/styles/reset.js` — stayed (patient-specific)

`src/pdf/` is a special case — see §4.

`src/` today:

```
src/
  app.js                        patient entry point
  router.js                     patient routing
  controller.js                 patient session controller
  resolve-items.js
  components/                   patient Lit components (item-*, screens, etc.)
  engine/                       scoring, alerts, DSL, orchestrator
  helpers/                      gestures (touch handlers)
  styles/                       patient-only CSS
  pdf/                          (see §4)
```

This is essentially what's there today minus the four shared things.

### 3.4 Surface directories

```
composer/
  index.html
  src/
    composer.js                 entry / composition root
    composer-store.js           reactive store
    composer-state.js           URL builder, pid, getAppRoot()
    composer-loader.js          catalog fetch + dev filtering
    composer-profile.js         personal pin overlay (localStorage)
    search.js taxonomy.js ui-reset.js
    preview/                    preview-model
    components/                 composer-only Lit components
    composer.css

aggregate/
  index.html
  src/
    aggregate.js                entry / composition root
    store.js                    session store + pid filter
    parse-pdf.js                data.json extraction
    chart/                      scales, models, trajectory-chart, export
    components/                 aggregate-only Lit components
    aggregate.css

help/
  index.html
  src/                          help.js (nav + styles only), help.css

landing/
  index.html                    static, built by vite.landing.config.js
```

Each surface owns its own components. A component moves to `clinician/`
only when a second clinician surface imports it (see §3.2).

---

## 4. The PDF subsystem — a real edge case

`src/pdf/` is patient-only — the patient app generates PDFs. Aggregate
*reads* them, which is a different code path entirely. What the two share
is the envelope: the generator writes it, Aggregate reads it.

The split:

```
src/pdf/                        patient-only PDF generation
  report.js                     pdfmake doc definition builder + envelope embed

shared/pdf/                     PDF-related shared code
  envelope-schema.js            ENVELOPE_VERSION constant + payload type/validator
  envelope-schema.test.js
```

The generator imports `shared/pdf/envelope-schema.js` for the version
constant and the payload validator. Aggregate imports the same module to
validate inbound payloads. They never go out of sync because there's one
source of truth.

The reader belongs to Aggregate and lives at `aggregate/src/parse-pdf.js`
— a zero-dependency byte scanner (TODO.md D-9), not a PDF library. It's
not shared: only Aggregate reads PDFs.

---

## 5. Cross-import rules

These are the rules that keep the structure honest. They become an
ESLint config that enforces them.

| From | May import from |
|---|---|
| `src/` (patient) | `shared/`, internal `src/` |
| `composer/` | `shared/`, `clinician/`, internal `composer/` |
| `aggregate/` | `shared/`, `clinician/`, internal `aggregate/` |
| `landing/` | `shared/`, `clinician/`, internal `landing/` |
| `shared/` | only other `shared/` (no surface, no clinician) |
| `clinician/` | `shared/`, internal `clinician/` |

Forbidden imports:

- `src/` (patient) importing from `clinician/`, `composer/`, `aggregate/`,
  `landing/` — patient app must not pull in clinician code, ever.
- `clinician/` importing from `src/` — `clinician/` is for code shared
  across multiple clinician surfaces, not for code that depends on the
  patient app.
- Any surface importing from another surface's directory directly. If
  Composer needs something Aggregate has, the something moves to
  `clinician/` first.
- `shared/` importing from anywhere except `shared/`. `shared/` is the
  bottom of the dependency graph.

The ESLint config (sketch):

```js
// eslint.config.js — boundary rules
{
  files: ['src/**/*.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: ['**/clinician/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
    }],
  },
},
{
  files: ['composer/**/*.js', 'aggregate/**/*.js', 'landing/**/*.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        '**/src/**',                                  // no patient code
        // surfaces don't import each other's code:
        '../composer/**', '../aggregate/**', '../landing/**',
      ],
    }],
  },
},
{
  files: ['clinician/**/*.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: ['**/src/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
    }],
  },
},
{
  files: ['shared/**/*.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: ['**/src/**', '**/clinician/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
    }],
  },
},
```

---

## 6. Vite configuration

`vite.config.js` declares one input per surface:

```js
input: {
  patient:   'index.html',
  composer:  'composer/index.html',
  aggregate: 'aggregate/index.html',
  help:      'help/index.html',
  // landing/ builds separately → dist-landing/ (vite.landing.config.js)
},
```

Manual chunks group heavy vendors so they don't get duplicated across
surfaces:

```js
output: {
  manualChunks: {
    'pdf-vendor': ['pdfmake', 'bidi-js'],   // patient only, lazy-loaded
  },
},
```

(The Aggregate needs no PDF vendor — `parse-pdf.js` extracts the embedded
`data.json` with zero dependencies.)

`shared/` and `clinician/` modules are split per-surface by Rollup
naturally — each surface's bundle includes only what it imports
transitively. There is **no shared "library" chunk** loaded by all
surfaces. Two reasons:

- Surfaces are loaded at different times and by different audiences. A
  shared chunk would force a network round-trip even when the user
  only opens one surface.
- The shared surface is small enough that duplication is cheap.
  `pid.js` is ~200 bytes; bundled into both Patient and Composer
  costs less than the HTTP overhead of a separate request.

If `shared/` ever grows to >20 KB and is loaded by ≥3 surfaces, revisit.

---

## 7. Test layout

Tests live alongside source files (`<file>.test.js`), matching the
existing project convention. The `vitest.config.js` `include` pattern is:

```js
include: [
  'src/**/*.test.js',
  'shared/**/*.test.js',
  'clinician/**/*.test.js',
  'composer/src/**/*.test.js',
  'aggregate/src/**/*.test.js',
],
```

Coverage `include` mirrors it; surface composition roots
(`composer/src/composer.js`, `aggregate/src/aggregate.js`), `src/app.js`,
`src/router.js`, and the generated `shared/config/validate-schema.js` are
excluded — the E2E suite covers those boot paths.

E2E tests stay in `tests/e2e/` (no need to fragment them by surface —
they exercise the deployed app).

---

## 8. Adding a new surface — the recipe

When the next surface arrives (say, a Questionnaire Viewer for clinicians
to preview instruments before sending):

1. Create the directory: `viewer/index.html`, `viewer/src/viewer.js`.
2. Add the Vite input: `viewer: 'viewer/index.html'`.
3. Add to `clinician-nav.js` so it appears in the shared top bar.
4. Add bundle size budgets to `scripts/check-size.mjs`.
5. Add an E2E happy path + dist-smoke at `tests/e2e/viewer.*.test.js`.
6. Surface code imports from `shared/` and `clinician/` as needed; if
   it needs a piece of code that currently lives in `composer/` or
   `aggregate/`, **first move that code to `clinician/`**, then import
   from there.

The "move-to-clinician-first" rule keeps the structure honest. It
prevents the casual `import { foo } from '../composer/src/whatever.js'`
that would otherwise creep in and silently couple two surfaces.

---

## 9. What this doesn't solve

To be honest about the limits:

- **Shared visual identity across surfaces.** The clinician surfaces
  share `clinician/styles/clinician-styles.js` for typography, spacing,
  and the `c-*` vocabulary beyond the patient defaults, but there's no
  shared "design system" component library. Each surface still owns its own form controls, buttons,
  panels. If those start diverging visually, the answer is to move
  components into `clinician/components/` one at a time as they emerge
  — not to pre-build a full DS.

- **Cross-surface state.** Surfaces cannot share runtime state. Each is
  a separate page load, separate JS context. If a future feature
  requires it (e.g. "open this in Composer" jumps from Aggregate with
  pre-filled fields), state crosses via URL parameters, the same
  mechanism Composer already uses today. No global store, no postMessage,
  no service worker hacks.

- **Audience mixing.** A future surface that's used by *both* patient
  and clinician (unlikely, but conceivable — e.g. an emergency-resources
  page) would need its own zone. We'd handle it then. The two-zone
  split (`shared/` for cross-audience, `clinician/` for cross-surface
  clinician-only) is the right starting point because that's the actual
  shape of the project today and for the foreseeable future.

- **Versioning of `shared/`.** `shared/` is treated as a library
  internally but doesn't get its own version number. It evolves with
  the surfaces; breaking changes get fixed at all callsites in the same
  PR. This is fine because the project is a monorepo with one release
  cadence.
