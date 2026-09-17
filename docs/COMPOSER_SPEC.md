# Composer Specification

## Purpose

The Composer is a clinician-facing tool that generates a **patient session URL** for the questionnaire app.

It allows a clinician to:
- Select questionnaires or pre-built batteries for a patient
- Optionally add a patient identifier
- Reorder selected items by drag-and-drop
- Generate, copy, or share the patient-ready URL, and show it as a QR code

The Composer **does not create or edit configuration files**. It only constructs a valid launch URL for the existing questionnaire runtime.

---

## URL Model

The Composer generates URLs with the following parameters:

`items`
: Comma-separated ordered list of questionnaire or battery IDs. Order defines session order. Batteries are expanded by the runtime into their full sequences. **Item IDs are addresses**: the patient app expands each token to `configs/prod/<id>.json` — there is no separate config list.

`pid`
: Optional patient identifier. Must match `^[a-zA-Z0-9\u0590-\u05FF_-]{1,64}$` (see `shared/pid.js`); invalid values are silently dropped by the patient runtime.

Example:
```
https://app.example.com/?items=phq9,clinical_intake&pid=ABC123
```

Rules:
- `items` order defines session order
- Each token resolves to a battery (expanded) or questionnaire
- Mixing batteries and questionnaires is supported
- Cross-file references (battery sequences) are covered by the config files' declared `dependencies`, auto-fetched by the patient app — the URL never lists configs
- `pid` is optional

### Legacy `configs=` parameter

Bundle-era URLs carried a `configs=` parameter naming config files explicitly
(`configs=standard,intake`, or full paths). The patient app **ignores it
entirely**: the files it names no longer exist, but such URLs' `items` tokens
resolve on their own, so old links keep working. Never emit `configs=` in new
links.

### Item IDs as a stable URL contract

An `items=` token is a promise: `configs/prod/<id>.json` must keep resolving
for as long as any shared link or saved clinician note references it.
Consequences:

1. **The `configs/prod/` prefix is frozen.** Moving production configs to a different folder would invalidate every existing link.
2. **Never rename or delete a prod config file.** The filename is the ID is the URL token. Retiring an instrument means keeping its file (or knowingly breaking its links).
3. **Filename = entity id = config id** — enforced by `validate:configs`.

### Global ID namespace

Questionnaire IDs and battery IDs share a single namespace **across every config file the patient app loads**. Once a questionnaire ships with ID `phq9`, that ID is effectively reserved forever — no other config can use `phq9`, and `phq9.json` cannot be reused for a different questionnaire without breaking existing patient links that reference it.

This is enforced at load time: `loadConfig` throws `ConfigError: Duplicate questionnaire ID` if two loaded configs declare the same ID. The `validate:configs` CI script catches this before deployment.

---

## Config Discovery

The composer never downloads config files. It fetches a single generated
index — the **catalog** at `public/composer/catalog.json` — produced from the
config directories by `scripts/build-catalog.mjs`.

### Config file layout (build-time input)

There is no manifest. The catalog script scans `public/configs/prod/*.json`
in sorted filename order, plus each language directory
`public/configs/prod/<lang>/*.json` for translations. Every config is
**exactly one questionnaire or battery, filename = entity id = config id**
(enforced by `validate:configs`).
Dev/test fixtures live in the same directory with `"dev": true` at the config
top level — their entries appear only when `import.meta.env.DEV`.

### Catalog (runtime data source)

```json
{
  "catalogVersion": 2,
  "entries": [
    {
      "id": "phq9", "kind": "questionnaire",
      "title": "שאלון דיכאון (PHQ-9)", "description": "…", "keywords": ["PHQ"],
      "itemCount": 9, "estMinutes": 1, "hasConditional": false,
      "domains": ["depression"], "type": "severity", "populations": ["adult"],
      "tags": [], "featured": true,
      "languages": ["he", "en"],
      "i18n": { "en": { "title": "Patient Health Questionnaire (PHQ-9)", "description": "…", "keywords": ["PHQ"] } }
    }
  ]
}
```

- The entry `id` doubles as the URL token (`items=phq9`) — no source mapping
  exists or is needed.
