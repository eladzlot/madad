# Demo reports

Mock Madad PDFs for slides, walkthroughs, and Aggregate demos — generated from
a scenario file, scored by the real engine, byte-faithful to a patient-produced
report.

Nothing in here is committed except this file. `demo/scenarios/` and
`demo/out/` are gitignored: mock patient material has no place in git.

```bash
npm run demo -- demo/scenarios/my-profile.json   # → demo/out/
npm run demo -- --describe phq9                  # item ids + legal values
```

## Scenario grammar

```jsonc
{
  "pid": "DEMO-A",              // shown on the report, used in the filename
  "name": "מטופלת א׳",           // optional; omit or null for an anonymous report
  "sessions": [
    {
      "date": "2026-06-05",     // YYYY-MM-DD — the report date
      "instruments": {
        "phq9": { "answers": { "1": 3, "2": 3, "3": 2, "4": 3,
                               "5": 1, "6": 2, "7": 2, "8": 1, "9": 1 } },
        "gad7": 12
      }
    }
  ]
}
```

Each instrument takes one of two forms.

**Explicit answers — use this when the symptom profile matters.**

```jsonc
"phq9": { "answers": { "1": 3, "2": 3, … , "9": 1 } }
```

Every scored item must be answered with a legal option value. The engine scores
what you wrote, so the totals, subscales, category and alerts in the PDF are
genuine — there is no solver in between to be wrong about. Add `"total": 18` to
assert what the answers should score; the run fails if they don't.

This is the form to use for anything a clinician will look at, because you
control the *shape* of the response: which symptoms are endorsed, whether the
PHQ-9 suicidality item fires, whether a DASS-21 profile is depression-loaded or
anxiety-loaded.

**Target total — a quick trajectory point.**

```jsonc
"phq9": 18
```

Answers are derived by a greedy fill: items are maxed in order until the target
is reached, then left at zero. Fine for Aggregate chart demos, wrong for a slide
that shows the PDF's response table — `3,3,3,3,3,3,0,0,0` is visibly synthetic.
The fill also ignores reverse-scored items; when it can't hit the target the run
fails and tells you to use the explicit form.

## Several patients in one file

Wrap them, and each writes into its own subdirectory of `demo/out/`:

```jsonc
{
  "patients": [
    { "pid": "DEMO-A", "out": "depression-remitting", "sessions": [ … ] },
    { "pid": "DEMO-B", "out": "trauma-stable",        "sessions": [ … ] }
  ]
}
```

`out` names the subdirectory; it falls back to the pid. A bare JSON array works
too. A single patient writes straight into `demo/out/`.

## Authoring answers

`--describe` prints every item id, its prompt, and its legal values, so answers
can be written without opening the config:

```
$ npm run demo -- --describe phq9

phq9 — שאלון דיכאון (PHQ-9)
9 scored items

  "1"  מיעוט עניין או הנאה מעשיית דברים
      0=כלל לא  1=מספר ימים  2=ביותר ממחצית הימים  3=כמעט כל יום
  …
```

Items in the instrument's `scoring.exclude` are marked `(excluded from total)` —
they still need an answer (they appear in the PDF), they just don't count toward
the score. `pc_ptsd5`'s `exposure` gate is the example.

## What the run tells you

Each PDF is re-parsed with the Aggregate's own parser and its embedded envelope
checked against what the engine scored, then summarised:

```
✓ report-DEMO-A-2026-06-05.pdf
    phq9: 18 (בינוני-חמור) ⚠ suicidality/critical
    gad7: 12 (בינוני)
```

Read those lines before building the slide — they are the confirmation that the
profile you got is the profile you asked for.

## Scope

`select` and `binary` items only. Instruments with `if`/`randomize` branching
(`cape42`, `pqb`, `ocsrs_m`, `top3`), scored `slider`/`rated_text` items
(worksheets), `multiselect` items (`pdss_sr`), and batteries (`clinical_intake`,
`trauma_eval`) are rejected by name rather than silently mis-scored. Extending
to those means extending `scripts/lib/mock-report.js`.

The generator itself is `scripts/generate-test-pdfs.mjs`; the scenario logic and
its tests live in `scripts/lib/mock-report.js` and `mock-report.test.js`.
