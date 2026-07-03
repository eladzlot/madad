# CODE_ORGANIZATION

How code is organized across surfaces in the Madad project.

This is a structural plan, not a build plan. It describes where files
live, how directories relate, and what rules govern cross-imports — for
the four surfaces today (Patient, Composer, Aggregate, Landing) and any
future surface (Questionnaire Viewer, Outcome Atlas, etc.) that the
project might add.

It belongs in `docs/` once landed.

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
  pid.test.js
  config/
    loader.js                   loadConfig() — fetches and merges configs
    loader.test.js
    validate-schema.js          generated schema validator
    config-validation.js        cross-validation rules (item IDs unique, etc.)
    config-validation.test.js
    QuestionnaireSet.schema.json
    QuestionnaireSet.schema.test.js
  styles/
    tokens.css                  design tokens (--color-*, --space-*, etc.)
    severity-colors.js          shared severity palette (PDF + Aggregate charts)
```

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
    clinician-tokens.css        clinician-only tokens (denser type scale, etc.)
  helpers/                      (when shared utilities emerge)
```

Files start their life in their owning surface (e.g. `composer/src/...`
or `aggregate/src/...`). They migrate to `clinician/` only when a second
clinician surface needs them. The goal is to avoid premature shared
abstractions — three concrete copies tell you what the right shared
shape is; one copy doesn't.

### 3.3 `src/` — the patient surface

Stays at the root. Everything currently in `src/` that is patient-only
stays. Two files move out:

- `src/pid.js` → `shared/pid.js`
- `src/config/*` → `shared/config/*`
- `src/styles/tokens.css` → `shared/styles/tokens.css`
- `src/styles/main.css` → stays (patient-specific layout)
- `src/styles/reset.js` → stays (patient-specific)

`src/pdf/` is a special case — see §4.

After the move, `src/` looks like:

```
src/
  app.js                        patient entry point
  router.js                     patient routing
  controller.js                 patient session controller
  resolve-items.js
  item-types.js
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
    composer.js                 entry
    composer-state.js
    composer-render.js
    composer-handlers.js
    composer-loader.js
    composer.css

aggregate/
  index.html
  src/
    aggregate.js                 entry
    aggregate-store.js
    parse-pdf.js
    aggregate.js
    rci.js
    export.js
    aggregate.css
    components/                 aggregate-only Lit components

landing/
  index.html                    static, no JS today
  (src/ created if Landing ever needs JS)
```

Each surface owns everything it uses, except imports from `shared/` and
`clinician/`.

---

## 4. The PDF subsystem — a real edge case

`src/pdf/` is currently patient-only — the patient app generates PDFs.
Aggregate will *read* PDFs but the **reader is `pdf-lib`, not the
generator**. The two are different code paths.

However, Aggregate will share the `embed-payload.js` envelope schema with
the patient PDF generator: the generator writes payloads, Aggregate reads
them. The envelope shape itself is shared knowledge.

The cleanest split:

```
src/pdf/                        patient-only PDF generation
  report.js                     pdfmake doc definition builder
  embed-payload.js              builds the JSON envelope (uses shared schema)

shared/pdf/                     PDF-related shared code
  envelope-schema.js            ENVELOPE_VERSION constant + payload type/validator
  envelope-schema.test.js
```

The generator imports `shared/pdf/envelope-schema.js` for the version
constant and the payload validator. Aggregate imports the same module to
validate inbound payloads. They never go out of sync because there's one
source of truth.

The `pdf-lib`-based reader belongs to Aggregate and lives at
`aggregate/src/parse-pdf.js`. It's not shared — only Aggregate reads PDFs.

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
  patient:  'index.html',
  composer: 'composer/index.html',
  aggregate: 'aggregate/index.html',
  landing:  'landing/index.html',
},
```

Manual chunks group heavy vendors so they don't get duplicated across
surfaces:

```js
output: {
  manualChunks: {
    'pdf-vendor':          ['pdfmake', 'bidi-js'],   // patient only
    'aggregate-pdf-parser': ['pdf-lib'],              // aggregate only
  },
},
```

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
existing project convention. The `vitest.config.js` `include` pattern
becomes:

```js
include: [
  'src/**/*.test.js',
  'shared/**/*.test.js',
  'clinician/**/*.test.js',
  'composer/src/**/*.test.js',
  'aggregate/src/**/*.test.js',
],
```

Coverage thresholds and exclusions update similarly.

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

## 9. The migration

This reorganization is a single PR. It's a mechanical refactor — file
moves, import path updates, ESLint config — with zero behaviour change.

Steps in order (each step is independently committable):

1. **Create empty target directories.** `shared/`, `clinician/`. Add
   to `vitest.config.js` `include` and `coverage.include`.

2. **Move shared modules.** With their tests:
   - `src/pid.js` + test → `shared/pid.js`
   - `src/config/*` → `shared/config/*`
   - `src/styles/tokens.css` → `shared/styles/tokens.css`
   Update import paths in:
   - All `src/` files (patient app)
   - `composer/src/composer-loader.js` (`config/loader`)
   - `composer/src/composer-state.js` (`pid`)
   - `composer/index.html` (the `<link rel="stylesheet">` to tokens)
   - `index.html` (same)

3. **Split the PDF subsystem.** Create `shared/pdf/envelope-schema.js`
   with the `ENVELOPE_VERSION` constant and the payload validator. This
   step happens during Phase 1 of the Aggregate build, not as part of
   this restructure. Mentioned here for completeness.

4. **Add ESLint boundary rules** (§5). Run `npm run lint` and confirm no
   violations exist after the moves.

5. **Verify.** `npm test`, `npm run e2e`, `npm run validate:configs`,
   `npm run check:size` all green.

The migration is small enough to do in one sitting (~half a day,
including verification). It must land **before** the Aggregate build
starts, so Aggregate is the first surface that uses the new structure
from day one.

---

## 10. What this doesn't solve

To be honest about the limits:

- **Shared visual identity across surfaces.** The clinician surfaces will
  share `clinician-tokens.css` for typography and spacing scales beyond
  the patient defaults, but there's no shared "design system" component
  library. Each surface still owns its own form controls, buttons,
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
