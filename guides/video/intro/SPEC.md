# Madad intro video — production specification

## 1. Purpose

A short Hebrew video for therapists in the training programme. It has two
jobs, in this order:

1. **Teach the everyday workflow** so a therapist can use Madad after one
   viewing: Composer → patient ID → QR → patient answers → email → patient
   summary → progress over weeks.
2. **Sell it.** Madad is broad (dozens of instruments and ready batteries),
   powerful (per-session detail, alerts, trajectories) and pleasant to use.

It is not a feature tour. Everything left out here belongs to the detailed
walkthrough track (see [`../../README.md`](../../README.md)).

Narration and shot cues: [`SCRIPT.he.md`](SCRIPT.he.md). Factual source of
truth: the therapist guide, [`GUIDE.he.md`](../../therapist/GUIDE.he.md).
When they disagree, the guide wins and the script is fixed.

## 2. Audience, tone, length

- Therapists in the course; Hebrew.
- Watched **both** on a phone (forwarded link) and projected in class.
- Target length **80–95 s**, governed by the final narration.
- Brisk, light, polished, a little playful — never childish. The one
  exception is the alert beat (scene 6): the pace slows and the music drops
  out, so the moment reads as serious without any added words.

## 3. Scope

**Included:** catalogue breadth; searching and selecting the training
battery; entering the patient ID and the automatic ready-link state; the
patient QR; the patient's questionnaire (two questions, then results); the
notification email; the summary at week 1 with the PHQ-9 alert and its
session detail; the summary filling in over the following weeks; end card.

**Excluded:** desktop UI; preview and pin; reordering or removing
questionnaires; copy-link and share; expired links and link requests; PDF
download or upload; item map and table views (named once, pointing to the
guide); troubleshooting.

## 4. Story and continuity

One patient, `K7M3-9QR7`, on the `course_up` battery (OASIS + PHQ-9), with
the eight weekly sessions in
[`scenario.json`](../../therapist/data/scenario.json) (27 Jul – 14 Sep 2026).

- Scenes 1–6 happen on **27 Jul 2026**, the first session. The patient's
  answers on camera are exactly that session's answers (PHQ-9 16 with item
  9 = 1, OASIS 17). The results screen, the email date and the single point in
  the week-1 summary therefore all agree.
- Scene 7 adds sessions 2–8 one at a time. The narration states the fact that
  makes this work: the patient reuses the same link every week (the link is
  static and the server accepts any number of sessions per ID).
- The alert is the application's own ring on the week-1 PHQ-9 point, from the
  real scoring of item 9. Nothing about it is mocked visually.

## 5. Frame and roles

