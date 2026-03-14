# Clinical Assessment App — Behavioral Specification
**Version:** 1.1  
**Status:** Draft  

---

## 1. Purpose and Scope

This document describes the behavior of the Clinical Assessment App from the perspective of its users — the clinician and the patient. It covers the full lifecycle of a clinical assessment session: from link generation through questionnaire completion to PDF delivery. It does not describe implementation details or technology choices.

---

## 2. Users

**Clinician** — a licensed mental health professional who configures and sends assessments and receives completed results. The system is designed for use by any clinician or practice; it is not specific to a single user.

**Patient** — a client of the clinician who completes the assessment on their own device, prior to or during a clinical appointment.

---

## 3. System Overview

The app is a static web application. No data is stored on any server at any point during a session. All processing occurs in the patient's browser. The PDF is the sole output of a session and the mechanism by which results are transferred from patient to clinician.

Once the PDF is downloaded by the patient and shared with the clinician, it is the clinician's responsibility to store and handle it in accordance with their own records management and applicable data protection requirements.

---

## 4. Clinician Workflow — URL Composer

### 4.1 Purpose
The Composer is a clinician-facing tool, served at `/composer/`. Its purpose is to generate a patient link for a specific assessment session. It is freely accessible to any clinician; no authentication is required.

### 4.2 Flow
1. Clinician opens the Composer.
2. The Composer loads a manifest of available config files and all questionnaires and batteries defined within them.
3. Clinician selects which questionnaires or batteries to include, in selection order.
4. Clinician optionally enters a patient ID — an opaque clinic code (e.g. `TRC-2025-000123`). No patient name is entered at this stage.
5. The Composer generates a URL live as selections are made.
6. Clinician copies or shares the generated URL and sends it to the patient (e.g. via SMS or email).

### 4.3 What the URL Contains
The generated URL uses the following parameters:

| Parameter | Description |
|---|---|
| `configs` | Comma-separated list of config source URLs required to resolve the selected items |
| `items` | Comma-separated ordered list of questionnaire and/or battery IDs in session order |
| `pid` | Patient identifier (optional) |

Example:
```
https://app.example.com/?configs=/configs/core.json,/configs/trauma.json&items=intake_battery,phq9,pcl5&pid=TRC-2025-000123
```

The URL contains:
- The selected questionnaires and/or batteries, in order
- The config sources needed to resolve them
- The patient ID (if provided)
- No patient name or personally identifying information
- No clinical scoring rules or alert thresholds

### 4.4 Config maintenance

Questionnaires and batteries are defined in configuration files maintained by the clinical and technical leads. All config IDs must be unique across the full set of loaded configs — duplicate IDs are a hard error. Config files are not editable from within the app or the Composer.

---

## 5. Patient Workflow

### 5.1 Welcome Screen
The patient opens the URL on their device. They are presented with a welcome screen that contains:

- A brief orientation explaining what they are about to do. The exact text is configurable per deployment.
- An optional name field. The patient may enter their name or leave it blank. If provided, the name appears in the PDF only; it is never transmitted anywhere and does not appear in the URL.
- A button to begin.

### 5.2 Questionnaire Flow

#### 5.2.1 Instrument Opening
Before the first item of each questionnaire, the patient sees an instruction screen showing:
- The name of the instrument
- Opening instructions as defined in the questionnaire configuration (e.g. "The following statements refer to experiences many people have in daily life...")
- A button to begin

The patient must tap the button to proceed. The screen does not auto-advance.

#### 5.2.2 Items
Items are presented one at a time, full screen.

**Likert items** — the patient taps a response option. Selection immediately advances to the next item. No separate confirm step.

**Binary items** — the patient taps a yes/no button, or swipes left/right. Selection immediately advances.

**Instruction items** — some questionnaires contain instruction blocks at points within the item list. These display text and a continue button. They are not questions and do not receive a response.

#### 5.2.3 Navigation
A Back button is always visible during the questionnaire. Tapping Back returns to the previous item or instruction screen, in exact reverse order. Answers given before going back are preserved and displayed when the patient returns to that item.

A progress indicator is visible throughout (e.g. "5 / 23"). This count includes all items, including instruction items.

#### 5.2.4 Battery Flow
When one questionnaire is complete, an instruction screen for the next questionnaire is shown. The patient taps to begin the next instrument. This continues until all questionnaires in the battery are complete.

#### 5.2.5 Session Recovery
If the patient closes the browser or navigates away at any point before the completion screen, the session is lost and the patient must start over from the welcome screen. This is by design.

### 5.3 Completion Screen
Upon answering the last item in the battery, the patient is taken to a completion screen. This screen:
- Confirms that all questionnaires are complete
- Reminds the patient that they may still use the Back button to review or change any answer
- Provides a button to proceed to results

