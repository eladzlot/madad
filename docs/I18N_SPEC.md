# I18N_SPEC — multi-language support

**Status:** living spec. Decisions L-1..L-11 were locked with the user on 2026-09-16 (recorded as D-19 in `docs/TODO.md`); slices I18N-1..7 landed on branch `i18n` on 2026-09-17. Phase 1 (Hebrew + English) is complete; §14 describes what Russian and Arabic still need.

## Context

Madad is Hebrew-only by construction: every entry HTML is `lang="he" dir="rtl"`, all ~210 UI strings are inline literals, the PDF generator is hand-tuned for RTL, and the config layer states "the language is implicit in which file is loaded". No i18n scaffolding of any kind exists, and no TODO item tracks it.

The goal is to offer the tool to non-Hebrew-speaking clinicians and patients. **Phase 1 is English** (clinician UI on every surface + a starter set of English instruments). **Phase 2 is Russian**, expected to be a pure translation pass done by an external translator on top of the phase-1 machinery. **Phase 3 is Arabic**, which needs PDF font/shaping work and is out of scope beyond "don't preclude it".

Hebrew behaviour must stay byte-identical: existing links, existing PDFs, and the existing e2e suites keep working unchanged.

## Decisions locked in this session

| # | Decision |
|---|---|
| L-1 | The Composer chooses the patient language; the link carries `lang=`. The patient app shows exactly that language, no switcher. Links without `lang` are Hebrew forever. |
| L-2 | The whole PDF is in the patient's language (chrome, labels, categories, alerts, items). |
| L-3 | Phase 1 = Hebrew + English on all four clinician surfaces (Composer, Aggregate, Help, Landing). Russian is phase 2, done by an external translator. |
| L-4 | Instrument translations come only from published/validated sources the user locates. English originals are transcribed. |
| L-5 | Storage: a full config file per language, `public/configs/prod/<lang>/<id>.json`, same id and structure as the Hebrew file. CI enforces structural parity with the Hebrew file. |
| L-6 | Phase-1 English starter set: `phq9, gad7, pc_ptsd5, pcl5, ptci, trauma_eval, dass21, cpt_abc, demographics`. |
| L-7 | Clinician UI language: nav toggle, remembered per browser in localStorage, `?lang=` in the URL overrides, first visit follows the browser language. Landing gets a static `/en/` variant with `hreflang`. |
| L-8 | Instruments not available in the chosen patient language are **hidden** from the Composer picker. |
| L-9 | One additive schema field: optional `meta.source` (text provenance citation), required by the validator on every non-Hebrew file. |
| L-10 | The envelope gains `lang` and `instruments[].configVersion` (AGG-9 capture side). Additive, no `ENVELOPE_VERSION` bump. |
| L-11 | Switching the clinician UI language writes `?lang=` to the URL and reloads. The Composer cart is lost on switch (accepted). |

## Design

### 1. Language model — `shared/i18n/core.js` (new)

Pure, framework-free, used by every surface and by Node scripts.

```js
export const LANGS = {
  he: { dir: 'rtl', locale: 'he-IL', label: 'עברית'  },
  en: { dir: 'ltr', locale: 'en-GB', label: 'English' },   // day-first dates, matches Israeli convention
};
export const DEFAULT_LANG = 'he';
export const isLang = (x) => Object.hasOwn(LANGS, x);
export const configBaseFor = (lang) => lang === DEFAULT_LANG ? 'configs/prod/' : `configs/prod/${lang}/`;
export function makeT(table, fallbackTable)          // t(key, params): `{n}` interpolation; plural entries
                                                      // { one, few, many, other } picked via Intl.PluralRules(locale)
export function applyDocumentLang(lang, title)        // sets <html lang dir> and document.title
export function resolveClinicianLang({ search, storage, navigator })
  // precedence: ?lang= (valid) → localStorage 'madad.lang.v1' → navigator.languages (he if any starts with 'he', else en) → 'he'
```

Adding a language later = one row in `LANGS` plus string tables, fonts, and configs. `LANGS` is also imported by `scripts/validate-configs.mjs` and `shared/catalog/build-catalog.js` so the allowed language directories have a single source of truth.

### 2. String tables and loading

Two independent table sets, so clinician text never enters the patient bundle:

- `src/i18n/{he,en}.js` — patient app + PDF (~50 keys: boot errors, welcome, progress, buttons, validation, results, PDF labels, footer).
- `clinician/i18n/{he,en}.js` — nav, composer, aggregate, taxonomy labels (~200 keys, namespaced `nav.*`, `composer.*`, `aggregate.*`, `taxonomy.*`).