- **Master: 1920×1080, 30 fps.** One phone on screen at a time, framed and
  centred slightly off-axis by role:
  - **therapist phone** right of centre, dark frame (`#1d2622`, as in the
    guide's composites);
  - **patient phone** left of centre, a light mint frame.
  Position plus frame colour tell the viewer whose screen it is (the story
  reads right to left). A subtle change of music texture on the patient side
  is optional and is decided at the rough cut.
- **Phone viewport:** Playwright `iPhone 14` (390×664 CSS, device scale 3,
  `he-IL`). On a horizontal frame the phone's height is the limit on text
  size (~1000 px of screen → 1.5×), so this short, realistic viewport is kept
  deliberately. Legibility is improved by **punch-ins** instead: capturing at
  scale 3 allows up to ~2× zoom on the ID field, the alert ring and the
  session detail without softening.
- The side space holds captions (§9); nothing is ever drawn over the UI
  except the in-page highlights in §7.

## 6. Pipeline

Narration is the master timeline, so it comes **before** the screen capture:

```
SCRIPT.he.md → narration/*.wav → word timestamps → cues.json
                                                      │
scenario.json → clips.mjs → raw/<scene>/ frames + events.json
                                                      │
edit.json (cue-relative) → assemble.mjs → ffmpeg → out/
```

1. Record narration, one WAV per scene (scratch take first, clean take later).
2. Get word timestamps with Whisper. Spelling always comes from the script;
   the transcription supplies timing only. Write `cues.json` (cue name →
   seconds within its scene WAV).
3. `clips.mjs` records each scene, **timing actions to the cues**. For
   example, the ID is typed at a per-character delay computed so the last
   character lands on "מוכן". Each clip writes an `events.json` of what
   actually happened and when (`id-typed`, `qr-open`, `ring-pulse`, …).
4. `edit.json` places clips relative to events and cues, **never by absolute
   timecode**, so a UI timing change needs a re-record, not a re-edit.
5. `assemble.mjs` builds one ffmpeg run: framing, cuts, dissolves,
   punch-ins, audio mix, captions.

## 7. Capture (`clips.mjs`)

- **Headless Chromium** with the iPhone 14 profile (Chromium, not WebKit,
  because capture uses CDP), light colour scheme,
  `reducedMotion: 'no-preference'`, `page.clock` set to the scene's date.
- **Frames:** a CDP `Page.startScreencast` loop saving PNG frames at device
  pixels with their timestamps, then converted by ffmpeg to a lossless
  constant-frame-rate intermediate. Playwright's `recordVideo` is not used
  (low-bitrate VP8, too soft for Hebrew UI text). The first spike confirms
  this choice.
- **Data and network:** the local build (`vite preview` of `dist/` on branch
  `remote`) with the API mocked. The mock and the context factory are
  extracted from `therapist/data/shots.mjs` into `guides/lib/` and shared by
  both scripts. A route guard **fails the run** on any request to a host
  other than localhost.
- **In-page overlays**, injected with `addInitScript` and triggered by the
  recorder at cue time, so they sit exactly on the real element and move
  with it:
  - touch ripple on every tap (mint, ~300 ms; no mouse pointer);
  - one restrained pulse around the existing alert ring, at "התראה" —
    never replacing or hiding the app's own ring;
  - a brief highlight on the patient ID in the email.
- **Human pacing:** sequential typing, short smooth scrolls, and handles of
  ~0.5 s before and after each useful action.
- **Patient scene:** two real questions on camera. The remaining answers
  (the same session's values) are filled in off camera, then the results
  screen is captured as its own clip. The automation racing through
  questions is never shown.
- **Email scene:** the real `doorbellEmail()` output from
  `server/lib/email.js` in a **generic** mobile mail frame, not styled after
  any real mail app. It contains no name and no scores, as the template
  guarantees.
- **Progression (scene 7):** the mocked read returns the first *N* sessions;
  one short clip per *N* = 2…8, joined with quick dissolves. If the
  rescaling axes make dissolves read badly, the spike decides whether an
  in-page "append session" hook is worth building.

## 8. Narration, music, sound

- Mono PCM WAV, 48 kHz, ~0.5 s room tone at each end. Energetic and
  conversational, without rushing clinical terms. No significant time-stretch
  of the voice; UI speed changes stay within ~0.85–1.2×.
- One licensed instrumental track: modern, warm, lightly rhythmic, no
  vocals. Ducked under speech (`sidechaincompress`). It **drops out** for the
  alert beat and returns with scene 7.
- Sounds: subtle taps and typing; a short notification **ping** when the
  email arrives. None of them compete with speech or make the tool feel like
  a game.
- Loudness: two-pass `loudnorm` to −14 LUFS integrated, true peak ≤ −1 dBTP
  (YouTube).

## 9. Captions

- Hebrew, from the approved script text, timed to the final narration.
- Authored as ASS, Noto Sans Hebrew (`public/fonts/`), rendered by libass
  with fribidi. At most two lines, correct RTL, placed in the side space or
  below the phone — never over the bottom bar, the QR, the chart point or the
  session detail.
- **Burned into the master** (the file gets forwarded) **and** exported as
  `.srt` for the YouTube upload.

## 10. End card

Madad branding, the Composer QR
([`00-composer-qr.png`](../../therapist/images/00-composer-qr.png)) **and**
`ctrmadad.com/composer` as text, with the line `סרקו או היכנסו:`. The QR is
for the projector; the text is for the phone viewer, who can't scan their
own screen.

## 11. Delivery

- Hosting: **unlisted YouTube**. Linked from `/help/` and
  [`guides/README.md`](../../README.md).
- Committed: `SCRIPT.he.md`, `SPEC.md`, `clips.mjs`, `assemble.mjs`,
  `edit.json`, `cues.json`. Ignored (see `.gitignore`): `raw/`,
  `narration/`, `music/`, `out/`.

```text
guides/video/intro/
├── SCRIPT.he.md  SPEC.md
├── clips.mjs  assemble.mjs  edit.json  cues.json
├── raw/<scene>/          frames + events.json          (ignored)
├── narration/<scene>.wav                               (ignored)
├── music/                                              (ignored)
└── out/  review.mp4  madad-intro.mp4  madad-intro.he.srt  (ignored)
```

## 12. Prerequisites in the app

These must be fixed before filming; therapists and patients hit them today
anyway. They are tracked in `docs/TODO.md` on `main`:

- **The Aggregate on phones.** The chart's viewBox is fixed at 800 wide
  with 9–10 unit SVG text, so at 390 px the axis labels render at about
  4 px. Also covered: hit targets, tap instead of hover, session detail as a
  bottom sheet, the heatmap at narrow widths.
- **The results screen clips at the iPhone 14 viewport (664 px).** The guide's
  screenshots work around it by resizing to 760.

## 13. Order of work and review

1. Spike: capture scene 2 (typing → link ready) and scene 6 at week 1 on the
   phone. Check sharpness at 100% and after a 2× punch-in, the frame rate,
   and how bad the Aggregate is on the phone.
2. Fix the §12 prerequisites.
3. Scratch narration → cues → all clips → rough cut. Review pace, roles,
   music and the progression beat.
4. Clean narration, licensed music, captions → final render → YouTube.

Review every render for:

- pace;
- ID-typing sync;
- the two-question jump;
- alert-beat timing and legibility;
- whether the progression beat reads;
- music under speech;
- Hebrew caption spelling and RTL;
- captions never covering UI;
- one viewing on a phone and one on a large screen.

## 14. Open choices

- Music track and its licence.
- Optional music-texture change on the patient side (§5).
- Whether the end card carries `madad@ctrmadad.com` in small text.
