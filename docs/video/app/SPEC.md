# Madad intro video (public app) — production specification

The public-app counterpart of the trial video on branch `remote`
(`docs/video/intro/`). Same method, same pipeline, different workflow:
here there is no server, and the PDF report is the only thing a session
produces. How the method works in general:
`remote:docs/video/PRODUCT-VIDEO-PLAYBOOK.md`.

## 1. Purpose

A short English video for clinicians who meet Madad at
`app.ezmadad.com`. It has two jobs, in this order:

1. **Teach the everyday workflow** in one viewing: Link builder → send the
   link (QR or message) → patient answers → the PDF report reaches the
   therapist → patient summary → progress over weeks.
2. **Sell it.** Broad (dozens of instruments), private (no app, no account,
   nothing stored on a server, reports read in the browser), powerful
   (alerts, trajectories, item map) and pleasant to use.

It is not a feature tour. A Hebrew version follows, reusing everything
except the script and the narration.

Narration and shot cues: [`SCRIPT.en.docx`](SCRIPT.en.docx), using the same
paragraph styles as the trial video's script (**Narration**, **Cue**,
**Heading 2**, ` | ` for caption breaks). Factual source of truth: the app
itself and `docs/BEHAVIORAL_SPEC.md`; when they disagree with the script,
the script is fixed.

## 2. Audience, tone, length

- Clinicians, English. Watched on a phone (a forwarded link) and projected.
- **About 2 minutes**, governed by the narration.
- Brisk, light, polished. The one exception is the alert beat (scene 5):
  the pace slows and the music drops out.

## 3. Scope

**Included:** catalogue breadth; search and add PHQ-9 and PCL-5; the link
ready; QR in the room, or the link sent in a message; the patient's
questionnaire (two questions, then results); sharing the PDF report into a
chat; the patient summary on a laptop, a report dragged in, the PHQ-9
alert and its session detail; the later reports dragged in week by week;
the item map and table; end card.

**Excluded:** the patient ID (optional, and not needed for one patient's
reports); preview and pin; reordering or removing questionnaires; copy-link
details; the PDF's own contents; chart export; languages; troubleshooting.

## 4. Story and continuity

One patient, **no patient ID**, PHQ-9 + PCL-5 in English, eight weekly
sessions in [`data/scenario.json`](data/scenario.json).

- Scenes 1–5 happen on the date of session 1. The patient's answers on
  camera are exactly that session's answers (PHQ-9 with item 9 = 1, so the
  alert fires). The results screen, the shared PDF and the single point in
  the first summary therefore all agree.
- Scene 6 adds reports 2–8, one drag per week. The course remits; item 9
  is 0 after session 1.
- The 8 PDFs are real Madad reports from the app's own generator
  (`demo/`, see `.claude/skills/mock-report/SKILL.md`), so the summary
  parses them exactly as it would a patient's. The alert ring is the app's
  own, from the real scoring of item 9.

## 5. Frame and devices

- **Master: 1920×1080, 30 fps.** English reads left to right, so the story
  does too.
- **Therapist phone** left of centre, dark frame; **patient phone** right
  of centre, light mint frame. Playwright `iPhone 14` (390×664 CSS, scale 3,
  `en-US`).
- **Laptop** (scenes 5–6), centred: the therapist's sit-down review.
  Viewport about 1440×900 CSS at scale 2, inside a laptop bezel. The cut from
  phone to laptop is the story's own beat ("on your computer").
