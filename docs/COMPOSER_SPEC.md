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

`configs`
: Comma-separated list of **config short names**. Each short name resolves to `/configs/prod/<name>.json`. The short name is derived from the manifest entry's URL by stripping the `configs/prod/` prefix and `.json` suffix.

`items`
: Comma-separated ordered list of questionnaire or battery IDs. Order defines session order. Batteries are expanded by the runtime into their full sequences.

`pid`
: Optional patient identifier. Must match `^[a-zA-Z0-9\u0590-\u05FF_-]{1,64}$` (see `src/pid.js`); invalid values are silently dropped by the patient runtime.

Example:
```
https://app.example.com/?configs=standard,intake&items=phq9,clinical_intake&pid=ABC123
```

Rules:
- `items` order defines session order
- Each token resolves to a battery (expanded) or questionnaire
- Mixing batteries and questionnaires is supported
- Only the selected items' source configs are included (declared cross-config dependencies are auto-fetched by the patient app, see below)
- `pid` is optional

### Short names as a stable URL contract

The Composer emits short names (e.g. `standard`, `intake`, `trauma`) rather than full paths. These short names are a **stable external contract** once URLs are shared — a link sent via WhatsApp or saved in a clinician's notes must continue to resolve indefinitely. This has three consequences:

1. **The `configs/prod/` prefix is frozen.** Moving production configs to a different folder would invalidate every existing link.
2. **Short names flatten the namespace.** Two configs with the same basename (e.g. `configs/prod/standard.json` and `configs/v2/standard.json`) would collide on the short name `standard`. Adding a `v2` namespace would require versioned short names (e.g. `v2.standard`).
3. **Never rename a prod config file.** Renaming `standard.json` to `adult.json` breaks every existing link to its questionnaires. Add a new file instead.

Hand-crafted URLs may also use full paths (`configs=configs/prod/standard.json`) — `loadConfig` accepts both forms. The Composer always emits the short form for brevity.

### Global ID namespace

Questionnaire IDs and battery IDs share a single namespace **across every config file the patient app loads**. Once a questionnaire with ID `phq9` ships in `standard.json`, that ID is effectively reserved forever — no other config can use `phq9`, and `standard.json` cannot reuse `phq9` for a different questionnaire without breaking existing patient links that reference it.

This is enforced at load time: `loadConfig` throws `ConfigError: Duplicate questionnaire ID` if two loaded configs declare the same ID. The `validate:configs` CI script catches this before deployment.

---

## Config Discovery

The composer never downloads config files. It fetches a single generated
index — the **catalog** at `public/composer/catalog.json` — produced from the
manifest and the config files by `scripts/build-catalog.mjs`.

### Manifest (build-time input)

`public/composer/configs.json` lists which configs enter the catalog and in
what order. It is read only by the catalog build script — nothing fetches it
at runtime.

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name (internal) |
| `url` | string | Root-relative path to config JSON |
| `hidden` | boolean | Config contributes no picker entries (its questionnaires still count toward battery sizes; the patient app still loads it via dependency auto-fetch). Default: `false` |
| `dev` | boolean | Entries from this source are only shown when `import.meta.env.DEV === true`; skipped in production builds. Default: `false` |

### Catalog (runtime data source)

```json
{
  "catalogVersion": 1,
  "entries": [
    {
      "id": "phq9", "kind": "questionnaire",
      "title": "שאלון דיכאון (PHQ-9)", "description": "…", "keywords": ["PHQ"],
      "source": "standard", "itemCount": 9, "estMinutes": 1, "hasConditional": false,
      "domains": ["depression"], "type": "severity", "populations": ["adult"],
      "tags": [], "featured": true
    }
  ]
}
```

- `source` is a **token**: exactly what goes into the `configs=` parameter of
  generated URLs (short name for `configs/prod/*` files, relative path for
  anything else).
- `entries` carry everything the picker shows: catalog-truncated description
  (~140 chars; full text lives in the config), taxonomy meta (`domains`,
  `type`, `populations`, `tags`, `featured` — see CONFIG_SCHEMA_SPEC §4a),
  `itemCount`/`estMinutes` (unconditional path; `hasConditional: true` means
  "may be longer"), `kind` (`questionnaire` | `battery`), and `dev: true` on
  entries from dev sources (shown only when `import.meta.env.DEV`).
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

Example: selecting `clinical_intake` (from `intake.json`) generates
`configs=intake`. The patient app fetches `intake.json`, sees its declared
dependencies (`standard`, `trauma`), and fetches those too. Older URLs that
list dependency configs explicitly keep working — the loader's visited-set
dedupes either way.

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
- Parses `configs`, `items`, `pid` from the URL
- Loads all configs in parallel via `loadConfig()`
- Resolves each `items` token as battery or questionnaire via `resolveItems()`
- Shows a pre-welcome error screen if `items` is absent, empty, or unresolvable
