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

Narration and shot cues: [`SCRIPT.he.docx`](SCRIPT.he.docx) (Word, because
Hebrew is hard to edit in Markdown). Paragraphs in the **Narration** style are
the spoken text and the caption source; paragraphs in the **Cue** style are the
`[SYNC-POINT]` markers. Everything else is direction. Factual source of
truth: the therapist guide, [`GUIDE.he.md`](../../therapist/GUIDE.he.md).
When they disagree, the guide wins and the script is fixed.

## 2. Audience, tone, length

- Therapists in the course; Hebrew.
- Watched **both** on a phone (forwarded link) and projected in class.
- Length **about 2 minutes** (decided 2026-09-24: the scratch cut runs 126 s
  and that is fine), governed by the narration.
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
  The screen layer needs its own rounded alpha mask before the bezel goes
  on top, or its square corners poke out past the frame.
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
SCRIPT.he.docx ─┬─ narration/he/<scene>.m4a ─ transcribe.py ─┐
                └──────────────────────────────── cues.mjs ────────┴→ cues.json
cues.json + scenario.json → clips.mjs → raw/clips/<scene>/ (frames, take.json)
raw/clips + cues.json → assemble.py → out/video.mp4 + out/timeline.json
out/video.mp4 + narration + music + sfx.sh sounds → mix.py → final/madad-intro.he.mp4
```

**One command builds it** (details and the where-things-go table:
[`README.md`](README.md)):

```bash
bash guides/video/intro/build.sh               # → guides/video/intro/final/madad-intro.he.mp4
bash guides/video/intro/build.sh --no-record   # picture/sound changes only
```

It runs, in order: `cues.mjs --from-audio` (when `MADAD_ASR_PYTHON` /
`MADAD_ASR_MODEL` point at the transcriber), `npm run build` and a preview
on :4173, `clips.mjs`, `sfx.sh`, `assemble.py`, `mix.py`.

1. **Narration:** one file per scene in `narration/he/`, named by scene
   (`01-composer.m4a` … `08-closing.m4a`; any audio format). Older takes
   move to `narration/archive/<date>-<name>/`. Never inside `raw/`:
   `clips.mjs` wipes a scene's folder on every take.
2. **Cues:** `cues.mjs --from-audio` transcribes each file (cached as
   `<scene>.words.json`), matches the words to the script in order and
   interpolates any Whisper missed, and puts each cue just before its line.
   Spelling always comes from the script; the transcription supplies timing
   only. Whisper's times run early (~0.3 s after each pause) and can stretch
   the first word back over leading silence, so they are **snapped to the
   audio**: after every pause ffmpeg detects, the first word starting during
   or after it is moved to where speech resumes, and the words in between
   take the interpolated correction. Written-vs-spoken pairs ("PHQ-9" said
   "PHQ") are listed in `SAID_AS` in `cues.mjs`. Scenes without a recording keep the word-count estimate.
3. **Clips:** `clips.mjs` records each scene, **timing actions to the
   cues** — the ID's last character lands on "מוכן", the alert pulse on
   "התראה". Anchor words that disappear from the script fall back to the
   end of their line with a warning. Each take logs what happened and when
   (`take.json`): taps, each keystroke, the ping, cuts.
4. **Picture:** `assemble.py` lays the takes on the cue timeline (scene
   time: slow motion undone, cuts removed), frames them by role, adds the
   opening card, the recap and end card, the captions and the corner logo.
5. **Sound:** `mix.py` places each scene's narration at its start, ducks the
   music under it, and adds the ping, the tap clicks and the key sounds at
   their logged times.

Transitions (`assemble.py`), each centred on its cut so nothing changes
length: 0.4 s dissolve from the opening card, into the recap and into the
end card; 0.2 s screen dissolve between therapist scenes (the frame stays);
a 0.35 s slide at the two role changes, moving the way Hebrew reads (to the
patient: out to the left, in from the right; back: the reverse); 0.25 s
dissolve over the patient's off-camera answering; 0.3 s week to week.

## 7. Capture (`clips.mjs`)

- **Headless Chromium** with the iPhone 14 profile (Chromium, not WebKit,
  because capture uses CDP), light colour scheme,
  `reducedMotion: 'no-preference'`, `page.clock` set to the scene's date.
- **Frames:** a CDP `Page.startScreencast` loop saving PNG frames with
  their timestamps, then converted by ffmpeg to 30 fps. Measured in the
  spike (`spike.mjs`, 2026-09-24):
  - Chromium must be launched with `--force-device-scale-factor=3` *and* the
    emulated scale of 3. Without the flag, both the screencast and
    Playwright's `recordVideo` capture at CSS pixels (390×664); upscaled 3×,
    the text is visibly soft. With it, frames are 1170×1992.
  - `recordVideo` is rejected: CSS-pixel capture padded into a grey
    1170×1992 canvas, 25 fps, ~400 kbit/s VP8.
  - Frames arrive only when something changes. Under continuous
    full-screen motion the screencast sustains **~32 fps at scale 3** (~57 at
    scale 2), enough for a 30 fps master. A clip's last frame must be held
    until the clip's end event, or the tail hold is lost.
  - Motion must be driven **in the page** (rAF-eased `scrollTo`, typing via
    the keyboard API). Playwright wheel steps round-trip at ~48 ms and cap
    a scroll at ~20 fps; an in-page scroll captures at ~38 fps.
  - Event marks and frame timestamps share a clock (seconds since epoch).
    Cue events should be taken from the DOM state (e.g. the link-ready
    state appearing), not from when a Playwright call returns: `type()`
    resolves one delay *after* the last character lands.
  - A 2× punch-in shows source pixels 1:1 and stays sharp.
  - Right after a large DOM change (the drawer mounting, the detail panel
    opening) the capture stalls for ~100 ms, so at normal speed a 200 ms
    open animation gets only one to three in-between frames and looks
    choppy.
  - **Slow-motion capture is the default (×4).** CDP
    `Animation.setPlaybackRate(0.25)` slows every CSS animation and
    transition; the recorder scales all its own waits, typing and scrolls
    by 4; the edit divides all times by 4. Measured: 55–63 frames per
    drawer/panel opening (largest gap 10–12 ms) against 12 at ×1 (gap
    45–58 ms). Two side effects: the browser's own response time to a tap
    (~100 ms) is not slowed, so after retiming the UI reacts ~4× faster
    than it really does (add a hold after the tap if that ever looks
    wrong); and the app's JS timers are not slowed, so a scene that
    depends on one (the patient app's 150 ms auto-advance) is checked,
    and recorded at ×1 if it shows.
  - The clinician surfaces had no open animations at all; the drawer, QR
    dialog and session panel got real ones in the app (2026-09-24,
    `a548e44`), so nothing is added in post. The touch ring (below) is the
    only injected visual, and it works as designed.
- **Data and network:** the local build (`vite preview` of `dist/` on branch
  `remote`) with the API mocked. The mock and the context factory are
  extracted from `therapist/data/shots.mjs` into `guides/lib/` and shared by
  both scripts. A route guard **fails the run** on any request to a host
  other than localhost.
  The app must be loaded **under `https://ctrmadad.com`** and routed to
  the local server (as `shots.mjs` does). Otherwise the Composer's link
  reads `http://localhost:5173/…` on screen.