Each set has an `index.js` exporting `t`, `currentLang`, and `loadStrings(lang)`: Hebrew is a static import (it is the fallback table and already in the bundle today as literals); every other language is an explicit dynamic import (`{ en: () => import('./en.js') }`) so Vite emits it as a lazy chunk that costs nothing against the `^main` / `^composer` budgets. `loadStrings` must resolve before first render. A unit test asserts every table in a set has the identical key set as `he`.

`composer/src/taxonomy.js` keeps its accessor API (`domainLabel(v)` etc.) but reads `t(\`taxonomy.domain.${v}\`, v)`; `preview-dialog.js`'s private `INPUT_TYPE_LABELS` and `prettifyCondition`'s `או`/`וגם` move into the table. `shared/pid.js` `pidWarning()` returns a code (`'too-long' | 'chars'`) that the composer maps through `t`; the patient app already ignores warnings.

Plurals: `aggregate/src/components/upload-list.js`'s hand-rolled `דוח אחד נקלט / נקלטו N דוחות` becomes a plural entry. This is what makes Russian's three forms free later.

### 3. Patient URL contract — `lang=`

`?items=phq9,gad7&lang=en#pid=…`. Rules:

- Absent → `he`. Hebrew links stay exactly as today (the composer never emits `lang=he`), so every existing link, test, and fixture is untouched.
- Value not in `LANGS` → the "link is invalid" error screen (same class as other malformed links).
- The patient app calls `loadConfig(sources, { configBase: configBaseFor(lang) })`. A `lang=en` link naming an instrument with no English file 404s → the existing "cannot load questionnaire" error. The Composer makes this unreachable (§9).

`composer/src/composer-state.js` `buildUrl({ selected, pid, lang })` appends `&lang=<x>` when `x !== 'he'`. `src/app.js` `main()` parses it next to `items`. Spec update in `docs/COMPOSER_SPEC.md` "URL Model".

### 4. Config layout, validator, schema

```
public/configs/prod/phq9.json        ← Hebrew, canonical structure (unchanged)
public/configs/prod/en/phq9.json     ← English: same id, same version, same everything except text
```

