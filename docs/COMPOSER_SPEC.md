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
: Comma-separated list of relative config paths. Only configs required to resolve the selected items are included (own file + declared dependencies).

`items`
: Comma-separated ordered list of questionnaire or battery IDs. Order defines session order. Batteries are expanded by the runtime into their full sequences.

`pid`
: Optional patient identifier.

Example:
```
https://app.example.com/?configs=configs/prod/standard.json,configs/prod/intake.json&items=phq9,gad7&pid=ABC123
```

Rules:
- `items` order defines session order
- Each token resolves to a battery (expanded) or questionnaire
- Mixing batteries and questionnaires is supported
- Only required configs are included (dependency auto-include, see below)
- `pid` is optional
- Config paths use **relative paths, no leading slash** so the patient app resolves them correctly at any base path

---

## Config Discovery

Configs are defined by a manifest at `public/composer/configs.json`.

Each manifest entry:

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name (internal) |
| `url` | string | Root-relative path to config JSON |
| `hidden` | boolean | Loaded but not shown in UI. Default: `false` |
| `dev` | boolean | Only loaded when `import.meta.env.DEV === true`. Skipped in production builds. Default: `false` |

Example:
```json
{
  "configs": [
    { "name": "ספריית שאלונים סטנדרטית", "url": "/configs/prod/standard.json" },
    { "name": "שאלוני טראומה",             "url": "/configs/prod/trauma.json" },
    { "name": "שאלוני הערכה ראשונית",       "url": "/configs/prod/intake.json" },
    { "name": "שאלונים לבדיקה",            "url": "/configs/test/e2e.json", "dev": true }
  ]
}
```

`dev: true` is used for E2E test fixtures. These configs are **completely absent** from production builds. In dev and Playwright they load normally, allowing E2E tests to select items by ID.

`hidden: true` loads the config (registering IDs, enabling dependency resolution) but hides its items from the picker UI.

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

### Dependency auto-include

When a config declares `"dependencies": [...]`, the Composer automatically adds those paths to `configs=` whenever any item from that config is selected.

Example: selecting `clinical_intake` (from `intake.json`) adds `configs/prod/standard.json` and `configs/prod/trauma.json` to the URL automatically, because `intake.json` declares them as dependencies.

---

## Startup Behaviour

1. Fetch `configs.json` manifest
2. Filter out `dev: true` entries when not in dev mode
3. Load all remaining configs in parallel, resolving URLs against app root
4. On partial failure: continue with successful configs, show a warning naming the failed URL
5. Render picker with all loaded items

---

## Warning Banner

Shown at the top of the Composer. Examples:
- Config failed to load (names the URL and surfaces validation detail if available)
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