- `entries` carry everything the picker shows: catalog-truncated description
  (~140 chars; full text lives in the config), taxonomy meta (`domains`,
  `type`, `populations`, `tags`, `featured` — see CONFIG_SCHEMA_SPEC §4a),
  `itemCount`/`estMinutes` (unconditional path; `hasConditional: true` means
  "may be longer"), `kind` (`questionnaire` | `battery`), and `dev: true` on
  fixture entries (shown only when `import.meta.env.DEV`).
- `languages` lists the patient languages the instrument can be sent in
  (Hebrew first; a battery only in languages where every questionnaire it
  sequences exists). `title`/`description`/`keywords` stay Hebrew; `i18n[lang]`
  carries the same three fields for each translated language, for display in
  that clinician UI language. See `docs/I18N_SPEC.md` §5.
- `catalogVersion` mismatches produce a non-blocking warning banner (v1 → v2:
  `languages`/`i18n` added, 2026-09-16).

### Keeping the catalog in sync

The catalog is **generated and committed**. Three mechanisms keep it honest:

1. `npm run build` regenerates it before `vite build` — dist/ is always fresh.
2. CI runs `npm run validate:catalog` (regenerate + byte-compare, fails on drift).
3. After editing any config: `npm run build:catalog`, commit the result.

The dev server serves the committed file from `public/composer/` directly.

---

## UI Structure

### Layout

Two panels:
- **Left/main panel** — search input + scrollable questionnaire/battery picker
- **Right/sidebar (the rail)** — `<selection-cart>`: session settings, the ordered
  selection, and the generated link with its actions

The rail has a dark background (`#3A5068`). There is **no bottom bar on desktop**:
bottom-anchored actions are a phone idiom, and with a rail already on screen they put the
link where the eye does not go.

The rail is **one fixed head over one scrolling list**, and every part of that is
deliberate:

1. **The head is the link and its actions, then the settings chips.** Actions lead because
   the rail's payoff is the link. The chips follow because they are attributes *of* that
   link — language and ID change what it contains — so they read as its metadata rather than
   as a separate concern.
2. **The list is the only thing that scrolls.** It grows as a clinician works, and nothing
   above it can be displaced.
3. **The head's footprint never changes.** Same height with or without a link — the URL line
   is clamped to exactly two lines whether it holds a URL or the placeholder. (Before this,
   the QR tile rendered only once a URL existed, so the rail jumped ~112px on the first pick;
   a `min-height` on the URL line still left 3px, because the placeholder wraps to one line
   where a real URL takes two.)

Below the 768px breakpoint the rail is hidden and `<mobile-bar>` takes over: a fixed bar
that opens a bottom sheet whose body is **the same `<selection-cart>`**, in `compact` mode.
One renderer, two hosts — there is no second implementation of the selection, the settings
or the link.

### Search

Real-time filtering as the user types. Matches against:
- Title
- Description
- Keywords

Case-insensitive. Items with no match surface (no description or keywords) are still shown when the query is empty.

### Picker

A flat list of cards, narrowed by the taxonomy tabs and filter chips behind the
**סינון** caret rather than by fixed grouping. Hidden items (`hidden: true`) are
excluded, and entries unavailable in the patient language are not listed at all.

Each card shows: title, id, and a kind pill for batteries (**סוללה**) and
worksheets (**דף עבודה**) only. Description, domain, type and duration live in
the preview, not on the card. Two trailing icon buttons ride on every card — the
preview eye and the recommended-set pin — as DOM siblings of the select button.

By default the list is **curated** to the clinician's recommended set, with a
**הצג הכל** escape hatch; the set is the catalog's `featured` flag plus the
clinician's own pin overlay (`composer-profile.js`).

### Preview

Each browse card carries an **eye (👁) button** on its trailing edge (a DOM sibling of the select button, so opening a preview never toggles selection). It opens a **static, read-only preview** of the instrument in a native `<dialog>` (full-screen on mobile) that doubles as a discovery/spec sheet.

