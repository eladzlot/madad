#!/usr/bin/env bash
# Synthesised sound effects for the intro video (SPEC.md §8) — no licences.
# Writes out/sfx/{ping,click,key0..3}.wav. Run before mix.py.
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/out/sfx"; mkdir -p "$OUT"
gen() { ffmpeg -v error -y -f lavfi -i "aevalsrc='$1':s=48000:d=$2" -af "$3" -ac 2 "$OUT/$4"; }
# Email ping: a soft two-note chime, C6 then G6.
gen "0.34*(sin(2*PI*1046.5*t)+0.3*sin(2*PI*2093*t))*exp(-9*t)*min(1\,t*200) + 0.30*gte(t\,0.11)*(sin(2*PI*1568*(t-0.11))+0.25*sin(2*PI*3136*(t-0.11)))*exp(-7*(t-0.11))*min(1\,(t-0.11)*200)" \
    0.9 "afade=t=out:st=0.7:d=0.2" ping.wav
# Tap: a mechanical 'tchick' — two short noise transients (press, release), a faint low thump, no tone.
gen "0.62*(random(1)*2-1)*exp(-900*t) + 0.36*gte(t\,0.012)*(random(2)*2-1)*exp(-1100*(t-0.012)) + 0.22*sin(2*PI*170*t)*exp(-130*t)" \
    0.06 "highpass=f=120,equalizer=f=2300:t=q:w=1.2:g=4,lowpass=f=5500,afade=t=out:st=0.045:d=0.015" click.wav
# Keys: a soft typewriter strike over a low body, four variants used in rotation.
for k in 0 1 2 3; do
  gen "min(1\,t*3000)*(0.30*(random($k)*2-1)*exp(-420*t) + 0.42*sin(2*PI*$((185 + 17 * k))*t)*exp(-75*t) + 0.14*gte(t\,0.013)*(random($((k + 7)))*2-1)*exp(-520*(t-0.013)))" \
      0.09 "highpass=f=110,lowpass=f=$((4200 + 250 * k)),afade=t=out:st=0.07:d=0.02" key$k.wav
done
ls "$OUT"