- **In-page overlays**, injected with `addInitScript` and triggered by the
  recorder at cue time, so they sit exactly on the real element and move
  with it:
  - touch ring on every tap, no mouse pointer. **Finger first:** the ring
    appears at the target ~250 ms (scene time) *before* the tap, dips as
    the tap lands, then fades, so the viewer sees where the finger goes
    and then what it does. **Colour-neutral**: a translucent dark disc with
    a white edge, readable on the green buttons, the dark rail and white
    cards. A mint ring vanished on the mint button and cut into its
    letters (seen in the spike);
  - one restrained pulse around the existing alert ring, at "התראה" —
    never replacing or hiding the app's own ring;
  - a brief highlight on the patient ID in the email.
- **Human pacing:** sequential typing, short smooth scrolls, and handles of
  ~0.5 s before and after each useful action.
- **Patient scene:** two real questions on camera. The remaining answers
  (the same session's values) are filled in off camera inside a *cut*, then
  recording resumes on the results screen. The edit drops frames inside a
  cut except the last one, which stands for the screen at the moment the
  cut ends: the screencast sends no new frame for a screen that is already
  still, so without it the take would stay on the last question. The automation racing through
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
- Sounds, all synthesised by `sfx.sh` (ffmpeg; no licences):
  - the email **ping**: a soft two-note chime (C6, G6) at the take's `ping`;
  - a **tap** on each logged tap: a mechanical "tchick" (two short noise
    transients and a faint low thump; no tone);
  - a soft **typewriter key** on each logged keystroke, four variants in
    rotation.
- Music from Pixabay (Content License: free, no attribution). Chosen:
  alex-morgan, *Corporate Strategy Presentation Music*. Its License
  Certificate is kept next to it in `music/` to clear a YouTube Content ID
  claim if one appears. Incompetech was ruled out: its free licence
  requires a credit. None of them compete with speech or make the tool feel like
  a game.
- Loudness: two-pass `loudnorm` on the final mix to **−14 LUFS**, true peak
  target −1.5 dBTP so it measures ≤ −1 after AAC encoding (YouTube).
- Export: H.264 High, yuv420p, 1920×1080, 30 fps; AAC-LC 192 kbps 48 kHz;
  `+faststart`. The `.srt` is written beside the video from the same caption
  timings.

## 9. Captions

- Hebrew, from the approved script text, timed to the final narration.
- **Short phrases, one line each**, shown one after another as they are
  spoken. The breaks live in the script: ` | ` inside a Narration line
  marks a caption break (never spoken). Breaks follow Hebrew phrase
  structure (subject with verb, preposition with object, a new phrase at
  "ו…"); without marks, `assemble.py` breaks at punctuation and halves long
  phrases.
- **Punctuation at the end of a caption is dropped**; inside it, kept.
- 64 px (62 px bottom-centre), single line (no wrapping; every phrase is
  measured to fit its ~780 px column), **centred in its column at a fixed
  height**: left of the therapist's phone, right of the patient's, bottom
  centre for the recap and the end card.
- Authored as ASS, Noto Sans Hebrew (`public/fonts/`), rendered by libass
  with fribidi. The style's Encoding field must be **`-1`** (libass
  detects each line's base direction). With the Hebrew charset (177), or
  with a leading U+200F, lines are laid out left to right and trailing
  punctuation lands on the wrong side (checked with the local ffmpeg 4.4).
- **Burned into the master** (the file gets forwarded) **and** exported as
  `.srt` for the YouTube upload.

## 9a. Opening card, recap and corner logo

- **Opening card**, ~2.5 s before scene 1, music only: the CTR lockup
  ([`assets/ctr-lockup@4x.png`](assets/ctr-lockup@4x.png), from
  `ctr-templates/brand/logos/`) centred on the video's light ground.
- **Corner logo**: the same lockup, small (240 px), top right, from scene 1
  to the end. The recap phones sit low enough to keep that corner clear.
- **Recap** (scene 8, "זה כל התהליך"): three phones side by side, right to
  left — send (the patient's QR), fill (the patient's question), summary
  (all weeks) — each fading and rising in on its phrase and then staying.

## 10. End card

Madad branding, the Composer QR
([`00-composer-qr.png`](../../therapist/images/00-composer-qr.png)) **and**
`ctrmadad.com/composer` as text, with the line `סרקו או היכנסו:`. The QR is
for the projector; the text is for the phone viewer, who can't scan their
own screen.

## 11. Delivery

- Hosting: **unlisted YouTube**. Linked from `/help/` and
  [`guides/README.md`](../../README.md).
- **The finished video is `final/madad-intro.he.mp4`**, built by `build.sh`.
- Committed: `README.md`, `build.sh`, `SCRIPT.he.docx`, `SCRIPT.en.docx`, `SPEC.md`, `cues.mjs`, `cues.json`,
  `transcribe.py`, `clips.mjs` (+ `guides/lib/capture.mjs`), `assemble.py`,
  `mix.py`, `sfx.sh`, `assets/`, `narration/he/`. Ignored (see `.gitignore`):
  `raw/`, `narration/archive/`, `music/` (licence: no standalone
  redistribution), `out/`, `final/`.

```text
guides/video/intro/
├── SCRIPT.he.docx  SPEC.md  cues.json
├── cues.mjs  transcribe.py  clips.mjs  assemble.py  mix.py  sfx.sh
├── assets/ctr-lockup@4x.png
├── narration/he/<scene>.m4a + .words.json   (committed; archive/ ignored)
├── music/<track>.mp3 + licence certificate               (ignored)
├── raw/clips/<scene>/  frames, frames.json, take.json    (ignored)
├── out/  video.mp4  sfx/  timeline.json  (intermediates) (ignored)
└── final/  madad-intro.he.mp4 + .srt  ← the deliverables  (ignored)
```

## 12. Prerequisites in the app

All fixed on 2026-09-24, on `main` and merged into `remote`:

- **The Aggregate on phones** (AGG-10, decision D-21): legible chart text,
  ≥ 44 px tap targets, an item map that fits the card, wrapping header
  controls.
- **The results screen at the iPhone 14 viewport** (P2-13): the "sent"
  confirmation leads the screen and the sticky PDF bar no longer covers it.
  The resize-to-760 workaround in `therapist/data/shots.mjs` can go.
- **Open animations** for the phone drawer, the QR dialog and the session
  panel (`a548e44`). Before this they appeared in a single frame.

## 13. Order of work and review

1. ~~Spike~~ — done 2026-09-24; findings in §5, §7 and §9. Its script is
   superseded by `clips.mjs` + `guides/lib/capture.mjs` (in git history as
   `spike.mjs`).
2. ~~Fix the §12 prerequisites~~ — done.
3. ~~Scratch narration → cues → all clips → rough cut~~ — done 2026-09-24.
4. ~~Clean narration, transitions, loudness, export, `.srt`~~ — done
   2026-10-02: `final/madad-intro.he.mp4` (123.8 s, −14 LUFS) and
   `final/madad-intro.he.srt`.
5. Upload to YouTube (unlisted, with the `.srt`), check Content ID, then link
   it from `/help/` and `guides/README.md`. Next after that: the English
   version (`SCRIPT.en.docx`).

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