The preview is built by a **pure** model builder, `composer/src/preview/preview-model.js` — `buildPreviewModel(config, entryId) → DisplayModel`. It never runs the engine: `if` conditions are shown **structurally** under indented "מוצג בתנאי" dividers, `randomize` as a "סדר אקראי" marker, and conditions are never evaluated.

A **"מנגנון" (mechanics) toggle** in the header reveals the underlying wiring — each item's id (labelled `id: <id>`), the explicit DSL of every condition/alert (prettified: `>=`→`≥`, `==`→`=`, `||`→`או`, `&&`→`וגם`; item references left verbatim), subscale member ids, and the keyword list. Off by default for a clean clinical read; on for authors tracing the logic.

The dialog (`composer/src/components/preview-dialog.js`) renders three parts:
- **Summary** — title, id, description, meta badges (type/domains/populations/tags), item count, duration, keywords.
- **Scoring & interpretation** — scoring method, subscales (id → label → member items), interpretation ranges ladder, psychometrics, alerts. Only the parts the config has are rendered.
- **Item walk** — each item read-only by type (options for select/binary/multiselect, range for slider, a free-text placeholder for text, muted text for instructions), with conditional groups shown under indented "מוצג בתנאי: `<DSL>`" / "אחרת" dividers.

**Batteries** render as an all-collapsed accordion of steps (`<details>`); each step shows its title, item count, and gating condition, and expands to that questionnaire's own summary + scoring + item walk. `questionnaireId` is resolved to the real title from the loaded dependencies.

The dialog keeps a **↗ live-flow link** that opens the patient app for that entry (`buildUrl({ selected: [id] })`). Loading is lazy: the loader (AJV), the model builder, and the dialog component are dynamically imported on first open, and each entry's `ResolvedConfig` is cached for instant reopen — none of this is in the composer's startup bundle (enforced by `scripts/check-size.mjs`, `preview-dialog` chunk ≤ 8 KB gz).

### Order list

A drag-reorderable list of currently selected items, in the rail below the head (and in the
sheet on phones). The list reflects **selection order** —
the order items will run in the patient session.

**Drag-to-reorder**: the whole row is draggable. The URL updates live as order
changes.

**Keyboard**: each row carries ↑ / ↓ buttons. Reordering is a rare action, so in
the rail those two buttons reveal on `:hover` or `:focus-within` — via
`opacity`, never `display: none`, so they stay in the tab order and in the
accessibility tree. The sheet keeps them visible: a phone has no hover, and the
sheet has the room.

### Session settings

`<session-settings>` holds the two things that are about the link rather than
about the instruments: the **patient language** and the optional **patient
identifier**. Both are set once per patient, if ever, so neither holds permanent
rail space.

They present as **value chips** — the closed state is the settings themselves
(`עברית` · `הוסף מזהה`) rather than a label about them. A chip with no value yet is
**dashed**: an empty slot asking to be filled, not a disabled control.

The two chips behave differently, on purpose:

- **Language is a `<select>` wearing a chip.** One click reaches the native list, the same
  gesture as the nav's UI-language switch. Not a segmented toggle: the language list is
  open-ended (I18N-8 Russian, I18N-9 Arabic) and a control per language stops working past
  two or three.
- **The ID chip reveals one labelled field and focuses it**, so it is one click to start
  typing while keeping the label and the "PDF only" hint that a bare inline input has
  nowhere to put.

The field is **rendered only while open** — a `hidden` attribute alone does not hide it,
because the author `display` declaration beats the UA `[hidden]` rule. It **opens itself**
when something needs attention (an invalid pid, or entries dropped by a language switch) and
never forces itself closed.

The drawer **opens itself** when something needs attention: an invalid pid, or
entries dropped by a language switch. It never forces itself closed again. The
identifier appears in the PDF report and as `pid=` in the URL fragment; no
validation blocks URL generation.

### URL line

Read-only display of the generated URL, at the top of the rail above the actions. Muted
monospace clamped to exactly two lines — it is a receipt, not something to read; copy and the QR are how the link
travels. Shows placeholder text when nothing is selected, **at the same height**.

**The phone bar carries no URL at all.** It always clipped at that width, so the bar shows
the selection count instead and the sheet carries the URL in full. That is also what keeps
the bar inside a 320px viewport (WCAG 1.4.10 reflow).

