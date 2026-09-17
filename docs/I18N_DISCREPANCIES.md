# I18N discrepancies — open questions for Elad

**Working file. Delete when the English pass is done.**

How to use: each entry has a **Question** and an empty **→ Elad:** line.
Write your answer on that line. I read this file, act on the answers, and
strike the entry through. Nothing here is acted on until you answer.

Status legend: 🔴 blocks a file · 🟡 needs a decision, not blocking · ⚪️ FYI

---

## 1. 🔴 Hebrew tags leak into English configs

`meta.tags` renders as badges in the composer's preview dialog
(`preview-dialog.js:396`), so it is clinician-facing text. But it is **not** in
the parity rule's `TEXT_KEYS` (`shared/config/translation-parity.js`), so a
translated file is *required* to carry the Hebrew tag verbatim.

This already ships: `public/configs/prod/en/ptci.json` shows an English
clinician a badge reading **גרסה מלאה**.

Affected tags — only two, across four configs:

| tag | configs |
|---|---|
| `גרסה מקוצרת` ("abbreviated version") | `pcl5_4`, `pcl5_8`, `ptci9` |
| `גרסה מלאה` ("full version") | `ptci` |

Every other tag is already language-neutral (`CPT`, `iCPT`, `PCL-5`, `PTCI`,
`screening`, `secondary trauma`, `clinicians`).

**Question.** Which fix?
  (a) add `tags` to `TEXT_KEYS` so each language carries its own — most correct, touches the parity module and its tests;
  (b) replace the two Hebrew tags with English ones in the Hebrew files too, making all tags language-neutral like the other seven — smallest change, but the Hebrew composer then shows English badges;
  (c) drop the two tags entirely — they duplicate what the title already says.

**→ Elad:** C

**Done.** Both tags removed from the Hebrew *and* English files
(`pcl5_4`, `pcl5_8`, `ptci9`, `ptci`). No Hebrew remains anywhere under `en/`.

---

## 2. 🔴 Which instruments may I transcribe?

The constraint is "existing sources, no LLM translations". For an
English-origin instrument that means reproducing the **published English
wording verbatim**, not back-translating the Hebrew. I can do that reliably
only where I am certain of the original wording.

Of the 42 untranslated configs, 6 are dev/E2E fixtures and are out of scope.
The other 36 split three ways:

**Group A — needs no recall at all (3).** Verbatim subsets of instruments
already translated in this repo; item text copied by id from the existing
English file, verified programmatically. **Done, pending your review:**
`pcl5_4`, `pcl5_8`, `ptci9`.

**Group B — English-origin, wording I can transcribe with high confidence.**
Short, very widely reproduced, freely distributed. Listed with the source I
would cite. *Not yet written — awaiting your go-ahead.*

**Group C — I should not write these from memory.** Long or less widely
reproduced instruments where I would be reconstructing rather than
transcribing, and a plausible-but-wrong clinical item is worse than no English
version. These need you to supply the source text.

**Question.** For Group B, is "transcribed from the published original, cited
in `meta.source`, flagged here for your proofread" acceptable — or do you want
to supply source text for everything, so that I only ever copy?

**→ Elad:**

### What is now done — 25 English configs

| batch | ids | basis |
|---|---|---|
| derived | `pcl5_4`, `pcl5_8`, `ptci9` | verbatim subsets, item text copied by id from `en/pcl5` and `en/ptci` |
| your sources | `oci_r`, `asi_3`, `spin`, `ecrs`, `wai6`, `oasis`, `diamond_sr` | transcribed from the files in `~/Downloads/madad measures/` |
| your paste | `dar5` | item text from the DAR you pasted (items 1, 2, 3, 4, 6) |
| CPT manual | `cpt_exploring`, `cpt_patterns`, `cpt_alternative` | HANDOUT 9.2 / 10.1 / 11.1, Resick, Monson & Chard (2024) |
| from memory | `wsas`, `top3` | Group B — please proofread these two first |

Every file was produced by a transform that walks the Hebrew config and
**requires** an English string for each text slot; a missing slot is an error,
so none can be half-translated. Each is then checked against the parity rule
and scanned for leftover Hebrew. 76/76 configs validate.

