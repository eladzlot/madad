# Making a narrated product video from your own web app

A playbook distilled from building a ~2-minute Hebrew onboarding video for a
web app (a clinical questionnaire tool). Everything on screen is the real app,
driven by a script, recorded headless, and cut to a narration. No screen
recorder, no video editor, no stock footage. Rebuilding after a UI change is
one command.

This is not a tutorial for any one tool. It is the order of work that held up,
the settings that mattered, and the mistakes worth skipping.

---

## 1. The shape of the pipeline

```
script (docx) ─┬─ narration (one audio file per scene) ─ transcriber ─┐
               └───────────────────────────────────────── cue builder ─┴→ cues.json
cues.json + demo data → scripted browser capture → frames + event log per scene
frames + cues → assembler → picture (framing, captions, cards)
picture + narration + music + sound effects → mixer → final video
```

Three ideas carry the whole thing:

1. **Narration is the master clock.** Record the voice first, get word-level
   timings, then drive the app *to* those timings: the last character of a
   typed ID lands on the word "ready", a highlight pulses on the word "alert".
   Retiming footage afterwards never lines up as well.
2. **Record the real app, deterministically.** A browser automation script
   (Playwright) performs every tap, with mocked data and a fixed clock. The
   same script re-records the video after any UI change.
3. **Everything is a file you can diff.** Script, cues, capture script,
   assembly and mix are all code or text. Only outputs (frames, audio, MP4)
   are ignored by git.

---

## 2. Before building anything: write the spec, then attack it

Write a one-page spec: purpose, audience, where it will be watched, length,
scene list, what is excluded. Then critique it hard before writing code. The
first draft of ours had problems that would have cost days later:

- **Where will it be watched?** Phone (forwarded in a chat) and projector
  have opposite needs. A QR code on the end card is useless on the phone
  that is playing the video. We ended up with a horizontal master and both a
  QR and a URL.
- **Continuity.** If scene 4 shows a patient answering and scene 6 shows the
  results, the numbers must match. Drive the on-camera answers from the same
  demo data the later scenes display.
- **Time jumps.** If the story jumps from "first session" to "eight weeks
  later", say so, or show it (we made the weekly progression its own beat).
- **Two identical phones confuse viewers.** When the story switches between
  two users (clinician and patient), give each a distinct frame colour and a
  consistent position.
- **Scope.** An intro video is not a feature tour. Cut anything that is not
  the main path; it goes into a longer walkthrough.

**The video is also QA.** Filming the app on a phone viewport found real
bugs:

- a chart unreadable at phone width (fixed text sizes in a scaled SVG);
- chart points too small to tap;
- a confirmation hidden under a sticky button;
- a chart axis that ignored its own minimum-span rule;
- dialogs and drawers with no open animation.

Fix them in the app. Don't paint over them in the edit.

---

## 3. The script

- **Use a word processor file, not Markdown, if the language is right to
  left.** Editing Hebrew in Markdown is miserable. Our script is a `.docx`.
- **Put the structure in paragraph styles**, so the tools can read the
  document after anyone edits it:
  - `Narration`: the spoken text, and the source of the captions;
  - `Cue`: sync markers like `[TYPE-ID]`, named in Latin capitals;
  - `Heading 2`: one per scene;
  - anything else is direction for humans and ignored by the tools.
- **Caption breaks live in the script too:** a ` | ` inside a Narration
  line marks where one caption ends and the next starts. It is never spoken
  and is stripped before matching the audio.
- Parse the `.docx` directly (it is a zip holding `word/document.xml`); no
  library needed. Unzip it, read each `<w:p>`, take its `pStyle` and its
  `<w:t>` text.

---

## 4. Capture: recording the app

Tooling: Playwright driving headless Chromium, with frames taken through the
Chrome DevTools Protocol (CDP).

### Settings that mattered

| What | Why |
|---|---|
| Launch Chromium with `--force-device-scale-factor=3` **and** emulate a device scale of 3 | Without the flag, both the CDP screencast and Playwright's `recordVideo` capture at CSS pixels (390×664 for a phone). Upscaled, text is soft. With it, frames are 1170×1992. |
| Don't use Playwright `recordVideo` | Besides the resolution problem: fixed 25 fps, low-bitrate VP8, and no link to your event timings. |
| CDP `Page.startScreencast`, PNG frames, each saved with its timestamp | Frames arrive **only when something changes**, each with an exact timestamp on the same clock as your event log. |
| **Slow-motion capture**: CDP `Animation.setPlaybackRate(0.25)`, every wait in the script ×4, all times ÷4 in the edit | At full resolution, capture manages ~30 fps and stalls ~100 ms after a big page change. A 200 ms drawer animation got 1–3 frames; at ×4 it gets ~20. |
| Load the app **under its real domain**, routed to a local production build | Links shown on screen read the real address, not `localhost`. Use a production preview, not the dev server; the dev server's live-reload connection fails under a foreign origin. |
| Mock the backend in the route handler, and **fail the run on any request to another host** | Nothing leaves the machine; no real data can appear. |
| Fix the clock (`page.clock.setFixedTime`) and use one demo dataset for every scene | Dates and scores agree across scenes. |

