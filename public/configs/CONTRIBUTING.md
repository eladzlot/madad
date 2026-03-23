# Contributing a New Instrument

## The quickest path — use an LLM

1. **Open `LLM_GUIDE.md`** in this folder and paste its entire contents into Claude or ChatGPT.

2. **Describe the instrument** you want to add, for example:
   > "Create a Madad instrument for the Beck Anxiety Inventory (BAI). It has 21 items, each rated 0–3, with a total score and these severity ranges: 0–7 minimal, 8–15 mild, 16–25 moderate, 26–63 severe."

3. **Refine with follow-ups** — add the exact Hebrew item text, adjust scoring ranges, add alerts, etc.

4. **Copy the JSON output** into the appropriate config file (see "Which file?" below).

5. **Validate:**
   ```bash
   npm run validate:configs
   ```
   Fix any errors reported. The messages are descriptive — share them with the LLM and ask it to fix them.

6. **Test manually** at:
   ```
   http://localhost:5173/?configs=configs/prod/standard.json&items=YOUR_ID
   ```
   Replace `standard.json` with whichever file you added to.

7. **Open a pull request** with only the config file(s) changed.

For the full manual field reference, see `docs/CONFIG_SCHEMA_SPEC.md`. `LLM_GUIDE.md` and `CONFIG_SCHEMA_SPEC.md` cover the same ground — `LLM_GUIDE.md` is example-heavy and optimised for LLM use, `CONFIG_SCHEMA_SPEC.md` is the formal reference.

---

## Which file?

| What you're adding | File |
|---|---|
| General clinical scale (depression, anxiety, OCD, etc.) | `prod/standard.json` |
| Trauma-related instrument | `prod/trauma.json` |
| Intake / screening instrument | `prod/intake.json` |
| New clinical domain requiring its own config | Create a new file — see "Adding a new config file" below |

---

## Adding a new config file

If no existing file fits your instrument:

1. Create `public/configs/prod/yourname.json` with the standard structure:
   ```json
   {
     "id": "yourname",
     "version": "1.0.0",
     "questionnaires": [],
     "batteries": []
   }
   ```

2. Add it to the Composer manifest at `public/composer/configs.json`:
   ```json
   { "name": "Your config display name", "url": "/configs/prod/yourname.json" }
   ```

3. If this config uses instruments from another config, declare the dependency:
   ```json
   { "dependencies": ["configs/prod/standard.json"] }
   ```
   The Composer will include the dependency automatically in generated URLs.

---

## Rules

- **Unique ID** — lowercase letters, digits, underscores only. `phq9` not `phq-9`. Must be unique across all loaded configs.
- **Hebrew item text** — the platform language is Hebrew.
- **Validated scoring** — ranges and alert thresholds must match the published, validated version. Do not adjust them.
- **Open-source instruments only** — do not add proprietary instruments (e.g. BDI-II) without verifying the license.
- **Binary items** — don't need options; the platform provides default כן/לא labels.
- **Gating items** — if an item should be answered but not scored (e.g. a trauma exposure question), use `"scoring": { "method": "sum", "exclude": ["item_id"] }`.

---

## Questions

Contact [elad.zlotnick@mail.huji.ac.il](mailto:elad.zlotnick@mail.huji.ac.il).