### Still outstanding — needs a source from you

`aq`, `cape15`, `cape42`, `ders`, `hai`, `isi`, `mgh_hps`, `pdss_sr`, `pqb`,
`procsi`, `roci`, `scared_child`, `scared_parent`, `scq`, `stss`,
`novaco_anger_situations`, `ocsrs_m`, `sbq`, `anger_log`.

**You sent 14 more sources — 15 instruments built from them.** Remaining gaps:

| id | what is missing |
|---|---|
| `isi` | ⚠️ the file you sent (`Insomnia Severity Index (ISI).pdf`) is a *compendium chapter about* the ISI — purpose, scoring, reliability — with no item text. Still need the form itself. |
| `pqb` | ⚠️ you sent the **PQ-16**; our config is the **PQ-B** (21 items + 21 distress ratings). Different instrument. Either send the PQ-B form, or say the word and I will re-point the config at the PQ-16 — that is a schema-level change to an instrument already in use, so it is your call. |
| `cape42` | no source yet (the CAPE-P15 came from the Capra 2013 paper you sent; the 42-item version is separate) |
| `anger_log`, `ocsrs_m`, `novaco_anger_situations` | Hebrew-origin, no English original exists — these need a translation, not a transcription |

**`clinical_intake` is now unblocked and built** — all nine questionnaires it
sequences exist in English.

`clinical_intake` still cannot be offered in English: it sequences nine
questionnaires and three are still missing — `pdss_sr`, `hai`, `mgh_hps`.
Those three are the highest-value ones to send next.

**`sapas English.pdf`** is in the folder but there is no `sapas` config in the
repo at all. New instrument to add, or did it arrive by accident?

**→ Elad:** Add SAPAS. Suggest a translation in hebrew (I think there is a skill for that)

**Done, pending your review** — see §5 below. Built through the `add-questionnaire`
skill: Hebrew canonical file plus English via `scripts/scaffold-translation.mjs`.

---

## 3. ⚪️ Instruments needing a source from you

Filled in as I reach them. Each row is an instrument I cannot transcribe
without the original in front of me.

Superseded by the Group C tables in §2 — that is the list.

---

## 4. Hebrew-vs-original content discrepancies

Found while transcribing. The English files follow **the source** in each case;
where that makes the two languages differ in substance it is marked 🔴, because
the same instrument would then measure different things in Hebrew and English.

### 🔴 4.1 OCI-R asks about a different time window

Source: *"…has DISTRESSED or BOTHERED you during the **PAST MONTH**."*
Hebrew: *"…במשך **השבוע האחרון**"* (the past week), and the config description
says the same.

The English file says "past month". The published cutoff of 21 is calibrated on
the month version. **Which one wins?** My read is that the Hebrew should be
corrected to "past month", but that changes an instrument already in use.

**→ Elad:** past week wins.

**Done.** `en/oci_r` now says "past week" in both the instruction and the description,
and `meta.source` records that the time frame follows the Hebrew file while the published
form asks about the past month — so the deviation travels with the file.

### 🔴 4.2 ASI-3 has a time window the original does not have

The ASI-3 is a trait measure — the source instruction carries **no** time
frame. The Hebrew adds *"בהתייחס לשבוע האחרון"* (with reference to the past
week) and the description repeats it. The English follows the source and has no
time frame.

**→ Elad:** past week wins for ASI-3 too

**Done.** `en/asi_3` now carries "with reference to the past week" in the instruction
and "over the past week" in the description, matching the Hebrew. `meta.source` records
that the time frame follows the Hebrew file while the published ASI-3 is a trait measure
with no time frame — same treatment as the OCI-R.

### 🔴 4.3 ECR-S has been genericised away from romantic partners

Every source item names a romantic partner; the Hebrew replaces this with
people in general. Item 1: *"It helps to turn to **my romantic partner** in
times of need"* → *"זה עוזר לפנות **לאנשים אחרים** ברגעים של צורך"* ("to other
people"). The same substitution runs through all 12 items, and items 2, 5, 9
lose the partner referent entirely.