### QR code

A **QR icon button** in the rail head (and on the phone bar) opens `<qr-code>`'s native `<dialog>`
directly: the code large enough to scan across a desk, the link spelled out
under it, and a **הורד PNG** button (canvas → PNG, filename `madad-qr.png`).

The component renders in `tileless` mode there — the dialog without the 104px
preview tile — and exposes a public `expand()` the bar calls. It re-encodes on
every URL change, so the patient ID rides along in the code exactly as in the
link; `expand()` called mid-encode opens as soon as the matrix lands.

The encoder (`qrcode-generator`, MIT) is a lazy dynamic import from `composer/src/qr.js` — it lands in its own chunk (budgeted in `scripts/check-size.mjs`) and is fetched only once a link exists. Error correction is M; the quiet zone is 4 modules and is drawn inside the SVG so the tile is always white regardless of theme or rail colour. If the chunk cannot be loaded (offline), the tile is replaced by a one-line notice and the link keeps working.

### Action buttons

All of these live at the top of the rail except reset. Everything there is *disabled*, never
hidden, when there is no link — the head's footprint is fixed.

The hierarchy is deliberate: the URL carries **no fill and no border**, because when it had
them it was the only object with an edge and the actual controls read as text. The primary
is accent teal with dark ink and spans the full width; the secondary buttons sit in an equal
row beneath it at a full 44px target, so the foot reads as one block.

| Button | Condition | Behaviour |
|---|---|---|
| **העתק קישור** | Rail head; on the phone bar only where the platform has no Web Share | Copies URL to clipboard; falls back to manual selection if clipboard API unavailable |
| **שתף** | Where `navigator.share` exists — the primary action when narrow | Opens native Web Share sheet |
| **↗ פתח קישור** | Rail head | Opens URL in a new tab |
| **QR** | Rail head and phone bar | Opens the enlarged QR dialog (scan / download PNG) |
| **⌃ נבחרו N** | Narrow only | The selection count *is* the button that opens the sheet. The **chevron** is the affordance — without it the count read as a status line and nothing invited the tap |
| **איפוס** | Browse toolbar (`catalog-controls`), and in the sheet on phones where the toolbar sits behind the backdrop | Clears selection, PID, and query |

### Dark mode

The full Composer UI responds to `@media (prefers-color-scheme: dark)` with an adjusted palette.

---

## URL Generation

The URL rebuilds automatically on every:
- Checkbox toggle
- Order change (drag or keyboard)
- PID input change

### Cross-config dependencies

The Composer does **not** track dependencies. When a config declares
`"dependencies": [...]`, the patient app's `loadConfig` auto-fetches them at
runtime (BFS walk over declared dependencies — `shared/config/loader.js`,
`loadDependencies: true` by default).

Example: selecting `clinical_intake` generates `items=clinical_intake`. The
patient app fetches `configs/prod/clinical_intake.json`, sees its declared
dependencies (`diamond_sr`, `phq9`, `pcl5`, …), and fetches those too.

---

## Startup Behaviour

1. Fetch `catalog.json` (relative URL, `cache: 'no-cache'`)
2. On fetch/parse failure: show the boot error block (`.c-error`) — the composer cannot run without the catalog
3. Filter out entries whose source is `dev: true` when not in dev mode
4. Populate picker state from catalog entries; warn (non-blocking) on `catalogVersion` mismatch
5. Render picker with all active entries

---

## Warning Banner

Shown at the top of the Composer. Examples:
- Catalog version mismatch (stale cached catalog against a newer bundle)
- Invalid patient identifier characters

Warnings do **not block link generation**.

---

## Reset

Clears selection, PID, and search query immediately. No confirmation.

---

## Runtime Requirements

The patient app:
- Parses `items` and `pid` from the URL (a legacy `configs` param is ignored)
- Expands each unique `items` token to `configs/prod/<id>.json` and loads them in parallel via `loadConfig()` (declared dependencies auto-fetched)
- Resolves each `items` token as battery or questionnaire via `resolveItems()`
- Shows a pre-welcome error screen if `items` is absent, empty, or unresolvable
