# Contributing a New Instrument

## The quickest path — use an LLM

1. **Open `LLM_GUIDE.md`** in this folder and paste its entire contents into Claude or ChatGPT.

2. **Describe the instrument** you want to add, for example:
   > "Create a Madad instrument for the Beck Anxiety Inventory (BAI). It has 21 items, each rated 0–3, with a total score and these severity ranges: 0–7 minimal, 8–15 mild, 16–25 moderate, 26–63 severe."

3. **Refine with follow-ups** — add the exact Hebrew item text, adjust scoring ranges, add alerts, etc.

4. **Save the JSON output** as its own file: `public/configs/prod/YOUR_ID.json` (see "One file per instrument" below).

5. **Validate and regenerate the catalog:**
   ```bash
   npm run validate:configs
   npm run build:catalog
   ```
   Fix any errors reported. The messages are descriptive — share them with the LLM and ask it to fix them. Commit the regenerated `public/composer/catalog.json` together with your config.

6. **Test manually** at:
   ```
   http://localhost:5173/?items=YOUR_ID
   ```

7. **Open a pull request** with the new config file and the regenerated catalog.

For the full manual field reference, see `docs/CONFIG_SCHEMA_SPEC.md`. `LLM_GUIDE.md` and `CONFIG_SCHEMA_SPEC.md` cover the same ground — `LLM_GUIDE.md` is example-heavy and optimised for LLM use, `CONFIG_SCHEMA_SPEC.md` is the formal reference.

---

## One file per instrument

Every questionnaire or battery is its own file in `public/configs/prod/`, and
the **filename must equal the entity's id** (`validate:configs` enforces this):

```json
// public/configs/prod/bai.json
{
  "id": "bai",
  "version": "1.0.0",
  "questionnaires": [ { "id": "bai", "title": "…", "meta": { … }, "items": [ … ] } ]
}
```

Item IDs are URL addresses: `?items=bai` makes the patient app fetch
`configs/prod/bai.json`. There is no manifest to register: the catalog build
script scans the directory.

**Batteries** get their own file too, and must declare a dependency on every
questionnaire file their sequence references (the patient app auto-fetches
declared dependencies at runtime; `validate:configs` errors on undeclared
cross-file references):

```json
// public/configs/prod/my_battery.json
{
  "id": "my_battery",
  "version": "1.0.0",
  "questionnaires": [],
  "batteries": [ { "id": "my_battery", "title": "…", "sequence": [ … ] } ],
  "dependencies": ["configs/prod/phq9.json", "configs/prod/gad7.json"]
}
```

**Test fixtures:** files used only by the E2E suite carry `"dev": true` at
the config top level — they never appear in the production composer. They
follow the same one-entity-per-file rule.

**Never rename or delete a prod config file** — the filename is the
instrument's URL address; renaming breaks every link that references it.

---

## Rules

- **Unique ID** — lowercase letters, digits, underscores only. `phq9` not `phq-9`. Must be unique across all loaded configs.
- **Title naming convention** — Hebrew name followed by the instrument's initials in parentheses, e.g. `שאלון דיכאון (PHQ-9)`. Use this when the instrument is commonly known by its initials. Skip the initials if the instrument isn't known by them (e.g. `שלושת הבעיות המרכזיות`).
- **Hebrew item text** — the platform language is Hebrew.
- **Validated scoring** — ranges and alert thresholds must match the published, validated version. Do not adjust them.
- **Open-source instruments only** — do not add proprietary instruments (e.g. BDI-II) without verifying the license.
- **Binary items** — require explicit option labels. Either inline `options: [{"label": "כן", "value": 1}, {"label": "לא", "value": 0}]` on the item, or set `defaultOptionSetId` on the questionnaire with a matching entry in `optionSets`. There is no built-in fallback.
- **Gating items** — if an item should be answered but not scored (e.g. a trauma exposure question), use `"scoring": { "method": "sum", "exclude": ["item_id"] }`.

---

## Schema changes and deploy skew

The config schema ships **inside the app's JS bundle**, while the config JSONs are
**fetched at runtime** — so after a deploy, a user's browser can hold one from the new
deploy and one from the old (HTTP caches, open tabs). The runtime defends itself two
ways: config fetches use `cache: 'no-cache'` (revalidate via ETag), and the browser-side
validator treats *unknown properties* as warnings, not errors (CI stays strict — see
`scripts/validate-configs.mjs`).

That tolerance only covers **adding or removing optional fields**. Changes it can't
absorb — renaming a field, changing an enum's values, making a field required — need
**two deploys**:

1. First ship configs that are valid under *both* the old and new schema.
2. After deploy 1 is live and the skew window has passed, ship the schema change.
   Cloudflare Pages deploys are atomic at the edge, but browsers hold the old bundle
   (HTTP cache, open tabs) until reload — allow several minutes and prefer quiet hours.

Shipping both at once caused a production outage on 2026-07-14: `maxPerItem` was removed
from configs and rejected by the schema in the same deploy, and for the cache window every
composer load validated stale cached configs against the new strict schema and failed.

---

## Questions

Contact [elad.zlotnick@mail.huji.ac.il](mailto:elad.zlotnick@mail.huji.ac.il).
