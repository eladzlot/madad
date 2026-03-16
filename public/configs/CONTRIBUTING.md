# Contributing a New Instrument

## The process

1. **Open `LLM_GUIDE.md`** in this folder and paste its entire contents into ChatGPT, Claude, or any capable LLM.

2. **Tell the LLM what instrument you want to add.** For example:
   > "Create a Madad instrument for the Beck Anxiety Inventory (BAI). It has 21 items, each rated 0–3, with a total score and these severity ranges: 0–7 minimal, 8–15 mild, 16–25 moderate, 26–63 severe."

3. **Refine with follow-up instructions** — add the exact Hebrew item text, adjust scoring ranges, add alerts, etc.

4. **Copy the JSON output** into `public/configs/prod/standard.json`, inside the `questionnaires` array.

5. **Validate:**
   ```bash
   npm run validate:configs
   ```
   Fix any errors reported. The error messages are descriptive — share them with the LLM and ask it to fix them.

6. **Test manually** by opening the dev server and navigating to:
   ```
   http://localhost:5173/?configs=configs/prod/standard.json&items=YOUR_ID
   ```

7. **Open a pull request** with only `standard.json` changed.

---

## Rules

- Each instrument needs a **unique ID** — lowercase letters and digits only, no hyphens. `phq9` not `phq-9`.
- Item text must be in **Hebrew** (the platform language).
- Scoring ranges and alert thresholds must match the **published, validated version** of the instrument. Do not adjust them.
- If you're adding a battery (a sequence of instruments), describe it to the LLM in the same conversation.

## Questions

Contact [elad.zlotnick@mail.huji.ac.il](mailto:elad.zlotnick@mail.huji.ac.il).