### Traps we hit

- **Slow motion also slows the `requestAnimationFrame` timestamp.** A scroll
  animation timed from that timestamp ran 16× long at ×4, because the delay
  was scaled twice. Time your own animations from `performance.now()`.
- **Slow motion does not slow JavaScript timers.** If the app auto-advances
  on a 150 ms `setTimeout`, record that scene at ×1.
- **Slow motion does not slow the browser's response to a tap**, about
  100 ms of layout. After retiming, the UI reacts slightly faster than
  real. That's usually fine; add a hold if it ever looks wrong.
- **A screen that is already still sends no frames.** If you cut away (e.g.
  answering 12 questions off camera) and resume on a static screen, there is
  no new frame. Keep the **last frame captured inside the cut** and show it
  from the resume point, or the video stays on the old screen.
- **The last frame of a clip must be held until the clip's end**, for the
  same reason.
- **Pages created with `setContent()` never run `addInitScript`.** Check, and
  inject your overlay script by hand.
- **Shadow DOM**: `document.querySelector` won't find components inside
  another component's shadow root; walk the roots. Playwright locators pierce
  them for you.
- **Drive motion inside the page.** Playwright wheel events round-trip at
  ~50 ms, which caps a scroll at ~20 fps. An eased `scrollTo` loop inside the
  page captures smoothly.
- **Take cue events from what happened, not from when a call returned.**
  Playwright's `type()` resolves one delay after the last character; log
  each keystroke yourself.

### Showing touches

- **Draw a touch ring inside the page**, so the capture includes it exactly
  where the finger lands. No mouse pointer on a phone video.
- **Finger first:** show the ring ~250 ms *before* the tap, dip it as the tap
  lands, then fade it. A ring drawn on the tap itself disappears behind the
  drawer it opened before anyone sees it.
- **Colour-neutral:** a translucent dark disc with a white edge. Our first
  ring was the app's brand green: it vanished on green buttons and cut into
  their letters.
- The same mechanism gives a one-off **attention pulse** around an element,
  timed to a word ("alert").

### Mock screens for things outside your app

The email the user receives, a chat app, a share sheet: build a small
**generic** HTML page (never a look-alike of a real product) around your real
content (e.g. your actual email template), and record it the same way.

---

## 5. Narration and timing

- **Record one file per scene**, in a quiet room, with a phone mic for the
  scratch take. Read at the pace you want; **the scratch take's job is
  timing**, not sound quality. Leave ~1 s of silence at each end.
- **Store recordings where nothing will wipe them.** Our capture script
  deletes and recreates each scene's output folder, and a recording saved
  there nearly vanished.
- **Word timings: faster-whisper** with a language-tuned model. For Hebrew,
  ivrit.ai's `whisper-large-v3-turbo-ct2` ran on CPU, ~30 s per 15 s file.
  Pass the scene's script as the initial prompt.
- **Don't trust Whisper's word times as they come.** They ran ~0.3 s early
  after every pause, and the first word got stretched back over the leading
  silence (captions appeared 1.4 s before the voice). Snap them to the audio:
  find the pauses (ffmpeg `silencedetect`), move the first word starting in
  or after each pause to where speech resumes, and interpolate the words in
  between. Snap the *first word after the pause*, not the nearest word —
  because the times run early, "nearest" picks the word after it.
- **Written ≠ spoken.** Keep a small table of words read differently than
  written (an acronym said without its number, say) and match on the spoken
  form; captions keep the written one.
- **Match transcript words to script words in order** (longest common
  subsequence on words stripped of punctuation), and interpolate any it
  missed. **Spelling always comes from the script**; the transcript supplies
  timing only. Report unmatched words to the narrator: usually a slur, or a
  script edit not yet recorded.
- A cue sits just before the line that follows it.
- The capture script looks up **anchor words** ("act when 'ready' starts").
  Scripts get edited, so a missing anchor should **warn and fall back** (e.g.
  to the end of its line), not stop the run.
- Until the recording exists, estimate timings from word counts (Hebrew:
  ~2.4 words/s) so everything else can be built in parallel.

---

## 6. Assembly (picture)

ffmpeg did everything; Python drove it.

- **Frames to video:** an ffmpeg `concat` list, where each frame's duration
  is the gap to the next timestamp (variable frame rate), then `fps=30`.
  Slow motion and cuts are undone here, in the frame timing.
- **Phone frame:** scale the screen, give it a rounded **alpha mask**, and
  lay a bezel image over it. Without the mask, the screen's square corners
  poke out past the bezel.
