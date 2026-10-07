# Intro video — how to build it

**The finished videos:** [`final/madad-intro.he.mp4`](final/madad-intro.he.mp4)
and [`final/madad-intro.en.mp4`](final/madad-intro.en.mp4), each with its
captions beside it as `.srt` for the YouTube upload.
`final/` holds only finished videos; it is not in git — share the file from
there, or build it as below.

What the video is and why it looks the way it does: [`SPEC.md`](SPEC.md).
How the method works, for someone starting their own:
[`../PRODUCT-VIDEO-PLAYBOOK.md`](../PRODUCT-VIDEO-PLAYBOOK.md).

## Build

From the repo root, on branch `remote`:

```bash
bash docs/video/intro/build.sh               # everything (~10 min)
bash docs/video/intro/build.sh --no-record   # only picture/sound changes (~3 min)
bash docs/video/intro/build.sh --lang en     # the English video (same flags)
```

What differs per language is in [`langs.json`](langs.json): the script, the
narration folder, the cues file, the take and output folders (English never
overwrites the Hebrew build), the transcriber, the speaking rate and the
session data. The English video mirrors the layout: the therapist's phone is
on the left and the story reads left to right. The app is recorded in English.
The email is an English rendering of the real (Hebrew-only) notification, in
`clips.mjs`.

It prints the path of the finished video at the end.

### Transcriber (only for new recordings)

The word timings come from faster-whisper with ivrit.ai's Hebrew model,
installed outside the repo (≈1.6 GB) at `~/.local/share/madad-video/asr`
(English: Systran's `faster-distil-whisper-large-v3` in `…/asr-en/model`,
sharing the same venv);
`build.sh` finds it there. Without it, builds use the cached timings
(`narration/he/*.words.json`, `cues.json`), which is fine until a take
changes. To install it:

```bash
D=~/.local/share/madad-video/asr; mkdir -p $D && cd $D
python3 -m venv --without-pip venv && curl -sSL https://bootstrap.pypa.io/get-pip.py | venv/bin/python
venv/bin/pip install faster-whisper
venv/bin/python -c "from huggingface_hub import snapshot_download as d; d('ivrit-ai/whisper-large-v3-turbo-ct2', local_dir='model')"
```

## Where things go

| What | Where | In git |
|---|---|---|
| The script (Hebrew / English) | `SCRIPT.he.docx`, `SCRIPT.en.docx` | yes |
| Narration, current Hebrew takes (+ their cached word timings) | `narration/he/01-composer.m4a` … `08-closing.m4a` (any audio format; named by scene) | **yes** |
| Older takes | `narration/archive/<date>-<name>/` | no |
| Music + its licence certificate | `music/` — never committed: Pixabay's licence forbids distributing the file on its own | no |
| Recorded screen takes | `raw/clips/<scene>/` — **rebuilt on every record; never save anything here** | no |
| Intermediate files | `out/` | no |
| **The finished video + captions** | **`final/madad-intro.he.mp4`**, `final/madad-intro.he.srt` | no |

## After changing something

| You changed… | Do |
|---|---|
| The script wording, not yet re-recorded | `build.sh` — changed lines play as captions only, the old voice is muted there |
| The narration (new takes in `narration/he/`) | `build.sh` |
| Caption breaks (`|` in the script) only | `build.sh --no-record` |
| The app (UI, content) | `build.sh` — recording always uses a fresh build |
| Music | replace the file in `music/`, update `DEFAULT_MUSIC` in `mix.py`, `build.sh --no-record` |

The steps `build.sh` runs, for running one by hand: `cues.mjs --from-audio`
→ `clips.mjs [scene …]` → `sfx.sh` → `assemble.py` → `mix.py`.