Once the patient proceeds to the results screen, the session is locked. Back navigation to change answers is no longer possible.

### 5.4 Results Screen
The results screen displays:
- A summary score for each questionnaire completed

The results screen does not display:
- Clinical interpretation labels
- Alert flags or clinical risk indicators
- Subscale breakdowns
- The raw response table

The results screen contains a button to generate and download the PDF. The PDF is generated at the moment the patient taps this button; it is not generated automatically.

---

## 6. PDF Report

The PDF is generated entirely in the patient's browser at the moment of request. It is never transmitted to any server.

### 6.1 Contents
The PDF contains the following sections in order:

1. **Patient Information** — patient name (if provided), patient ID, date and time of completion.
2. **Clinical Alerts** — any alert conditions triggered during the session. See section 7.
3. **Questionnaire Results** — for each instrument: total score and subscale scores where applicable.
4. **Response Table** — every item answered, the response label given, and the numeric score assigned to that response.
5. **Footer** — generation timestamp, app version, and configuration version.

### 6.2 Language and Layout
The default language is Hebrew with right-to-left layout throughout. Language is configurable per deployment. Hebrew RTL is the only currently implemented language.

### 6.3 Delivery
The patient downloads the PDF from the results screen and shares it with the clinician via an agreed channel (e.g. messaging app, email, in person). Transmission of the PDF is outside the scope of this application.

---

## 7. Alerts

### 7.1 Purpose
Alerts flag clinically significant responses for the clinician's attention. They are defined per instrument in the configuration. Alerts are not visible to the patient at any point — not during the questionnaire, not on the completion screen, and not on the results screen. They appear only in the PDF.

### 7.2 Trigger Conditions
Alert conditions may be based on:
- A specific item response meeting or exceeding a threshold (e.g. PHQ-9 item 9 ≥ 1)
- A total score meeting or exceeding a threshold
- Boolean combinations of the above (any of / all of)

### 7.3 Severity
Alerts are currently binary — either triggered or not. The system is designed to support range-based severity tiers in a future version (e.g. score 14–24 = moderate, 25+ = high). Severity rendering in the PDF is out of scope for the current version.

### 7.4 Thresholds
Alert thresholds are fixed per instrument in the configuration. They cannot be adjusted per session or per patient from the Composer.

---

## 8. Privacy

- No patient data is stored on any server at any point during a session.
- The patient's name, if entered, exists only in browser memory for the duration of the session and in the downloaded PDF.
- The patient ID in the URL is an opaque clinic code, not a personally identifying value.
- Closing the browser permanently discards all session data.
- The PDF once downloaded is outside the scope of this application. Its storage and transmission are the clinician's responsibility.

---

## 9. Questionnaire Configuration

Questionnaires and batteries are defined in configuration files maintained by the clinical and technical leads. They are not editable from within the app or the Composer.

### 9.1 Config strategy

All standard instruments are defined in a single canonical config file (`standard.json`). Specialised or complex instruments that require their own file (e.g. structured diagnostic interviews, worksheet-style content) are defined in separate config files loaded alongside `standard.json` via the multi-config URL mechanism.

### 9.2 Currently configured instruments

| Instrument | Full name | Config file | Status |
|---|---|---|---|
| PHQ-9 | Patient Health Questionnaire — 9 items | `standard.json` | Live |
| PCL-5 | PTSD Checklist for DSM-5 | in migration | Pending move to `standard.json` |
| PDSS-SR | Panic Disorder Severity Scale — Self Report | in migration | Pending move to `standard.json` |
| OCI-R | Obsessive Compulsive Inventory — Revised | in migration | Pending move to `standard.json` |
| ASI-3 | Anxiety Sensitivity Index — 3 | in migration | Pending move to `standard.json` |
| GAD-7 | Generalised Anxiety Disorder scale — 7 items | — | To be added |

Additional instruments using Likert or Binary item types may be added by editing `standard.json`. See `docs/INSTRUMENTS.md` for the step-by-step process. Support for other item types (e.g. free text, numeric input) is planned for a future phase.

---

## 10. Out of Scope

The following are explicitly excluded from the current version:

- User accounts or authentication of any kind
- Server-side storage of any kind
- Analytics or usage tracking
- Session recovery after browser close
- Clinician-adjustable thresholds per patient or session
- Narrative clinical summaries in the PDF
- Severity tier rendering in the PDF (data model is ready; rendering is not implemented)
- QR code generation in the Composer
- Patient name in the URL
- Back navigation from the results screen
- Languages other than Hebrew
- Randomised item ordering (node type is defined in schema; execution throws `NotImplementedError`)