- **Loop still-image inputs explicitly** (`-loop 1 -t <duration>`). A single
  PNG overlay stopped repeating partway through longer segments, and the
  phone frame vanished mid-scene.
- **Roles:** each user's phone has its own frame colour and side of the
  screen (clinician right of centre, patient left).
- **Cards:** a short brand opening card, a small corner logo throughout, and
  an end card with a QR code *and* the URL as text.
- **Recap:** the three stages side by side (send → fill → results), each
  appearing on its phrase and then staying. Read in the language's direction.
- **Leave transitions for the final cut.** Where dissolves go depends on the
  final pacing, so hard cuts until then.

---

## 7. Captions

- **Burn them in** (videos get forwarded and autoplay muted), and also keep
  an `.srt` for YouTube.
- **Short phrases, one line each, shown in time with the voice.** Viewers
  read a 2–4 word phrase at a glance; a full sentence makes them race it.
- **Break by meaning:** keep subject with verb and preposition with object,
  and start a new phrase at a conjunction. Automatic halving produced breaks
  like "…that requires / attention". Hand-set breaks in the script (`|`) beat
  any rule.
- **Drop punctuation at the end of each caption** (keep it inside a
  caption). It adds nothing once each phrase stands alone, and in RTL text
  trailing punctuation is exactly what renders on the wrong side.
- **Fixed height, single line, centred in its column.** Captions of mixed
  one and two lines, centred vertically, jumped around the screen. Measure
  every phrase with the real font (Pillow's `getlength`) so nothing wraps.
- **RTL with libass (ffmpeg's ASS subtitle renderer):** set the style's
  `Encoding` to **`-1`**, so libass detects each line's base direction. With
  the Hebrew charset, or a leading right-to-left mark, lines were laid out
  left to right with punctuation on the wrong side.
- Place captions **beside** the phone, never over the UI.

---

## 8. Sound

- **Music licence first.** Options we checked:
  - Pixabay: free, no credit required. Keep each track's **License
    Certificate** (log in, Download menu); it clears automated YouTube
    copyright claims.
  - Incompetech: free, but requires a credit line.
  - The YouTube Audio Library: some tracks are YouTube-only, and a
    forwarded file leaves YouTube.

  Pixabay blocks automated downloads, so a human fetches the tracks.
- **Audition tracks in context:** render the same cut with each candidate,
  loudness-matched (`loudnorm`), so neither wins by being louder.
- **Mix:**
  - the voice at about −16 LUFS;
  - the music ducked under it (`sidechaincompress`, keyed on the voice);
  - the music dipped to near silence for the one serious moment, returning
    after it;
  - a fade-in over the opening card and a fade-out on the end card.
- **Sound effects can be synthesised with ffmpeg** (`aevalsrc`), so there is
  no licence and full control:
  - notification: a soft two-note chime;
  - tap: a mechanical "tchick", two short noise bursts (press, release) plus
    a faint low thump. **No tone**: anything with a sine body sounds like a
    ping;
  - keystrokes: a soft typewriter strike, several variants in rotation so it
    doesn't sound looped.

  Place each at its logged event time.
- ffmpeg gotcha: `loudnorm` changes the sample rate, and `sidechaincompress`
  refuses mismatched inputs. Pin every chain with `aformat=...:48000:stereo`.

---

## 9. Working with feedback

- **Show, don't describe.** For every visual decision, render the real
  thing: a contact sheet of frames, a before/after strip, a 6-second sound
  sample, two full cuts with different music.
- **Show before committing.** Frames and audio are judged by eye and ear; a
  passing script proves little.
- **Separate what's decided from what's pending.** Keep the spec current:
  decisions, measured numbers, and what was ruled out and why.
- **Pacing is decided last.** Until the real narration exists, every pause
  is a placeholder; don't polish timing on estimates.

---

## 10. Checklist

- [ ] Spec written and critiqued: audience, viewing device, length, scene
      list, exclusions, continuity.
- [ ] App bugs found while filming are fixed in the app.
- [ ] Script in a word processor, structured by paragraph styles; caption
      breaks marked.
- [ ] Capture: real domain, mocked backend with a network guard, fixed
      clock, one dataset, production build.
- [ ] Device scale factor forced to 3; CDP screencast; slow motion ×4
      (×1 where the app uses JS timers).
- [ ] Touch ring appears before the tap and is colour-neutral; every tap and
      keystroke is logged.
- [ ] Narration per scene, stored safely; word timings aligned to the script.
- [ ] Assembly: masked phone frames, looped overlays, role colours, cards,
      recap.
- [ ] Captions: short phrases, single line, fixed height, end punctuation
      dropped, RTL checked.
- [ ] Music licence kept on file; voice ducking; synthesised effects.
- [ ] Watched on a phone and on a large screen.