This matters because the ECR-S measures *romantic* attachment; the two
subscales are validated on that referent. The English follows the source.

Separately: the Hebrew ECR-S is written in the **feminine voice only**
("אני נזקקת", "אני מודאגת"), where every other config uses the "חש/ה" form.

**→ Elad:** use the reworded version (from hebrew) but add a note in the descripion saying that's what we did. fix the hebrew version to be m/f

**Done.** English now follows the Hebrew's generalised referent ("other people", not
"my romantic partner"), with this note in the description: *"this version generalises the
original's romantic-partner referent to close relationships in general, following the
Hebrew file — scores are therefore not directly comparable with published ECR-S norms."*
The Hebrew is now m/f throughout (`אני נזקק/ת`, `אני מודאג/ת`, `אני נעשה/ית מתוח/ה`…).

### 🔴 4.4 DIAMOND item 29 drops four of the source's eleven examples

The source lists eleven example beliefs (a–k). The Hebrew flattens them into
one sentence and omits: *"that there was something very strange going on with
my body"*, *"that a partner was being unfaithful to me"*, *"or that the world
did not exist, or that the world was ending"* (only "that I did not exist"
survives), and *"and needed to be punished"*. Item 29 drives the
psychotic-experiences alert, so the Hebrew screens a narrower set. The English
carries all eleven.

**→ Elad:** Use the english version. translate missing items to hebrew.

**Done.** Hebrew q29 now carries all eleven examples — the four that were missing are
`שמשהו מוזר מאוד קורה בגופי`, `שמישהו או משהו שולט בתנועות ובפעולות שלי`,
`שהעולם אינו קיים או שהעולם עומד להיגמר`, `שבן/בת הזוג שלי בגד/ה בי`, plus
`ושיש להעניש אותי` on the last clause.

### 🟡 4.5 Anchor wording differs from source in four instruments

| instrument | source anchors | Hebrew |
|---|---|---|
| `wsas` | labels at 0, 2, 4, 6, 8 — Not at all / Slightly / Definitely / Markedly / Very severely | labels at 0, 4, 8 only — "ללא פגיעה" / "פגיעה בינונית" / "פגיעה חמורה מאוד" |
| `wai6` | all six labelled — Not at all → Completely | only 0 and 5 labelled; 1–4 are bare digits |
| `dar5` | intensity — not at all / a little / moderately so / fairly so / very much | frequency — "לעולם או כמעט לעולם לא" → "תמיד או כמעט תמיד" |
| `oasis` | bare — Never / Rarely / Occasionally / Frequently / Constantly | each anchor elaborated with a descriptive clause |



**→ Elad:** for the first three go with the english source and translate to hebrew. For oasis I added a new pdf in the folder with the full text (as in hebrew)

**I was wrong about `dar5` — correction.** The DAR-5's own anchors are *frequency*
("1 = none or almost none of the time" → "5 = all or almost all of the time"), so the
Hebrew was right all along and there was nothing to fix. The intensity anchors in this
table are the DAR-II's, from the form you pasted. The English file has been corrected to
frequency anchors; the Hebrew is untouched. See §4.7.

**Done for the other three.**
- `wsas` — Hebrew now labels the source's five points: `0 — ללא פגיעה כלל`,
  `2 — פגיעה קלה`, `4 — פגיעה ברורה`, `6 — פגיעה ניכרת`, `8 — פגיעה חמורה מאוד`.
- `wai6` — Hebrew now labels all six: `כלל לא`, `במידה מועטה`, `במידה בינונית`,
  `במידה רבה למדי`, `במידה רבה מאוד`, `לחלוטין`.
- `oasis` — the file you added was a saved OSF *viewer* page with no PDF in it, so I
  pulled the document itself from `osf.io/download/rhbx7/`. It is the Unified Protocol
  printing with the full descriptive anchors, and the Hebrew is a faithful condensation
  of it. English rebuilt from it at the Hebrew's level of detail; no Hebrew change needed.

### 🟡 4.6 CPT Exploring Questions has an extra question

