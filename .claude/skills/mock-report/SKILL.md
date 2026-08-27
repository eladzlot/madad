---
name: mock-report
description: Generate mock Madad report PDFs for slides, walkthroughs, and Aggregate demos from a described symptom profile. Use whenever the user asks for demo/mock/example patient reports, "a patient with X", a set of profiles for slides, or test PDFs (e.g. "make me five sessions of a remitting depression", "צור דוחות לדוגמה").
---

# Generating mock reports

The user wants report PDFs for a described patient. Your job is to turn a clinical
description into item-level answers, run the generator, and confirm the result
matches what was asked for.

Read `demo/README.md` first — it is the grammar reference. This skill is the workflow.

## 1. Pin down the profile

Before writing JSON, make sure you know:

- **which instruments** — if the user named a symptom domain rather than an
  instrument, pick from `docs/HANDOVER.md` §3 "Instrument library" and say which
  you chose and why.
- **how many sessions, and the dates** — a single report, or a trajectory? Default
  to weekly spacing if they said "five sessions" without dates.
- **the shape of the change** — remitting, stable, deteriorating, or a specific
  score at each point.
- **whether any alert should fire** — PHQ-9 suicidality is the common one. This is
  a clinical detail worth asking about if the reports are going in front of an
  audience; do not make a patient suicidal on a slide by accident, and do not
  silently drop the alert if the described severity implies it.

Ask only if a wrong guess would waste the run. Otherwise choose, and say what you chose.

## 2. Write item-level answers, not target totals

**Always use the explicit `{ "answers": … }` form.** The `"phq9": 18` form exists
for chart fixtures; it fills items greedily (`3,3,3,3,3,3,0,0,0`) and looks fake in
the PDF's response table, which is exactly what a slide shows.

Get the item ids and legal values with:

```bash
npm run demo -- --describe <instrument>
```

Then write answers that are **clinically coherent**, not arbitrary numbers that sum
to a target:

- Endorse the symptoms the described presentation would actually endorse. A patient
  with melancholic depression loads sleep, appetite, anhedonia and psychomotor
  items; an anxious presentation loads different ones.
- Keep the pattern consistent across sessions in a trajectory. Improvement should
  show up as the same items declining, not a different random spread each week —
  a clinician reading two reports side by side will notice.
- Respect items in `scoring.exclude` (marked by `--describe`): they still need an
  answer, they just don't count toward the total.
- Add `"total": N` when the user gave you a target score, so the run fails loudly
  if your answers don't add up.

## 3. Run it

Scenario files go in `demo/scenarios/`, output in `demo/out/`. Both are gitignored —
**never commit either, and never move mock reports elsewhere in the repo.**

```bash
npm run demo -- demo/scenarios/<name>.json          # PDFs only
npm run demo:shots -- demo/scenarios/<name>.json    # PDFs + Aggregate images
```

Use `demo:shots` whenever the user wants **slides** — it renders each instrument's
chart and item heatmap as PNGs into `demo/out/<patient>/images/`. It regenerates
the PDFs itself, so never run both. `--views chart` limits it; `--pid` stamps the
identifier on chart exports (off by default — ask before turning it on).

Several patients in one file (each into its own subdirectory) is the right shape for
a slide set — see `demo/README.md` §"Several patients in one file".

## 4. Check the summary before handing it over

Every PDF prints its total, category, subscales and fired alerts:

```
✓ report-DEMO-A-2026-06-05.pdf
    phq9: 18 (בינוני-חמור) ⚠ suicidality/critical
```

Read those lines against what the user asked for and **report them back**. If the
category or alerts don't match the described severity, fix the answers — don't
explain the mismatch away. The user is putting these on a slide; a report labelled
"moderate" when they asked for "severe" is a wasted slide.

## Two things that bite on slides

**Past 12 sessions the item heatmap goes compact** — no in-cell numbers, just
colour chips. If the user wants the item map readable, keep the session count at
or below 12, or tell them why it changed.

**Greedy-filled scenarios are visibly fake in the heatmap.** The front-loading
renders as a clean diagonal staircase. This is the concrete reason step 2 insists
on explicit answers; if you see that staircase in a generated image, the scenario
used target totals somewhere.

## Scope limits

`select` and `binary` items only. These are rejected by name, not silently
mis-scored — if the user asks for one, say so and offer an alternative instrument:

- branching instruments: `cape42`, `pqb`, `ocsrs_m`, `top3`
- scored slider / rated_text: the CPT worksheets, `anger_log`
- multiselect: `pdss_sr`
- batteries: `clinical_intake`, `trauma_eval`

Extending coverage means extending `scripts/lib/mock-report.js` (and its tests) —
a real change, not a workaround to improvise around mid-task.
