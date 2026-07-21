---
name: add-questionnaire
description: Add a clinical questionnaire/instrument to the Madad config files. Use whenever the user asks to add, import, or translate a questionnaire, scale, or instrument (e.g. "add the BAI", "הוסף שאלון"). Covers psychometrics lookup, Hebrew translation, proofreading, validation, and pre-commit review.
---

# Adding a questionnaire to Madad

You are adding a clinical instrument to this repository's config files. The full schema
reference is `public/configs/LLM_GUIDE.md` and the process rules are
`public/configs/CONTRIBUTING.md` — **read both before writing any JSON.** This skill
defines the workflow around them. Follow the steps in order; do not skip the review gate.

## The content model (read first)

**An item ID is an address.** Every questionnaire OR battery is its own file at
`public/configs/prod/<id>.json`, where **filename = entity id = config id**
(`validate:configs` enforces this). There are no bundle files, no
`public/composer/configs.json` manifest, and no `configs/test/` directory. Patient
URLs are `?items=<id>,<id>&pid=<pid>` — each token resolves to `configs/prod/<id>.json`.
A separate generated index, `public/composer/catalog.json`, powers the composer's
browsing and **must be regenerated** whenever you add or change a config
(`npm run build:catalog`).

## Hard rules

- **Hebrew only.** All patient-facing text (titles, instructions, items, option labels,
  interpretation labels, alert messages) must be in Hebrew. English appears only in the
  parenthesised instrument initials of the title (e.g. `שאלון דיכאון (PHQ-9)`) and in
  subscale label parentheses.
- **License gate.** Only open-source or public-domain instruments. If the license is
  unclear or proprietary (e.g. BDI-II), stop and tell the user — do not add it.
- **Validated numbers only.** Scoring method, severity ranges, cutoffs, and alert
  thresholds must match the published, validated instrument. Never invent or "round"
  them. If a value cannot be sourced, leave the field out and say so.
- **Never rename or delete a prod config file** — the filename is the instrument's URL
  address; renaming breaks every link that references it.
- **Never commit or push without explicit user approval.**

## Step 1 — Gather inputs

Establish what the user has provided:
- The instrument (name, version, number of items).
- A source paper (PDF or citation)? If yes, read it.
- A Hebrew version of the items? If yes, treat it as authoritative text (but still
  proofread, step 4).
- The **id** — lowercase letters/digits/underscores, no hyphens, unique across all
  prod configs (`grep` the other files in `public/configs/prod/` for collisions). The
  file will be `public/configs/prod/<id>.json`. Confirm the id with the user if unclear.

## Step 2 — Psychometrics and cutoffs

If a paper was supplied, extract from it. Otherwise **search the web** (original
validation paper + widely cited follow-ups). Collect:

- Response scale (values, anchor labels) and whether any items are reverse-scored.
- Scoring method (sum / average / subscales; subscale item assignments and whether
  norms use subscale sums or means).
- Severity ranges and/or screening cutoffs, and which they are — set
  `interpretations.type` to `"severity"` or `"screening"` accordingly; put threshold
  lines in `cutoffs`.
