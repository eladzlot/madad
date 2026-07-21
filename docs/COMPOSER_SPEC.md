# Composer Specification

## Purpose

The Composer is a clinician-facing tool that generates a **patient session URL** for the questionnaire app.

It allows a clinician to:
- Select questionnaires or pre-built batteries for a patient
- Optionally add a patient identifier
- Reorder selected items by drag-and-drop
- Generate, copy, or share the patient-ready URL

The Composer **does not create or edit configuration files**. It only constructs a valid launch URL for the existing questionnaire runtime.

---

## URL Model

The Composer generates URLs with the following parameters:

`items`
: Comma-separated ordered list of questionnaire or battery IDs. Order defines session order. Batteries are expanded by the runtime into their full sequences. **Item IDs are addresses**: the patient app expands each token to `configs/prod/<id>.json` — there is no separate config list.

`pid`
: Optional patient identifier. Must match `^[a-zA-Z0-9\u0590-\u05FF_-]{1,64}$` (see `src/pid.js`); invalid values are silently dropped by the patient runtime.

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
in sorted filename order. Every config is **exactly one questionnaire or
battery, filename = entity id = config id** (enforced by `validate:configs`).
Dev/test fixtures live in the same directory with `"dev": true` at the config
top level — their entries appear only when `import.meta.env.DEV`.

### Catalog (runtime data source)

```json
{
  "catalogVersion": 1,
  "entries": [
    {
      "id": "phq9", "kind": "questionnaire",
      "title": "שאלון דיכאון (PHQ-9)", "description": "…", "keywords": ["PHQ"],
      "itemCount": 9, "estMinutes": 1, "hasConditional": false,
      "domains": ["depression"], "type": "severity", "populations": ["adult"],
      "tags": [], "featured": true
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
- `catalogVersion` mismatches produce a non-blocking warning banner.

### Keeping the catalog in sync

The catalog is **generated and committed**. Three mechanisms keep it honest:

1. `npm run build` regenerates it before `vite build` — dist/ is always fresh.
2. CI runs `npm run validate:catalog` (regenerate + byte-compare, fails on drift).
3. After editing any config: `npm run build:catalog`, commit the result.

The dev server serves the committed file from `public/composer/` directly.

---

## UI Structure

### Layout

Two-panel layout:
- **Left/main panel** — search input + scrollable questionnaire/battery picker
- **Right/sidebar** — output panel (URL, order list, patient ID, action buttons)

The sidebar has a dark background (`#3A5068`).

### Search

Real-time filtering as the user types. Matches against:
- Title
- Description
- Keywords

Case-insensitive. Items with no match surface (no description or keywords) are still shown when the query is empty.

### Picker

Flat checkbox list, grouped into two sections: **סוללות** (batteries) and **שאלונים** (questionnaires). Hidden items (`hidden: true`) are excluded.

Each entry shows: title, description (if any), keyword tags (if any).

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

A drag-reorderable list of currently selected items, shown in the sidebar. The list reflects **selection order** — the order items will run in the patient session.

**Drag-to-reorder**: each item has a drag handle. Users can drag items to reorder them. The URL updates live as order changes.

**Keyboard navigation**: `ArrowUp` / `ArrowDown` move the focused item; `Enter` or `Space` to pick up/drop.

### Patient identifier field

Optional text input in the sidebar. The identifier appears in the PDF report and as `pid=` in the URL. No validation blocks URL generation.

### URL box

Read-only display of the generated URL. Shows placeholder text when nothing is selected.

### Action buttons

| Button | Condition | Behaviour |
|---|---|---|
| **העתק קישור** | Always visible | Copies URL to clipboard; falls back to manual selection if clipboard API unavailable |
| **שתף** | HTTPS only | Opens native Web Share sheet |
| **פתח לבדיקה** | Always visible | Opens URL in a new tab |
| **איפוס** | Always visible | Clears selection, PID, and query |

**Mobile bar**: on small screens, a sticky bottom bar shows copy + share buttons for one-handed access.

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
