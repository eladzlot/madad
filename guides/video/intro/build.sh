#!/usr/bin/env bash
# Build the intro video, end to end.
#
#   bash guides/video/intro/build.sh                # Hebrew: cues, record, assemble, mix
#   bash guides/video/intro/build.sh --lang en      # English (langs.json)
#   bash guides/video/intro/build.sh --no-record    # reuse the recorded clips (picture/sound changes only)
#
# The finished video:  guides/video/intro/final/madad-intro.<lang>.mp4
#
# Needs (see README.md): the repo on branch `remote`; ffmpeg; the music in
# music/ (not in git — licence). The transcriber is found in
# ~/.local/share/madad-video/asr (or MADAD_ASR_PYTHON / MADAD_ASR_MODEL);
# without it the cached timings are used.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$ROOT"
V=guides/video/intro
RECORD=1; LANG_ID=he
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-record) RECORD=0 ;;
    --lang) LANG_ID="$2"; shift ;;
  esac
  shift
done
L="--lang $LANG_ID"
ASR_DIR=$(python3 -c "import json;print(json.load(open('$V/langs.json'))['$LANG_ID']['asr'])")

step() { printf '\n── %s\n' "$*"; }

step "1/5  cues from the narration"
# The transcriber lives outside the repo (README.md, "Transcriber"); these are
# its default places. Environment variables override them.
ASR="$HOME/.local/share/madad-video/$ASR_DIR"
[[ -z "${MADAD_ASR_PYTHON:-}" && -x "$ASR/venv/bin/python" ]] && export MADAD_ASR_PYTHON="$ASR/venv/bin/python"
[[ -z "${MADAD_ASR_MODEL:-}" && -d "$ASR/model" ]] && export MADAD_ASR_MODEL="$ASR/model"
if [[ -n "${MADAD_ASR_PYTHON:-}" && -n "${MADAD_ASR_MODEL:-}" ]]; then
  node $V/cues.mjs --from-audio $L
else
  echo "MADAD_ASR_PYTHON / MADAD_ASR_MODEL not set — using the existing $V/cues.json"
fi

PREVIEW_PID=""
if [[ $RECORD == 1 ]]; then
  step "2/5  record the clips (production preview on :4173)"
  # Always rebuild: the preview serves dist/ from disk, so a server that is
  # already running picks the fresh build up too.
  npm run build >/dev/null
  if ! curl -sf -o /dev/null http://localhost:4173/composer/; then
    npx vite preview --port 4173 --strictPort --base=/ >/dev/null 2>&1 & PREVIEW_PID=$!
    trap '[[ -n "$PREVIEW_PID" ]] && kill $PREVIEW_PID 2>/dev/null' EXIT
    until curl -sf -o /dev/null http://localhost:4173/composer/; do sleep 0.5; done
  fi
  node $V/clips.mjs $L
else
  step "2/5  record the clips — skipped (--no-record)"
fi

step "3/5  sound effects";      bash $V/sfx.sh >/dev/null
step "4/5  picture";            python3 $V/assemble.py $L
step "5/5  sound";              python3 $V/mix.py $L

FINAL="$ROOT/$V/final/madad-intro.$LANG_ID.mp4"
printf '\n✓ The video is ready:\n  %s\n' "$FINAL"