HANDOUT 9.2 has seven questions. The Hebrew has eight — the extra first one is
*"למה את/ה מתכוון/ת?"* ("What do you mean? Write it clearly enough that a
stranger would understand"). I kept it and rendered it in English, following
the `cpt_abc` precedent of Madad-authored prompts, but it is not in the manual.

**→ Elad:** Nice

### 🟡 4.7 The DAR you pasted is a different instrument from the config

You pasted the **DAR-II**: 7 items on a **0–4** scale. The config is the
**DAR-5**: 5 items on **1–5**, cutoff 12. The five Hebrew items map exactly
onto DAR items 1, 2, 3, 4 and 6, so I transcribed those five verbatim and left
the 1–5 values alone — which is correct for Forbes et al. Flagging only so you
know I did not use items 5 and 7.


**→ Elad:** I want ONLY dar-5 not what I pasted. If you can't find the text online, give me the url and I'll get it for you.

**Found it, no URL needed.** The five DAR-5 items are reproduced verbatim in Table 2 of
Grossman et al. (2024), PMC10844994 — and they are *past tense*, which is what the
Hebrew already had:

> 1. I found myself getting angry at people or situations
> 2. When I got angry, I got really mad
> 3. When I got angry, I stayed angry
> 4. When I got angry at someone, I wanted to hit them
> 5. My anger prevented me from getting along with people as well as I'd have liked to

`en/dar5` now carries these plus the DAR-5's frequency anchors and the four-week frame.
Nothing of the DAR-II you pasted survives in the file.

### ⚪️ 4.8 Licensing, for your judgement not mine

Three of the new files carry text with explicit restrictions printed on the
source: **SPIN** ("permission… to reproduce up to 10 copies for personal use
only"), **DIAMOND** (© 2022 Institute of Living/Hartford HealthCare), and the
**CPT worksheets** ("permission to photocopy… granted to purchasers of this
book for personal use or use with clients"). The Hebrew versions already ship,
so this is your existing posture rather than something new — but the English
files now carry the copyright line in `meta.source`, where a reader will see
it.

**→ Elad:** Don't have the copyright explicitly in the repository. I allowed these specifically because I know I have permission.

**Done.** Every `©` line and permission sentence removed from `meta.source` in
`en/spin`, `en/diamond_sr` and the three `en/cpt_*` files. What remains is a plain
scholarly citation — author, year, journal or book, and which handout the text came from.

### Checked and clean

- **Item counts.** Every config's stated item count matches its actual
  answerable items, across all 45 non-dev configs, including items nested in
  `if` branches. No drift.
- **Short forms.** `pcl5_4`, `pcl5_8` and `ptci9` quote their parents verbatim
  in Hebrew — all 24 shared items byte-identical, option sets identical.
- **Scoring.** `dar5` 1–5 with cutoff 12, `oci_r` cutoff 21, `spin` cutoff,
  `oasis` cutoff 8, `wsas` 0–40 bands — all match their published conventions.
- **Residual Hebrew.** Only the four `tags` entries in §1; every other string
  in all 25 English configs is English.

---

## 5. SAPAS — review gate (skill step 7)

New instrument, not yet approved. `public/configs/prod/sapas.json` + `en/sapas.json`.

**Title** `הערכת אישיות מקוצרת (SAPAS)` / Standardised Assessment of Personality —
Abbreviated Scale · **id/filename** `sapas` · **meta** domains `intake`, type
`screener`, populations `adult`, not featured · **scale** כן=1 / לא=0.


| # | item (Hebrew) | |
|---|---|---|
| 1 | באופן כללי, האם קשה לך ליצור חברויות ולשמור עליהן? | |
| 2 | האם בדרך כלל היית מתאר/ת את עצמך כמתבודד/ת? | |
| 3 | באופן כללי, האם את/ה נותן/ת אמון באנשים אחרים? | **reverse** |
| 4 | האם את/ה נוטה בדרך כלל לאבד את העשתונות בקלות? | | {{האם את/ה אדם עצבני }}
| 5 | האם את/ה בדרך כלל אדם אימפולסיבי/ת? | | {{בלי אדם}}
| 6 | האם את/ה בדרך כלל אדם דאגן/ית? | | {{בלי אדם}}
| 7 | באופן כללי, האם את/ה תלוי/ה באחרים במידה רבה? | |
| 8 | באופן כללי, האם את/ה פרפקציוניסט/ית? | |


**Scoring** sum, 0–8. Ranges 0–2 `מתחת לסף הסינון`, 3–8
`מעל סף הסינון — סבירות להפרעת אישיות`; cutoff 3; warning alert at ≥ 3.
Source: Moran et al. (2003), Br J Psychiatry 183:228–232 — sensitivity 0.94,
specificity 0.85. No `psychometrics` block: Moran does not report α and SD for a
deliberately heterogeneous screener, and the skill says omit rather than invent.

Four things to decide:

1. **The Hebrew is mine and unvalidated.** No published Hebrew SAPAS exists (I searched).
   The psychometrics above were established on the English.
2. **`domains: ["intake"]`** — the enum has no `personality`. I followed `diamond_sr`,
   which is the other broad intake screener. Adding `personality` would be a schema
   change, so I did not.
3. **Interview form, self-report use.** Your PDF is the clinician-administered SAPAS
   ("Please ask your patients…"). Madad is self-report, so I rendered the instruction as
   self-report. The cutoff of 3 is validated on the *interview*; the self-administered
   variant (SA-SAPAS) has its own validation. Worth a line in the description if you
   want to be strict.
4. **Two wordings I am least sure of**: item 4 `לאבד את העשתונות` for "lose your temper",
   and item 6 `אדם דאגן/ית` for "a worrier" — the latter is a touch literary. Alternative:
   `האם את/ה נוטה בדרך כלל לדאוג הרבה?`

Test it: `http://localhost:5173/?items=sapas`

**→ Elad:**

---

## 6. Still open

Nothing in §1–§4. The only thing waiting is the **SAPAS review gate in §5**, and the
instrument sources listed in §2.

---

## 7. From the second batch of sources

### ✅ Corrections to things I said earlier

- **SBQ.** I previously flagged "30 items where the published SBQ has 28". Wrong:
  the config has an intro plus **29** items, and the form you sent has exactly 29.
  No discrepancy.
- **"DERS-16".** The file named `…DERS-16_form.pdf` actually contains the full
  **DERS-36**. All 36 items matched the config. Filename only.

### 🟡 7.1 SCARED parent — one item the PDF cannot encode

Item 39 of `SCAREDParentVersion_1.19.18_0.pdf` extracts as
`0\FKLOG feelV nervous when KHVKHLV with other children…` — a font-encoding
failure in that one row. I reconstructed it from the child form with the person
swapped, and the Hebrew parent file confirms the reading:

> My child feels nervous when he/she is with other children or adults and he/she
> has to do something while they watch him/her (for example: read aloud, speak,
> play a game, play a sport).

Worth an eyeball; every other row in both SCARED forms extracted cleanly.

**→ Elad:**

### 🟡 7.2 HAI item stems are Madad's, not the instrument's

The HAI-18 form has no item stems — each question is just a numbered group of
four statements. The Hebrew file added a short topic label per item so the app
has something to display. The English mirrors that, with the four **response
statements transcribed verbatim** from your form. So the item text is ours and
the answer options are the instrument's. Recorded in `meta.source`.

The time frame matches: both say the past six months.

**→ Elad:**

### ⚪️ 7.3 CAPE-P15 citation year

The Hebrew `psychometrics.source` says "Capra et al. 2017"; the paper you sent
is Capra, Kavanagh, Hides & Scott (**2013**), from which I took the items. If
the reliability and SD came from the 2017 paper that is fine as it stands —
just noting the two are different papers.

**→ Elad:**

### ⚪️ 7.4 The validator does not catch unfilled scaffolds

`scripts/scaffold-translation.mjs` writes `"TODO: <hebrew>"` placeholders, but
`npm run validate:configs` passes a file that still contains them — I hit this
on `clinical_intake` and only caught it by grepping. A one-line check in the
validator would close it. Not doing that unasked, since it is a schema-adjacent
change.

**→ Elad:**