`shared/config/loader.js` needs **no change** beyond callers passing `configBase`: short names expand under it, `configFileLabel` strips it (so the envelope's `configFile` stays the language-agnostic short name), and legacy full paths in `dependencies` (`configs/prod/en/pc_ptsd5.json`) already resolve. The Node `mergeConfigs` additionally stamps `q.configVersion = data.version` for §8.

`scripts/validate-configs.mjs`:
- `checkProdFileLayout` accepts `public/configs/prod/(<lang>/)?<id>.json` with `<lang>` in `LANGS` (never `he/`). Filename = id still holds.
- New `checkTranslationParity`: for every `prod/<lang>/<id>.json`, `prod/<id>.json` must exist and the two must be deep-equal after blanking text-bearing fields (`title, description, keywords, text, label, message, ratingText, labels.min/max, subscaleLabels.*, interpretations.ranges[].label, cutoffs[].label, psychometrics.source, meta.source`) and ignoring `version`/`dev`. First differing JSON path is reported. `dependencies` must equal the canonical list with `<lang>/` inserted (no cross-language deps).
- `meta.source` required on every non-Hebrew questionnaire. Battery in `<lang>/` requires every questionnaire in its sequence to exist in `<lang>/`.
- Cross-file id-uniqueness is scoped per language directory.

Schema (via the `schema-change` skill, one deploy since it is additive optional): `meta.source: { type: string, minLength: 1 }` — "citation of the source of this file's text (publication, translation, or 'Madad original')". Regenerate `shared/config/validate-schema.js`, update `docs/CONFIG_SCHEMA_SPEC.md` §1 (layout) and §4a (meta).

### 5. Catalog v2 — `shared/catalog/build-catalog.js`

`CATALOG_VERSION = 2`. `scripts/build-catalog.mjs` scans `prod/*.json` plus each `prod/<lang>/*.json`. Per entry:

```json
{ "id": "phq9", "title": "שאלון דיכאון (PHQ-9)", "description": "…", "keywords": [...],
  "languages": ["he", "en"],
  "i18n": { "en": { "title": "Patient Health Questionnaire (PHQ-9)", "description": "…", "keywords": [...] } },
  ... existing fields unchanged }
```

`languages` for a battery = intersection over its sequence (builder warns on partial). Deterministic output contract kept. Composer bumps its expected `catalogVersion` to 2 (existing skew banner covers a stale catalog). Size: ~36 → ~42 KB, outside the JS budget.

### 6. Patient app

Boot (`src/app.js`): parse `lang` → `await loadStrings(lang)` → `applyDocumentLang(lang, t('app.title'))` → then the existing flow with `showError`/`showLoading` using `t`. `index.html` keeps `lang="he" dir="rtl"` as the static default; `<title>` and OG description become bilingual ("מדד · Madad") because static HTML cannot vary per query param.

Direction fixes (the CSS is already ~97% logical):
- Remove `direction: rtl` from `src/styles/main.css` `.boot-screen` and the inline style in `src/controller.js` (inherit from `<html>`). Delete the stale "RTL is set programmatically" comment.
- `item-slider.js` / `item-rated-text.js`: the `scaleX(-1)` track flip becomes `:host(:dir(rtl))`-scoped.
- `item-binary.js`: swipe-right selects index `dir === 'rtl' ? 0 : 1`.
- `item-select.js` / `item-multiselect.js` hover `translateX` nudges get a `:dir(ltr)` sign flip.
- `--font-family` in `shared/styles/tokens.css` is fine for English (Noto Sans Hebrew covers Latin, verified: full basic Latin + Latin-1).

### 7. PDF — `src/pdf/report.js`

The single largest piece. Introduce `layoutFor(lang)` returning `L = { dir, align, cols, text, locale }`:
- `L.align` replaces every `alignment: 'right'` (default style, `instructionText`, ~25 cell sites). `'center'` stays.
- `L.cols(arr)` — identity for RTL, reversed for LTR — wraps every array authored in RTL visual order: `COL_WIDTHS`, header 3-col, table header row, item rows, summary/section rows, `entryColumns.reverse()` in `buildSubscoresLine`, `pillBadge` node order.
- `L.text(str, opts)` — `bidiNodes` for RTL; for LTR a plain node with no pre-reversal, mirroring, or NBSP fusing.
- Labels via `t('pdf.*')` from the patient table (the PDF is in the patient's language); date/time via `LANGS[lang].locale`; footer brand string translated.
- `buildDocDefinition(sessionState, config, session, now, { lang })`; `generateReport` passes `currentLang()`.
- Fonts unchanged in phase 1. Add a `fontFor(lang)` seam returning `NotoSansHebrew` for both languages so phase 2 only adds a Cyrillic family to the map and `_load()`.
- The `hasHebrew` helper is renamed `isRtlText` (it already classifies `AL`, i.e. Arabic).

Risk to verify visually: a Hebrew patient name inside an English (LTR) report. If the viewer mis-orders it, apply `bidiNodes` per token only for RTL runs.

### 8. Envelope and Aggregate

`shared/pdf/envelope-schema.js` `buildEnvelope` adds top-level `lang` and `instruments[].configVersion` (from `q.configVersion`). `validateEnvelope` accepts them as optional; readers treat absence as `'he'` / unknown. `docs/AGGREGATE_SPEC.md` §3.2 updated; AGG-9 in `docs/TODO.md` marked "capture side done, display open".

Aggregate (`aggregate/src/`):
- `uiLang` resolved at boot; `applyDocumentLang`; all chrome via `t`; the five `Intl.DateTimeFormat('he-IL')` sites and `localeCompare(…, 'he')` use `LANGS[uiLang].locale`.
- `refreshConfigs()` loads each instrument's config from `configBaseFor(uiLang)` with per-file fallback to Hebrew (`Promise.allSettled`). `store.titleFor` prefers the loaded config's title over the envelope's; severity bands/cutoff labels therefore follow the UI language when a translation exists.
- Chart text: `chart-model.js` anchors and the `direction="rtl"` on band/cutoff labels in `trajectory-chart.js` and `export-svg.js` are derived from `LANGS[uiLang].dir` (the time axis stays LTR per D-10).
- Session detail shows the PDF's `lang` as a small badge when it differs from the UI language. Scored answers are stored as values and resolve to option labels through the loaded (UI-language) config, so a Hebrew-answered PHQ-9 reads in English for an English clinician; structural parity (§4) guarantees the value means the same option in every language. Free-text answers stay in the patient's language.

### 9. Composer

- Store gains `uiLang` (resolved at boot, fixed for the page lifetime) and `patientLang` (default = `uiLang`; persisted under `madad.composer.patientLang.v1` once changed explicitly).
- `visibleEntries` additionally filters `entry.languages.includes(patientLang)` (L-8). `setPatientLang` drops now-unavailable selections and records them for a dismissible cart notice ("2 removed: not available in English").
- Card/cart/preview titles use `titleIn(entry, uiLang)` → `entry.i18n[uiLang]?.title ?? entry.title`.
- Patient-language control: a segmented control labelled with `LANGS[x].label` in the cart header (desktop) and the mobile sheet, next to the PID field.
- Preview loads the config from `configBaseFor(patientLang)` (the patient's view), chrome in `uiLang`.
- `search.js`: index the `uiLang` title/description, all other languages' titles at lower weight, keywords, id. `normalize` becomes NFD + strip `\p{M}` (covers niqqud and Latin diacritics) + Hebrew final-form folding; collation locale from `LANGS`.
- `buildUrl` per §3.

### 10. Clinician nav, language preference, Help, Landing

- `clinician/components/clinician-nav.js`: labels via `t`; a two-state language toggle. On change: write `localStorage['madad.lang.v1']`, set `?lang=` on the current URL, navigate (reload). When the current URL carries `?lang=`, the nav propagates it onto its cross-surface links.
- Each surface's entry (`composer.js`, `aggregate.js`, `help.js`) resolves the language first, `await loadStrings`, `applyDocumentLang`, then mounts.
- Help: `help/index.html` holds two content blocks `<div data-lang="he">` / `<div data-lang="en" hidden>`; `help.js` unhides the resolved one. English prose drafted by me, reviewed by the user.
- Landing (no JS, SEO matters): `landing/index.html` (he) + `landing/en/index.html` (en). The ~600-line inline `<style>` is extracted to `landing/landing.css` shared by both. Both pages carry `<link rel="alternate" hreflang="he|en|x-default">` and a language link. `vite.landing.config.js` adds the second input; `crossOriginLinksPlugin`'s `../fonts/` rewrite is a literal replace so the en page uses the same literal. English landing links point at `__APP_ORIGIN__/composer/?lang=en` and the demo at `?items=phq9&lang=en`. `landing-smoke` e2e covers `/en/`.

### 11. Content — English starter set (L-6)

Nine files under `public/configs/prod/en/`, transcribed from the originals, each with `meta.source`:

| id | source |
|---|---|
| phq9, gad7 | Pfizer public instruments (Kroenke/Spitzer) |
| pc_ptsd5, pcl5, ptci | National Center for PTSD (Prins 2016; Weathers 2013; Foa 1999) |
| trauma_eval | battery — deps rewritten to `configs/prod/en/…` |
| dass21 | Lovibond & Lovibond 1995, public |
| cpt_abc | Resick et al. CPT manual worksheet (same licence position as the Hebrew copy) |
| demographics | Madad original |

Title convention: full English name + acronym. `alert.message` ≤ 30 chars still applies ("Suicidality" fits). Catalog regenerated. The `add-questionnaire` skill gains a "translate an existing instrument" mode that copies the Hebrew file, replaces text, and runs the parity check.

### 12. Tests

- Unit: key-parity between tables; `makeT` interpolation/plurals; `resolveClinicianLang` precedence; `configBaseFor`; `buildUrl` with `lang`; validator parity/layout/source rules (fixtures under `tests/fixtures/configs/`); catalog v2 (`languages`, `i18n`, battery intersection); envelope `lang`/`configVersion`; PDF LTR (`buildTableHeaderRow` order, default alignment, header locale, `L.text` bypass); composer store filtering + selection dropping; aggregate title fallback.
- Existing Hebrew *chrome* assertions (`results-screen.test.js`, `app.test.js`, `report.test.js` header-order test, `report-render.test.js`) import the `he` table instead of literals; Hebrew *content* fixtures stay.
- E2E: Hebrew suites unchanged in behaviour but Hebrew aria-label/tab-text selectors move to the `he` table or roles. New `patient-flow-en.e2e.test.js` (`/?items=phq9,gad7&lang=en`: `html[dir=ltr]`, English chrome, PDF produced, envelope `lang === 'en'` via `parse-pdf.js`). Composer: patient-language switch hides non-English entries, URL contains `lang=en`, nav toggle reloads into English. Aggregate: mixed he/en fixture PDFs (scenario gains `lang`; `scripts/lib/mock-report.js` + `generate-test-pdfs.mjs` load `prod/<lang>/` and the matching strings). a11y walk runs for `lang=en` too (advance-button regex extended). dist-smoke adds an English patient link and `/en/` landing.

### 13. Docs and skills

New `docs/I18N_SPEC.md` (this design, kept as the living spec). Updates: `CONFIG_SCHEMA_SPEC.md` (§1 layout, meta.source, parity rule — and delete "there is no localisation nesting" caveat wording), `COMPOSER_SPEC.md` (URL model, catalog v2), `AGGREGATE_SPEC.md` (envelope), `BEHAVIORAL_SPEC.md` §6.2 + out-of-scope list, `HANDOVER.md` §3/§5/§9 (add `configBaseFor` and the parity rule to "what not to change"), `public/configs/CONTRIBUTING.md` + `LLM_GUIDE.md` (translating), `readme.md` ("All content is in Hebrew"), `.claude/skills/add-questionnaire`, `docs/TODO.md` (new `I18N` band, decisions D-xx for L-1..L-11, AGG-9 note).

### 14. Phase 2 (Russian) and phase 3 (Arabic) — designed in, not built

Russian needs only: `LANGS.ru = { dir:'ltr', locale:'ru-RU', label:'Русский' }`; `ru.js` in both table sets (a `scripts/i18n-missing.mjs` dumps keys for the translator); `prod/ru/` configs; a Cyrillic web font declared with `unicode-range` in the 3 `@font-face` sites (downloads only when Cyrillic renders) and a `fontFor('ru')` PDF family in `_load()`; `shared/pid.js` regex extended with `Ѐ-ӿ`; number formatting through `Intl.NumberFormat` for the decimal comma. Plurals are already handled by `makeT`.

Arabic: RTL layout and `bidiNodes` classification already handle `AL`. Needs an Arabic font and a verification that pdfkit/fontkit shaping survives the hand-rolled per-character mirror + NBSP fusing (joining forms may break). Flagged as an investigation task, not planned.

## Implementation order (each slice green under `npm run ci`, deployable alone, Hebrew unchanged)

1. **I18N-1 Foundation** — `shared/i18n/core.js`, schema `meta.source` + validator regen, validator layout/parity/source rules, loader `configVersion` stamp, envelope fields, catalog v2 builder + composer version bump, `prod/en/phq9.json` as the pipeline fixture.
2. **I18N-2 Patient app + PDF** — `src/i18n/`, boot `lang=`, direction fixes, `layoutFor` in `report.js`, unit + e2e (`patient-flow-en`), a11y en walk, mock-report `lang`.
3. **I18N-3 Content** — remaining eight English configs, catalog regen, `add-questionnaire` translate mode.
4. **I18N-4 Composer + nav** — `clinician/i18n/`, nav toggle + preference, patient-language control, filtering, `buildUrl`, preview, search, composer e2e.
5. **I18N-5 Aggregate** — strings, locales, chart direction, config-language title/band resolution, lang badge, mixed-language fixtures, aggregate e2e.
6. **I18N-6 Help + Landing** — help dual blocks, landing `/en/` + CSS extraction, `hreflang`, landing-smoke.
7. **I18N-7 Docs sweep** — §13, TODO archive entries.

Expected size deltas (gzipped): main +≈1 KB, composer +≈1.5 KB, aggregate +≈1 KB, `en` chunks ≈1.5 KB each lazy; all inside current budgets (25.1/30, 23.4/30, 16.5/40).

## Verification

```bash
npm run ci                                  # lint, unit, validate:configs, validate:catalog, build, size, e2e
npm run validate:configs                    # parity + meta.source rules on prod/en/*
npm run e2e -- --grep "en"                  # English patient/composer/aggregate suites
npm run demo -- <scenario with "lang":"en"> # English PDF for eyeballing
```

Manual, in the browser (Chrome MCP) at the end of slices 2, 4, 5, 6:
- `/?items=phq9,gad7&lang=en` → LTR layout, English chrome, slider/binary gestures correct, PDF opens LTR with an English date and a Hebrew patient name rendered correctly; drop the PDF into the Aggregate.
- `/composer/?lang=en` → English UI, patient-language toggle hides Hebrew-only instruments, link carries `lang=en`; toggle back to Hebrew reloads with Hebrew.
- `/help/?lang=en`, `ezmadad.com/en/` render; `hreflang` links resolve.
- Existing Hebrew link with no `lang` → pixel-identical to today (spot-check PDF).

## Open risks

- LTR PDF containing Hebrew runs (patient name): verify visually before closing slice 2.
- `:dir()` pseudo-class support on older Android WebViews; fallback is a reflected `dir` attribute set from `document.documentElement.dir`.
- Catalog `DESCRIPTION_MAX` 140 chars and `alert.message` 30 chars are Hebrew-density caps; English fits the starter set, Russian may need the caps raised (schema change, additive).
- Reload-based switch loses the composer cart (L-11, accepted).
- Instrument licences for English text are the same as for the Hebrew copies already shipped; `meta.source` records each.
