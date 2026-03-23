# Instrument Library

> For instructions on **adding a new instrument**, see [`public/configs/CONTRIBUTING.md`](../public/configs/CONTRIBUTING.md).
> For the full config JSON reference, see [`docs/CONFIG_SCHEMA_SPEC.md`](CONFIG_SCHEMA_SPEC.md).
> For LLM-assisted authoring, see [`public/configs/LLM_GUIDE.md`](../public/configs/LLM_GUIDE.md).

---

## Current library

### `standard.json` (v1.6.1) — 14 instruments

| ID | Hebrew name | Subscales | Alerts |
|---|---|---|---|
| `phq9` | שאלון דיכאון (PHQ-9) | — | Suicidality (item 9 ≥ 1) |
| `gad7` | שאלון חרדה (GAD-7) | — | — |
| `oci_r` | שאלון טורדנות כפייתית (OCI-R) | שטיפה, אובססיות, אגירה, סדר, בדיקה, נטרול | — |
| `pdss_sr` | שאלון פאניקה (PDSS-SR) | — | — |
| `asi_3` | שאלון רגישות לחרדה (ASI-3) | — | — |
| `hai` | שאלון חרדת בריאות (HAI) | — | — |
| `mgh_hps` | סולם תלישת שיער MGH (MGH-HPS) | — | — |
| `spin` | שאלון פוביה חברתית (SPIN) | — | — |
| `isi` | מדד חומרת נדודי שינה (ISI) | — | — |
| `dar5` | שאלון תגובות כעס (DAR-5) | — | — |
| `oasis` | שאלון חומרת חרדה ופגיעה תפקודית (OASIS) | — | — |
| `wsas` | סולם עבודה והתאמה חברתית (WSAS) | — | — |
| `wai6` | שאלון ברית טיפולית (WAI-6) | — | — |
| `top3` | שלושת הבעיות המרכזיות | — | — |

### `trauma.json` (v1.0.0) — 3 instruments + 1 battery

| ID | Type | Hebrew name | Notes |
|---|---|---|---|
| `pc_ptsd5` | questionnaire | סקר טראומה קצר (PC-PTSD-5) | Binary screener; `exposure` item excluded from scoring |
| `pcl5` | questionnaire | שאלון פוסט טראומה (PCL-5) | 4 subscales (mean); alert at total ≥ 33 |
| `ptci` | questionnaire | שאלון קוגניציות פוסט-טראומטיות (PTCI) | 3 subscales (mean) |
| `trauma_eval` | battery | הערכת טראומה ראשונית | PC-PTSD-5 → if score ≥ 4: PCL-5 + PTCI |

### `intake.json` (v1.2.1) — 2 instruments + 1 battery

| ID | Type | Hebrew name | Notes |
|---|---|---|---|
| `demographics` | questionnaire | פרטים אישיים | — |
| `diamond_sr` | questionnaire | DIAMOND Self Report Screener | Conditional branching; multiple alerts |
| `clinical_intake` | battery | הערכה ראשונית | DIAMOND → targeted questionnaires per domain |

---

## Policy

- **Open-source instruments only.** Do not add proprietary instruments (e.g. BDI-II, STAI commercial editions) without verifying the license.
- **Scoring must match validated published versions.** Do not adjust thresholds or ranges.
- **Hebrew item text.** The platform language is Hebrew — all item text must be in Hebrew.
- **Each instrument needs a unique ID** — lowercase letters, digits, underscores only (`phq9` not `phq-9`). IDs must be unique across all loaded config files.
