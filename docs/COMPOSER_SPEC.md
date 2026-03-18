# Composer Specification

## Purpose

The Composer is a clinician-facing tool that generates a **patient session URL** for the questionnaire app.

It allows a clinician to:

* select questionnaires for a patient
* optionally add a patient identifier
* generate a patient-ready URL
* copy or share the URL

The Composer **does not create or edit configuration files**.

It only constructs a valid launch URL for the existing questionnaire runtime.

---

# URL Model

The Composer generates URLs using the following parameters:

`configs`
: comma-separated list of config sources (slugs or absolute URLs). Only configs required to resolve the selected items are included.

`items`
: comma-separated ordered list of questionnaire IDs and/or battery IDs. Order defines session order. Batteries are expanded by the runtime into their full sequences, including control-flow nodes.

`pid`
: optional patient identifier

Example:

`https://app.example.com/?configs=configs/core.json,configs/trauma.json&items=intake_battery,phq9,pcl5&pid=ABC123`

Rules:

* `items` order defines session order
* each token in `items` resolves to either a battery (expanded) or a questionnaire
* mixing batteries and questionnaires in `items` is supported
* only configs required to resolve the selected `items` should be included
* `pid` is optional
* legacy parameters (`config`, `battery`, `qids`) are **not supported**

---

# ID Namespace

Questionnaire IDs and battery IDs share a single namespace. Within any single config file, a battery ID must not match any questionnaire ID. Across multiple config files, duplicate IDs are a hard error — the app will not load if two loaded configs define the same questionnaire or battery ID.

The Composer is configured to load a fixed set of in-repository configs that are maintained to have unique IDs. Adding configs with conflicting IDs is a configuration error that must be resolved in the files themselves, not in the UI.

---

---

# Composer Behavior

## Startup

On load the Composer:

1. loads a **config manifest** from `configs.json` (relative to the Composer page — resolves correctly at any base path)
2. loads all configs listed in the manifest in parallel, resolving their URLs against the app root
3. builds a flat list of all questionnaires and batteries from those configs

If one config fails to load:

* the Composer continues with the remaining configs
* a warning banner is shown naming the failed source

---

# Config Discovery

Configs are defined by a manifest at `public/configs.json` (relative to the app root).

Config URLs in the manifest use **root-relative paths** (`/configs/...`). The Composer resolves these against the app root URL at runtime, so they work at any base path deployment.

Each manifest entry may include:

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name (internal, not shown in UI) |
| `url` | string | Root-relative path to the config JSON |
| `hidden` | boolean | If `true`, config is loaded (IDs registered, dependencies resolved) but its questionnaires and batteries are **not shown** in the Composer UI. Default: `false`. |

Example manifest:

```json
{
  "configs": [
    {
      "name": "ספריית שאלונים סטנדרטית",
      "url": "/configs/prod/standard.json"
    },
    {
      "name": "שאלוני הערכה ראשונית",
      "url": "/configs/prod/intake.json"
    },
    {
      "name": "שאלונים לבדיקה",
      "url": "/configs/test/e2e.json",
      "hidden": true
    }
  ]
}
```

`hidden: true` is used for test fixtures and any config not intended for clinical selection. The config is still fully loaded so that batteries in visible configs can reference questionnaires from hidden configs, and dependency resolution works correctly.

The Composer loads **all configs listed in the manifest**, regardless of `hidden`.

Generated patient URLs use **relative paths** (no leading slash) in the `configs=` parameter — e.g. `configs=configs/prod/standard.json` — so the patient app can fetch them relative to its own page URL at any base path.

---

# UI Structure (MVP)

The Composer page contains three sections.

## 1. URL Preview

A read-only field showing the generated URL.

Buttons:

* **העתק קישור** — copies the URL to clipboard
* **פתח לבדיקה ↗** — opens the URL in a new browser tab for immediate testing
* **שתף** — Web Share API (shown only if available)

Behavior:

* URL is visible immediately
* All action buttons are disabled when no questionnaires are selected

---

## 2. Patient Identifier

Optional text field.

Rules:

* identifier is optional
* spaces or invalid characters produce a warning
* invalid identifier does **not block URL generation**

Recommended characters:

* letters
* numbers
* hyphen
* underscore

---

## 3. Questionnaire / Battery Selection

Questionnaires and batteries appear in a **flat checkbox list**, grouped by type.

Each questionnaire entry shows:
- The questionnaire name (title)
- The description, if defined in the config
- Keyword tags, if defined in the config

Each battery entry shows the battery name, description (if any), and a note that it is a preset.

### Search and filtering

A search input filters the visible list in real time. The search matches against:
- Questionnaire or battery title
- Description
- Keywords

Matching is case-insensitive. The full list is shown when the search input is empty. Items with no description or keywords are still shown — they just have fewer match surfaces.

### Order

Session order follows **selection order**, not list order. A small read-only list shows the current launch order.

---

# URL Generation

The URL updates automatically whenever:

* questionnaires are selected
* the patient identifier changes

URL generation is disabled if **no questionnaires are selected**.

## Dependency auto-include

When a config file declares `"dependencies": [...]`, the Composer automatically adds those dependency sources to the `configs=` parameter whenever any battery or questionnaire from that config is selected. This ensures the patient URL is always self-contained and loadable without manual intervention.

Example: selecting `clinical_intake` (from `intake.json`) automatically includes `configs/prod/standard.json` in the URL, because `intake.json` declares `"dependencies": ["configs/prod/standard.json"]`.

---

# Reset Behavior

A **Reset** button clears:

* patient identifier
* questionnaire selections

Reset happens immediately with no confirmation.

---

# Warning Banner

Warnings appear in a banner at the top of the Composer.

Examples:

* config failed to load (names the failed URL)
* invalid patient identifier characters

Warnings do **not block link generation**.

---

# Runtime Requirements

The questionnaire runtime supports the Composer URL model.

The runtime:

* parses `configs`, `items`, and `pid` from the URL
* loads all listed config sources in parallel via `loadConfig()`
* resolves each `items` token as a battery (expanding its full sequence) or questionnaire via `resolveItems()`
* launches questionnaires in the order defined by the resolved sequence
* shows a pre-welcome error screen if `items` is absent, empty, or contains an unresolvable token

---

# MVP Scope

The MVP includes:

* manifest-driven config discovery
* questionnaire and battery selection (flat list with descriptions and keyword tags)
* real-time search/filter by title, description, and keywords
* selection-order session construction
* conflict detection and warning banner
* patient identifier field
* live URL preview using the `items` parameter
* copy/share link
* reset button

The MVP **does not include**:

* config selection UI (adding/removing config sources from the active set)
* manual config URL entry
* editing session order after selection
* removing items from the selected list

---

# Post-MVP Improvements

Planned improvements include:

## Config Management

* enable/disable configs
* add external config URLs

## Questionnaire Discovery

* grouped questionnaire lists (by clinical domain)
* fuzzy search

## Session Editing

* reorder questionnaires
* remove items from the selected list
* predefined batteries (shortcuts for common sets)

## Session Metadata

* optional session title shown to the patient

## Advanced Composer Features

* config conflict resolution tools
* improved validation diagnostics

---

# Acceptance Criteria

The Composer MVP is complete when a clinician can:

1. open the Composer
2. select questionnaires
3. optionally add a patient identifier
4. obtain a valid session URL
5. copy or share the link
6. successfully launch the patient session in the main app
