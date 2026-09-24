#!/usr/bin/env python3
"""Sound for the intro video, onto out/video.mp4 (SPEC.md §8): the
narration placed at each scene's start, the music ducked under it and
dipped for the alert beat, the email ping, a click per tap and a soft key
per keystroke (sounds from sfx.sh).

    python3 guides/video/intro/mix.py [music.mp3]   →  out/madad-intro.mp4
"""
import json, os, subprocess, sys
INTRO = os.path.dirname(os.path.abspath(__file__)); OUT = f'{INTRO}/out'; SFX = f'{OUT}/sfx'
tl = json.load(open(f'{OUT}/timeline.json')); cues = json.load(open(f'{INTRO}/cues.json'))['scenes']
total, st = tl['total'], tl['starts']
ping_ev = next(e['t'] for e in json.load(open(f'{INTRO}/raw/clips/05-email/take.json'))['events'] if e['name'] == 'ping')
ping_at = st['05-email'] + ping_ev
dip_a = st['06-summary'] + cues['06-summary']['cues']['PHQ-ALERT'] - 0.9      # music drops out for the alert
dip_b = st['07-weeks'] - 0.2                                                 # and returns with the weeks
vol = f"1-0.85*clip((t-{dip_a:.2f})/0.8\\,0\\,1)+0.85*clip((t-{dip_b:.2f})/1.2\\,0\\,1)"
# Tap clicks: every tap the recorder logged, at the press (the take's event
# is marked as the finger lands, after the 250 ms ring lead).
TAPS = {'tap-search', 'battery-picked', 'tap-enter-id', 'tap-qr', 'tap-begin', 'tap-continue',
        'answer-1', 'answer-2', 'open-mail', 'tap-link', 'tap-point'}
clicks, keys = [], []
for sid in st:
    tj = f'{INTRO}/raw/clips/{sid}/take.json'
    if os.path.exists(tj):
        ev = json.load(open(tj))['events']
        clicks += [st[sid] + e['t'] for e in ev if e['name'] in TAPS]
        keys += [st[sid] + e['t'] for e in ev if e['name'] == 'key']   # soft typewriter keys

# Narration: every scene that has a recording, placed at the scene's start.
voices = [(sid, f"{INTRO}/{sc['audio']}") for sid, sc in cues.items() if sc.get('source') == 'audio']
DEFAULT_MUSIC = f'{INTRO}/music/alex-morgan-corporate-strategy-presentation-music-583279.mp3'   # Pixabay, chosen 2026-09-24
for track in sys.argv[1:] or [DEFAULT_MUSIC]:
    out = f'{OUT}/madad-intro.mp4'
    inputs = ['-i', f'{OUT}/video.mp4', '-i', track, '-i', f'{SFX}/ping.wav', '-i', f'{SFX}/click.wav']
    inputs += sum((['-i', f'{SFX}/key{k}.wav'] for k in range(4)), [])
    for _, f in voices: inputs += ['-i', f]
    fc = (f"[1:a]atrim=0:{total:.2f},asetpts=PTS-STARTPTS,loudnorm=I=-20:TP=-2:LRA=11,volume='{vol}':eval=frame,"
          f"afade=t=in:st=0:d=1.2,afade=t=out:st={total - 3:.2f}:d=3,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[m];"
          f"[2:a]adelay={int(ping_at * 1000)}|{int(ping_at * 1000)},volume=0.9,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad[p];")
    if voices:
        for i, (sid, _) in enumerate(voices):
            d = int(st[sid] * 1000)
            fc += f"[{8 + i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay={d}|{d},apad[v{i}];"
        fc += ''.join(f'[v{i}]' for i in range(len(voices))) + f"amix=inputs={len(voices)}:duration=longest:normalize=0,asplit=2[voice][key];"
        # Duck the music under the voice (SPEC §8).
        fc += "[m][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md];"
        n = len(clicks)
        fc += f"[3:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.5,asplit={n}" + ''.join(f'[c{i}]' for i in range(n)) + ';'
        for i, t in enumerate(clicks):
            fc += f"[c{i}]adelay={int(t * 1000)}|{int(t * 1000)},apad[cd{i}];"
        # Keys: four variants in rotation, so the typing doesn't repeat one sample.
        for k in range(4):
            mine = [t for j, t in enumerate(keys) if j % 4 == k]
            if not mine: continue
            fc += f"[{4 + k}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.32,asplit={len(mine)}" + ''.join(f'[k{k}_{j}]' for j in range(len(mine))) + ';'
            for j, t in enumerate(mine):
                fc += f"[k{k}_{j}]adelay={int(t * 1000)}|{int(t * 1000)},apad[kd{k}_{j}];"
        kd = [f'[kd{k}_{j}]' for k in range(4) for j in range(len([t for i, t in enumerate(keys) if i % 4 == k]))]
        fc += ''.join(f'[cd{i}]' for i in range(n)) + ''.join(kd) + f"amix=inputs={n + len(kd)}:duration=longest:normalize=0[clk];"
        fc += "[md][voice][p][clk]amix=inputs=4:duration=first:normalize=0[a]"
    else:
        fc += "[m][p]amix=inputs=2:duration=first:normalize=0[a]"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc,
        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', f'{total:.3f}', out], check=True)
    print(out, f'ping at {ping_at:.2f} s, {len(clicks)} clicks, {len(keys)} keys, dip {dip_a:.1f}–{dip_b:.1f} s, voices: {len(voices)}')