- Captions sit beside the phone (right of the therapist's, left of the
  patient's) and below the laptop; never over the UI.

## 6. Pipeline

The trial video's pipeline, ported to `main` and parameterized, lives in
`docs/video/lib/`: capture plumbing, cue builder, transcriber, assembler,
mixer and sound effects. This folder holds only what is particular to this
video: script, `video.json` (domain, language, direction, device sides,
branding, output name), scene functions (`clips.mjs`), scenario and
assets. Paths that exist on branch `remote` are not reused, so merging
`main` into `remote` stays clean.

```
SCRIPT.en.docx ─┬─ narration/en/<scene>.m4a ─ transcribe.py ─┐
                └──────────────────────────────── cues.mjs ───┴→ cues.json
cues.json + data/ → clips.mjs → raw/clips/<scene>/
raw/clips + cues.json → assemble.py → out/video.mp4
out/video.mp4 + narration + music + sfx → mix.py → final/madad-app.en.mp4 (+ .srt)
```

Capture rules carried over unchanged: the real domain
(`https://app.ezmadad.com`) routed to a local `vite preview` of `dist/`;
any request to another host fails the run; fixed clock; slow-motion
capture ×4 (×1 where the app relies on JS timers); touch ring finger-first
and colour-neutral.

## 7. Mocks and overlays

All generic, never styled after a real product:

- **Share sheet** (scene 4): `navigator.share` is mocked in the page, so
  the app's real Share PDF report button runs; the sheet shown is a
  generic one.
- **Chat** (scene 4): a small generic chat page on the therapist's phone
  with the PDF arriving as a file bubble, and a soft notification chime.
- **Downloads window and cursor** (scenes 5–6): a generic file window drawn
  in the page beside the summary, and a drawn cursor (the laptop's version
  of the touch ring). The drag ends in real `dragenter` / `dragover` /
  `drop` events on the app's drop zone, carrying a `DataTransfer` built
  from the real PDF bytes, so the app's own upload path runs. A ~6 s
  sample of this shot is reviewed before the scenes are built.
- One restrained pulse around the alert ring at "alert", as in the trial
  video.

## 8. Narration, music, sound, captions

As in the trial video, with these differences:

- Narration: recorded by Elad, one file per scene in `narration/en/`.
  Until it exists, timings are estimated from word counts (English ≈ 2.6
  words/s).
- Word timings: faster-whisper with an English model (`large-v3` or
  `distil-large-v3`), snapped to the audio's pauses.
- Music: the same Pixabay track as the trial video (licence certificate
  kept beside it in `music/`, which is ignored).
- Sounds: tap, key and chime, synthesised; the chime marks the PDF
  arriving in the chat.
- Captions: English, short phrases, one line, punctuation at the end of a
  caption dropped. Noto Sans. Burned in, plus an `.srt`.
- Loudness −14 LUFS, true peak ≤ −1 dBTP. H.264 High 1920×1080 30 fps,
  AAC 192 kbps, `+faststart`.

## 9. Cards

- **Opening card:** the Madad wordmark, music only, ~2.5 s.
- **Corner logo:** the Madad mark, small, top corner, throughout.
- **Recap** (scene 7): left to right, send (the QR on the therapist's
  phone), fill (the patient's question), summary (the laptop with all
  weeks), each appearing on its phrase.
- **End card:** the Madad mark, a QR to the Link builder, and
  `app.ezmadad.com/composer` as text. No CTR branding anywhere.

## 10. Delivery

- The finished video is `final/madad-app.en.mp4` (+ `.srt`), built by
  `build.sh`. `raw/`, `out/`, `final/`, `music/` and `narration/archive/`
  are not committed.
- Hosting: unlisted YouTube, linked from `/help/`.

## 11. Order of work

1. Spec and script — reviewed before any code.
2. Scenario and the 8 PDFs; checked in the summary.
3. Port the pipeline to `docs/video/lib/`; the laptop profile and cursor;
   the drag sample.
4. Clips on estimated cues; a contact sheet per scene. App bugs found
   while filming are fixed in the app.
5. Rough cut; review.
6. Narration recorded; cues from audio; final mix and export.
7. Links from `/help/`; a TODO entry for the Hebrew version.

Review every render for: pace; the two-question jump; the phone→laptop
switch; whether the drag reads as a drag; alert-beat timing; whether the
progression reads; music under speech; captions never over the UI; one
viewing on a phone and one on a large screen.
