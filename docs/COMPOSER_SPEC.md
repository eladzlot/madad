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

configs
: comma-separated list of config sources

qids
: comma-separated list of questionnaire IDs in launch order

pid
: optional patient identifier

Example:

`https://app.example.com/?configs=/configs/core.json,/configs/trauma.json&qids=phq9,gad7,pcl5&pid=ABC123`

Rules

* `qids` order defines questionnaire order
* only configs required to resolve the selected `qids` should be included
* `pid` is optional

Legacy parameters (`config`, `battery`) are **not supported**.

---

# Composer Behavior

## Startup

On load the Composer:

1. loads a **config manifest**
2. loads all configs listed in the manifest
3. builds a questionnaire list from those configs

If one config fails to load:

* the Composer continues
* a warning banner is shown

---

# Config Discovery

Configs are defined by a Composer-specific manifest.

Example:

`/composer/configs.json`

Example structure:

```
{
  "configs": [
    {
      "name": "Emotion Disorder Questionnaires",
      "url": "/configs/emotion.json"
    },
    {
      "name": "Trauma Questionnaires",
      "url": "/configs/trauma.json"
    }
  ]
}
```

The Composer loads **all configs listed in the manifest**.

---

# UI Structure (MVP)

The Composer page contains three sections.

## 1. URL Preview

A read-only field showing the generated URL.

Buttons:

* Copy link
* Share link (Web Share API if available)

Behavior:

* URL is visible immediately
* URL is disabled when no questionnaires are selected

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

## 3. Questionnaire Selection

Questionnaires appear in a **flat checkbox list**.

Each entry shows:

* questionnaire name
* questionnaire description

Selecting questionnaires builds the patient session.

### Order

Questionnaire order follows **selection order**, not list order.

A small read-only list shows the current launch order.

---

# URL Generation

The URL updates automatically whenever:

* questionnaires are selected
* the patient identifier changes

URL generation is disabled if **no questionnaires are selected**.

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

* config failed to load
* duplicate `qid` across configs
* invalid patient identifier

Warnings do **not block link generation**.

---

# Runtime Requirements

The questionnaire runtime must support the Composer URL model.

Required changes:

* parse `configs`, `qids`, and `pid`
* load multiple configs
* resolve questionnaires by `qid`
* launch questionnaires in URL order

The runtime must support **synthetic sessions assembled from qids**.

---

# MVP Scope

The MVP includes:

* manifest-driven config discovery
* questionnaire selection
* selection-order session construction
* patient identifier field
* live URL preview
* copy/share link
* reset button
* warning banner

The MVP **does not include**:

* config selection UI
* manual config URL entry
* predefined batteries
* questionnaire search
* editing questionnaire order
* removing items from the selected list

---

# Post-MVP Improvements

Planned improvements include:

## Config Management

* enable/disable configs
* add external config URLs

## Questionnaire Discovery

* grouped questionnaire lists
* search
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
