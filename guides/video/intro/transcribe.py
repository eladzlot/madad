#!/usr/bin/env python3
"""Word timings for a narration file, as JSON on stdout.

    transcribe.py <audio> [--prompt "<the scene's script text>"]

Needs faster-whisper and a Hebrew Whisper model (ivrit.ai's
whisper-large-v3-turbo-ct2). Paths come from the environment:
MADAD_ASR_MODEL (model directory). Run it with the Python that has
faster-whisper installed; cues.mjs finds that via MADAD_ASR_PYTHON.

Output: {"duration": s, "words": [{"w": str, "start": s, "end": s, "p": prob}]}
The script text is passed as the initial prompt so spelling and punctuation
lean towards the script; timing is what we take from Whisper, never the text.
"""
import json, os, sys
from faster_whisper import WhisperModel

audio = sys.argv[1]
prompt = sys.argv[sys.argv.index('--prompt') + 1] if '--prompt' in sys.argv else None
model = WhisperModel(os.environ['MADAD_ASR_MODEL'], device='cpu', compute_type='int8')
segments, info = model.transcribe(audio, language='he', word_timestamps=True, initial_prompt=prompt,
                                  vad_filter=False, beam_size=5)
words = [{'w': w.word.strip(), 'start': round(w.start, 3), 'end': round(w.end, 3), 'p': round(w.probability, 3)}
         for s in segments for w in (s.words or [])]
json.dump({'duration': round(info.duration, 3), 'words': words}, sys.stdout, ensure_ascii=False)
