# Instrument Library

> For instructions on **adding a new instrument**, see [`public/configs/CONTRIBUTING.md`](../public/configs/CONTRIBUTING.md).
> For the full config JSON reference, see [`docs/CONFIG_SCHEMA_SPEC.md`](CONFIG_SCHEMA_SPEC.md).
> For LLM-assisted authoring, see [`public/configs/LLM_GUIDE.md`](../public/configs/LLM_GUIDE.md).

---

## Where the library is listed

This file no longer duplicates the instrument list — that duplication is
what made it go stale. The current library lives in two places, both of
which are kept in step with the configs:

- **[`docs/HANDOVER.md`](HANDOVER.md) §3 "Instrument library"** — the
  human-readable table: ID, Hebrew name, subscales, alerts, cutoffs,
  provenance caveats.
- **`public/composer/catalog.json`** — the generated index the Composer
  reads. Regenerate with `npm run build:catalog`; CI fails on drift via
  `npm run validate:catalog`.

The configs themselves are the source of truth: one questionnaire or
battery per file at `public/configs/prod/<id>.json`, filename = entity id.

---

## Policy

- **Free for non-commercial use only.** Public-domain, open-license, or
  copyrighted-but-free-to-use instruments (e.g. STSS, © Brian E. Bride).
  Do not add proprietary instruments that require a paid license or
  restrict reproduction (e.g. BDI-II, commercial STAI editions).
- **Scoring must match validated published versions.** Do not adjust
  thresholds or ranges. Where a Hebrew translation is unvalidated or a
  cutoff does not exist, say so in the config's provenance notes rather
  than inventing one.
- **Hebrew item text.** The platform language is Hebrew — all item text
  must be in Hebrew.
- **Each instrument needs a unique ID** — lowercase letters, digits and
  underscores only (`phq9`, not `phq-9`). The ID is the filename, the URL
  token, and the key in every PDF ever generated: it is a permanent
  external contract. Never rename or delete one.