- Reliability (Cronbach's α or test–retest) and SD from a citable source, for the
  `psychometrics` block (`reliability`, `sd`, `source`). Include the block only when all
  three are supported by the literature; otherwise omit it.
- Any item that warrants an alert (suicidality, psychosis, self-harm → `critical`;
  clinical threshold exceeded → `warning`).

Record the source (author, year) for every number you use and show these citations in
the review step.

## Step 3 — Hebrew text

1. If the user supplied Hebrew items, use them verbatim (subject to step 4 proofreading).
2. If not, **first search for a published/validated Hebrew translation** of the
   instrument. Prefer it over your own translation, and tell the user which one you used.
3. Only if none exists, translate yourself. Then:
   - Keep clinical register — plain, respectful, second person.
   - Hebrew is gendered: ask the user which convention to use (masculine default,
     both forms with slash, or gender-neutral phrasing) unless existing questionnaires
     already establish one — check a few `prod/` files and match.
   - Flag the translation as unvalidated in your review summary so the user knows the
     psychometrics were established on a different language version.

## Step 4 — Proofread

Go through **every** item and **every** option label, whether supplied or translated:
- Spelling (כתיב מלא consistently), grammar, gender agreement between item stems and
  option labels, punctuation.
- Consistency of anchors across items sharing an option set.
- For supplied text: do not silently change it — list each suggested fix as
  "current → suggested (reason)" and let the user accept or reject.

## Step 5 — Build the JSON

Follow `public/configs/LLM_GUIDE.md` exactly. One entity per file; the top-level config
`id` and the questionnaire/battery `id` both equal the filename stem. Reminders that are
frequent failure points:

- IDs: letters/digits/underscores only, no hyphens, not a reserved word, unique across
  all prod configs.
- Title convention: `שם עברי (INITIALS)` (skip the initials if the instrument isn't
  known by them).
- **`meta` block is required on real instruments** (LLM_GUIDE §"Catalog metadata") — it
  drives the composer's browsing/filtering and is never shown to patients:
  - `domains` (≥1, closed enum), `type` (screener|severity|process|worksheet|other —
    required on questionnaires, omitted on batteries), `populations` (default adult),
    `tags` (free-form), `featured` (only for common workhorse instruments — off by
    default), `durationMinutes` (only when the computed estimate would mislead).
  - **Do not invent enum values.** If the instrument needs a `domain`/`type`/`population`
    that isn't in the enum, that is a *schema change* — stop and use the `schema-change`
    skill; do not add the value ad hoc (the validator rejects it, and the enum ships in
    the app bundle → deploy-skew rules apply).
- Define one `optionSets` entry + `defaultOptionSetId` rather than repeating options.
- Binary items need explicit option labels.
- Gating items that shouldn't score → `scoring.exclude`.
- Interpretation ranges: inclusive, no gaps, no overlaps, cover the full score range.
- **Batteries** get their own file too, `questionnaires: []` + a `batteries` entry, and
  must declare `dependencies` on every `configs/prod/<id>.json` their sequence
  references (`validate:configs` errors on undeclared cross-file refs; the patient app
  auto-fetches declared dependencies).

## Step 6 — Validate and regenerate the catalog

```bash
npm run validate:configs   # schema + filename=id + one-entity-per-file + cross-file refs
npm run build:catalog      # regenerate public/composer/catalog.json (commit it too)
npm run validate:catalog   # assert the committed catalog.json is up to date
npm test                   # unit suite
```

Fix any errors before proceeding. The regenerated `catalog.json` is part of the change —
it must be committed alongside the config file, or `validate:catalog` fails in CI.

## Step 7 — Review gate (always, no exceptions)

Before any commit — even if the user supplied a perfect Hebrew version — present the
**entire questionnaire** for inspection in readable form (not raw JSON):

1. Title, description, id / filename.
2. `meta` summary: domains, type, populations, featured?, duration.
3. Full response scale(s) with values.
4. Every item, numbered, in order, with type and any reverse/exclude/conditional flags.
5. Scoring method, subscales, interpretation ranges, cutoffs, alerts, psychometrics —
   each with its literature source.
6. Open questions: unvalidated translation, unresolved proofreading suggestions,
   missing psychometric values.

Then **stop and wait**. Offer the manual test URL
(`http://localhost:5173/?items=<id>`) and invite corrections. Apply any fixes the user
requests, re-run validation + `build:catalog`, and re-show the changed parts.

## Step 8 — Commit

Only after the user explicitly approves. Config + regenerated catalog change, plain
commit message (no AI attribution), e.g.
`content: add <INSTRUMENT> (configs/prod/<id>.json)`. Stage both the new
`public/configs/prod/<id>.json` and the regenerated `public/composer/catalog.json`.
Update `docs/HANDOVER.md`'s instrument-library table if the instrument is prod-facing.
