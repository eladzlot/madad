#!/usr/bin/env python3
"""Picture for the intro video from raw/clips + cues.json (SPEC.md §6):
the CTR opening card, each scene's take on the cue timeline in its role's
phone frame, the closing recap and end card, captions from the script's
" | " breaks, and the small CTR logo in the corner. No audio — mix.py adds it.

    python3 guides/video/intro/assemble.py [--lang en]   →  out/video.mp4, out/timeline.json
                                                          (out/en/ for English; langs.json)
"""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.dirname(os.path.abspath(__file__)) + '/../../..')
INTRO = os.path.dirname(os.path.abspath(__file__))
LANG_ID = sys.argv[sys.argv.index('--lang') + 1] if '--lang' in sys.argv else 'he'
LANG = json.load(open(f'{INTRO}/langs.json'))[LANG_ID]
RTL = LANG['dir'] == 'rtl'
CLIPS = f"{INTRO}/{LANG['clips']}"
OUT = f"{INTRO}/{LANG['out']}"
FONTS = f'{REPO}/public/fonts'
os.makedirs(OUT, exist_ok=True)
CUES = json.load(open(f"{INTRO}/{LANG['cues']}"))['scenes']

W, H = 1920, 1080
PW, PH = 587, 1000                       # phone screen on the canvas (1170x1992 source / ~2)
# The story reads in the language's direction: in Hebrew the therapist is right
# of centre and the patient left; in English the reverse.
_side = 1 if RTL else -1
ROLE = {'therapist': dict(cx=W // 2 + 200 * _side, bezel=(29, 38, 34)), 'patient': dict(cx=W // 2 - 200 * _side, bezel=(174, 214, 184))}
SCENE_ROLE = {'04-patient': 'patient'}
BG = (238, 243, 239)


def frame_png(role):
    """Bezel overlay with a transparent rounded screen hole, and the screen mask."""
    r = ROLE[role]; x0 = r['cx'] - PW // 2; y0 = (H - PH) // 2; B, RAD = 14, 46
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0 - B, y0 - B, x0 + PW + B, y0 + PH + B), radius=RAD + B, fill=r['bezel'] + (255,))
    hole = Image.new('L', (W, H), 0); ImageDraw.Draw(hole).rounded_rectangle((x0, y0, x0 + PW, y0 + PH), radius=RAD, fill=255)
    im.putalpha(Image.composite(Image.new('L', (W, H), 0), im.getchannel('A'), hole))
    im.save(f'{OUT}/bezel-{role}.png')
    m = Image.new('L', (PW, PH), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, PW - 1, PH - 1), radius=RAD, fill=255)
    m.save(f'{OUT}/mask.png')
    return x0, y0


def concat_list(take_dir, duration, name, start=0.0):
    """Frames → ffmpeg concat list on scene time (k and cuts undone), for the
    window [start, start + duration) of the take."""
    t = json.load(open(f'{take_dir}/take.json')); fr = json.load(open(f'{take_dir}/frames.json'))
    k, t0, cuts = t['k'], t['t0'], t['cuts']
    def scene(tr):
        real = tr - t0
        for c in cuts:
            real -= max(0, min(tr, c['to']) - c['from'])
        return real / k
    frs = sorted(fr, key=lambda f: f['t'])
    # Frames inside a cut are dropped, except the last one: it is the state
    # at the moment the cut ends (the screencast only sends frames on change,
    # so a screen that is already still after the cut sends none).
    keep = []
    for f in frs:
        c = next((c for c in cuts if c['from'] <= f['t'] < c['to']), None)
        if c is None:
            keep.append(f)
        elif not any(c['from'] <= g['t'] < c['to'] and g['t'] > f['t'] for g in frs):
            keep.append({**f, 't': c['to']})
    pts = [(scene(f['t']), f['file']) for f in sorted(keep, key=lambda f: f['t'])]
    first = max([i for i, (s, _) in enumerate(pts) if s <= start] or [0])
    pts = [(max(0.0, s - start), f) for s, f in pts[first:] if s < start + duration]
    lines = []
    for i, (s, f) in enumerate(pts):
        e = pts[i + 1][0] if i + 1 < len(pts) else duration
        lines.append(f"file '{take_dir}/{f}'\nduration {max(e - s, 0.001):.4f}")
    lines.append(f"file '{take_dir}/{pts[-1][1]}'")
    open(f'{OUT}/{name}.txt', 'w').write('\n'.join(lines) + '\n')


def encode_phone(listfile, role, duration, out):
    x0, y0 = frame_png(role)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listfile,
                    '-loop', '1', '-t', f'{duration:.3f}', '-i', f'{OUT}/mask.png', '-loop', '1', '-t', f'{duration:.3f}', '-i', f'{OUT}/bezel-{role}.png',
                    '-filter_complex',
                    f'[0:v]fps=30,scale={PW}:{PH}:flags=lanczos,format=rgba[ph];[1:v]format=gray,fps=30[m];'
                    f'[ph][m]alphamerge[p];color=c=0x{"%02X%02X%02X" % BG}:s={W}x{H}:r=30[bg];'
                    f'[bg][p]overlay={x0}:{y0}:shortest=1[a];[a][2:v]overlay=0:0,format=yuv420p[o]',
                    '-map', '[o]', '-t', f'{duration:.3f}', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-r', '30', out],
                   check=True)


def frame_at(take_dir, event, after=0.0):
    """The PNG on screen `after` scene-seconds past a take's event."""
    t = json.load(open(f'{take_dir}/take.json')); fr = sorted(json.load(open(f'{take_dir}/frames.json')), key=lambda f: f['t'])
    ev = next(e['t'] for e in t['events'] if e['name'] == event)
    real = t['t0'] + (ev + after) * t['k']
    for c in t['cuts']:
        if c['from'] < real: real += c['to'] - c['from']
    return f"{take_dir}/{[f for f in fr if f['t'] <= real][-1]['file']}"


def still_phone(png, role, duration, out):
    """A held frame in its role's phone, for the closing recap."""
    lst = f'{out}.txt'
    open(lst, 'w').write(f"file '{png}'\nduration {duration:.3f}\nfile '{png}'\n")
    encode_phone(lst, role, duration, out)


def phone_png(src, role, pw, out):
    """A still phone (screen + mask + role bezel) as a transparent PNG, pw wide."""
    ph = round(pw * 1992 / 1170); B = max(8, pw // 42); RAD = pw * 46 // 587
    scr = Image.open(src).convert('RGB').resize((pw, ph), Image.LANCZOS)
    im = Image.new('RGBA', (pw + 2 * B, ph + 2 * B), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, pw + 2 * B - 1, ph + 2 * B - 1), radius=RAD + B, fill=ROLE[role]['bezel'] + (255,))
    m = Image.new('L', (pw, ph), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=RAD, fill=255)
    im.paste(scr, (B, B), m)
    im.save(out)
    return im.size


def recap(sc, out):
    """Scene 8: the three stages side by side, right to left (send → fill →
    summary), each fading and rising in on its phrase and then staying;
    then the end card."""
    words = [w for l in sc['lines'] for w in l['words']]
    norm = lambda w: ''.join(ch for ch in w if ch.isalnum())
    def at(w, default):
        hit = next((x for x in words if norm(x['w']) == w), None)
        return hit['start'] if hit else default
    line = sc['lines'][0]; third = (line['end'] - line['start']) / 3
    a2, a3 = ('המטופל', 'והתוצאות') if LANG_ID == 'he' else ('patient', 'results')
    t2 = at(a2, line['start'] + third) - 0.1
    t3 = at(a3, line['start'] + 2 * third) - 0.1
    t4 = sc['cues']['END-CARD']
    n_last = max(int(n[1:]) for n in os.listdir(f'{CLIPS}/07-weeks') if n.startswith('n'))
    shots = [
        (frame_at(f'{CLIPS}/03-qr', 'qr-open', 0.8), 'therapist', 0.0),                       # send: the patient's QR
        (frame_at(f'{CLIPS}/04-patient', 'answer-1', -0.6), 'patient', t2),                  # fill: a question
        (frame_at(f'{CLIPS}/07-weeks/n{n_last}', 'end'), 'therapist', t3),                   # summary: every week
    ]
    PW3, GAP = 400, 90
    inputs, fc, last = [], f'color=c=0x{"%02X%02X%02X" % BG}:s={W}x{H}:r=30:d={t4:.3f}[b0];', 'b0'
    for i, (src, role, ts) in enumerate(shots):
        w, h = phone_png(src, role, PW3, f'{OUT}/recap{i}.png')
        x = W // 2 + (1 - i) * _side * (w + GAP) - w // 2  # in reading order: RTL i=0 right, LTR i=0 left
        y = 125                                         # clear of the corner logo
        inputs += ['-loop', '1', '-t', f'{t4:.3f}', '-i', f'{OUT}/recap{i}.png']
        fc += (f'[{i}:v]format=rgba,fade=t=in:st={ts:.3f}:d=0.35:alpha=1[p{i}];'
               f"[{last}][p{i}]overlay=x={x}:y='{y}+36*(1-min(1\,max(0\,(t-{ts:.3f})/0.35)))':enable='gte(t\,{ts:.3f})'[b{i + 1}];")
        last = f'b{i + 1}'
    fc += f'[{last}]format=yuv420p[o]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc, '-map', '[o]', '-t', f'{t4:.3f}',
                    '-r', '30', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', f'{OUT}/08-recap.mp4'], check=True)
    end_card(sc['duration'] - t4, f'{OUT}/08-endcard.mp4')
    return [(f'{OUT}/08-recap.mp4', t4), (f'{OUT}/08-endcard.mp4', sc['duration'] - t4)]


def end_card(duration, out):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    mid = ImageFont.truetype(f'{FONTS}/NotoSansHebrew-Regular.ttf', 46)
    qr = Image.open(f'{REPO}/guides/therapist/images/00-composer-qr.png').convert('RGB').resize((380, 380))
    # The Madad mark ("מדד | Madad" over the ticked rule, from brand/ on
    # main; assets/madad-mark.svg is its source, the PNG is cropped to the ink).
    mark = Image.open(f'{INTRO}/assets/madad-mark@4x.png').convert('RGBA')
    mw = 560; mark = mark.resize((mw, round(mark.height * mw / mark.width)), Image.LANCZOS)
    if RTL:
        im.paste(qr, (W // 2 - 190 - 330, H // 2 - 190))
        im.paste(mark, (W // 2 + 520 - mw, H // 2 - 170 - mark.height // 2), mark)
        d.text((W // 2 + 520, H // 2 + 10), 'סרקו או היכנסו:', font=mid, fill=(29, 38, 34), anchor='rm', direction='rtl')
        d.text((W // 2 + 520, H // 2 + 90), 'ctrmadad.com/composer', font=mid, fill=(50, 97, 142), anchor='rm')
    else:
        # Mirrored: the words on the left, the code on the right.
        im.paste(qr, (W // 2 + 330 - 190, H // 2 - 190))
        im.paste(mark, (W // 2 - 520, H // 2 - 170 - mark.height // 2), mark)
        d.text((W // 2 - 520, H // 2 + 10), 'Scan or go to:', font=mid, fill=(29, 38, 34), anchor='lm')
        d.text((W // 2 - 520, H // 2 + 90), 'ctrmadad.com/composer', font=mid, fill=(50, 97, 142), anchor='lm')
    im.save(f'{OUT}/endcard.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-t', f'{duration:.3f}', '-i', f'{OUT}/endcard.png',
                    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', out], check=True)


OPEN = 2.5    # CTR opening card, music only


def opening_card(out):
    logo = Image.open(f'{INTRO}/assets/ctr-lockup@4x.png').convert('RGBA')
    w = 980; logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
    im = Image.new('RGB', (W, H), BG); im.paste(logo, ((W - w) // 2, (H - logo.height) // 2), logo)
    im.save(f'{OUT}/opening.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-t', f'{OPEN}', '-i', f'{OUT}/opening.png',
                    '-vf', f'fps=30,fade=t=in:st=0:d=0.5:color=0x{"%02X%02X%02X" % BG},fade=t=out:st={OPEN - 0.45}:d=0.45:color=0x{"%02X%02X%02X" % BG},format=yuv420p',
                    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', out], check=True)


opening_card(f'{OUT}/00-opening.mp4')
MAX_CHARS = 26


def by_breaks(line, parts):
    """Word groups for a line from its break list (word counts, in order)."""
    groups, i = [], 0
    for p in parts:
        n = len(p.split())
        groups.append(line['words'][i:i + n]); i += n
    assert i == len(line['words']), f'breaks do not cover: {line["text"]}'
    return groups


def chunks(line, parts=None):
    """Split a narration line into short caption phrases: at , . : ; ? ! first;
    a lone short word joins the phrase after it; a phrase over MAX_CHARS is
    split into balanced parts at word boundaries. Each shows from its first
    word until the next one starts (or its last word ends + 0.35 s)."""
    txt = lambda g: ' '.join(x['w'] for x in g)
    if parts:
        groups = by_breaks(line, parts)
        return timed(groups)
    phrases, cur = [], []
    for w in line['words']:
        cur.append(w)
        if re.search(r'[,.:;?!]["”]?$', w['w']):
            phrases.append(cur); cur = []
    if cur: phrases.append(cur)
    merged = []
    for ph in phrases:
        if merged and len(merged[-1]) == 1 and len(txt(merged[-1])) <= 8:
            merged[-1] = merged[-1] + ph
        else:
            merged.append(ph)
    groups = []
    for ph in merged:
        n = -(-len(txt(ph)) // MAX_CHARS)          # parts needed
        if n <= 1:
            groups.append(ph); continue
        target, part, acc = len(txt(ph)) / n, [], 0
        for i, w in enumerate(ph):
            part.append(w); acc += len(w['w']) + 1
            left = len(ph) - i - 1
            if acc >= target and left and len(part) >= 2:
                groups.append(part); part, acc = [], 0
        if part: groups.append(part)
    return timed(groups)


def timed(groups):
    """(start, end, text) per group; end-of-caption punctuation dropped."""
    out = []
    for i, g in enumerate(groups):
        end = groups[i + 1][0]['start'] if i + 1 < len(groups) else g[-1]['end'] + 0.35
        text = re.sub(r'[,.:;]+$', '', ' '.join(x['w'] for x in g))
        out.append((g[0]['start'], end, text))
    return out


offset, captions = OPEN, []
starts = {}
# Transitions (SPEC §6): each is centred on its cut point and eats into held
# frames on either side, so no part changes length and the picture stays in
# sync with the narration. kind is an ffmpeg xfade transition, or None for a
# hard cut.
FADE_IN = ('fade', 0.4)        # opening card → scene 1, into the recap, recap → end card
SAME_PHONE = ('fade', 0.2)     # therapist scene → therapist scene: the frame stays, the screen dissolves
# The phones trade places, moving the way the language reads.
ROLE_IN = ({'patient': ('slideleft', 0.35), 'therapist': ('slideright', 0.35)} if RTL
           else {'patient': ('slideright', 0.35), 'therapist': ('slideleft', 0.35)})
CUT_JUMP = ('fade', 0.25)      # the patient's off-camera answering
WEEK = ('fade', 0.3)           # week to week, and into the views

parts = [(f'{OUT}/00-opening.mp4', OPEN, None)]
prev_role = None
for sid, sc in CUES.items():
    dur = sc['duration']; role = SCENE_ROLE.get(sid, 'therapist')
    starts[sid] = offset
    if prev_role is None:
        into = FADE_IN
    elif sid == '08-closing':
        into = FADE_IN
    elif role != prev_role:
        into = ROLE_IN[role]
    else:
        into = SAME_PHONE
    if sid == '07-weeks':
        # The weekly takes share the scene up to MORE-VIEWS; the views take
        # (item map, table) runs from there to the end.
        subs = sorted((n for n in os.listdir(f'{CLIPS}/07-weeks') if n.startswith('n')), key=lambda n: int(n[1:]))
        has_views = os.path.exists(f'{CLIPS}/07-weeks/views/take.json')
        t_views = sc['cues']['MORE-VIEWS'] if has_views else dur
        each = t_views / len(subs)
        for j, n in enumerate(subs):
            concat_list(f'{CLIPS}/07-weeks/{n}', each, f'07-{n}')
            encode_phone(f'{OUT}/07-{n}.txt', role, each, f'{OUT}/07-{n}.mp4')
            parts.append((f'{OUT}/07-{n}.mp4', each, into if j == 0 else WEEK))
        if has_views:
            concat_list(f'{CLIPS}/07-weeks/views', dur - t_views, '07-views')
            encode_phone(f'{OUT}/07-views.txt', role, dur - t_views, f'{OUT}/07-views.mp4')
            parts.append((f'{OUT}/07-views.mp4', dur - t_views, WEEK))
    elif sid == '08-closing':
        (rf, rd), (ef, ed) = recap(sc, f'{OUT}/{sid}.mp4')
        parts += [(rf, rd, into), (ef, ed, FADE_IN)]
    else:
        take = json.load(open(f'{CLIPS}/{sid}/take.json'))
        cut_at = next((e['t'] for e in take['events'] if e['name'] == 'resume'), None)
        if cut_at is not None:
            # Split at the cut: the jump over the off-camera part dissolves.
            concat_list(f'{CLIPS}/{sid}', cut_at, f'{sid}-a')
            encode_phone(f'{OUT}/{sid}-a.txt', role, cut_at, f'{OUT}/{sid}-a.mp4')
            concat_list(f'{CLIPS}/{sid}', dur - cut_at, f'{sid}-b', start=cut_at)
            encode_phone(f'{OUT}/{sid}-b.txt', role, dur - cut_at, f'{OUT}/{sid}-b.mp4')
            parts += [(f'{OUT}/{sid}-a.mp4', cut_at, into), (f'{OUT}/{sid}-b.mp4', dur - cut_at, CUT_JUMP)]
        else:
            concat_list(f'{CLIPS}/{sid}', dur, sid)
            encode_phone(f'{OUT}/{sid}.txt', role, dur, f'{OUT}/{sid}.mp4')
            parts.append((f'{OUT}/{sid}.mp4', dur, into))
    prev_role = role
    if sid == '08-closing':
        # Recap: the phones fill the width, so every closing line sits bottom centre.
        for li, l in enumerate(sc['lines']):
            captions += [(offset + a, offset + b, 'B', t) for a, b, t in chunks(l, l.get('captions'))]
    else:
        # Captions sit on the side away from the phone.
        side = ('L' if role == 'therapist' else 'R') if RTL else ('R' if role == 'therapist' else 'L')
        for li, l in enumerate(sc['lines']):
            captions += [(offset + a, offset + b, side, t) for a, b, t in chunks(l, l.get('captions'))]
    offset += dur

# Captions: on the side away from the phone, two lines max (libass wraps).
def ts(t):
    return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'
# Never two captions on screen in the same place: libass would stack them and
# one would jump a row. Each caption ends where the next one on its side
# starts (a line's last phrase lingers 0.35 s, the next line can start sooner).
captions.sort()
for i, (a, b, side, t) in enumerate(captions):
    nxt = next((c[0] for c in captions[i + 1:] if c[2] == side), None)
    if nxt is not None and b > nxt - 0.02:
        captions[i] = (a, nxt - 0.02, side, t)

ass = ['[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}', 'WrapStyle: 2', '',
       '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       # therapist phone right → caption block on the left, right-aligned to x≈820
       'Style: L,Noto Sans Hebrew,64,&H00302622,&H00302622,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,40,1100,0,-1',
       # patient phone left → caption block on the right
       'Style: R,Noto Sans Hebrew,64,&H00302622,&H00302622,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,1100,40,0,-1',
       # end card: bottom centre, clear of the QR
       'Style: B,Noto Sans Hebrew,62,&H00302622,&H00302622,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,200,200,70,-1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
# Every caption keeps its column's size: a phrase too wide for the column is
# not shrunk (sizes that change from caption to caption read badly) but
# reported, to be fixed with a | break in the script.
_COL = {'L': (64, 780), 'R': (64, 780), 'B': (62, 1500)}
for s, e, side, text in captions:
    size, width = _COL[side]
    if ImageFont.truetype(f'{FONTS}/NotoSansHebrew-Regular.ttf', size).getlength(text) > width:
        print(f'  ! caption too wide for its column, add a | break in the script: "{text}"')
    ass.append(f'Dialogue: 0,{ts(s)},{ts(e)},{side},,0,0,0,,{text}')
open(f'{OUT}/captions.ass', 'w', encoding='utf-8').write('\n'.join(ass) + '\n')

# The same captions as .srt, beside the finished video (for the YouTube upload).
def srt_ts(t):
    ms = round(t * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
os.makedirs(f'{INTRO}/final', exist_ok=True)
with open(f"{INTRO}/{LANG['final']}.srt", 'w', encoding='utf-8') as srt:
    for n, (a, b, _side, text) in enumerate(captions, 1):
        srt.write(f'{n}\n{srt_ts(a)} --> {srt_ts(b)}\n{text}\n\n')

_logo = Image.open(f'{INTRO}/assets/ctr-lockup@4x.png').convert('RGBA')
_logo.resize((240, round(_logo.height * 240 / _logo.width)), Image.LANCZOS).save(f'{OUT}/logo-small.png')
def join(parts, out):
    """One video from (file, length, transition-before) parts. Each part is
    padded with its own held first/last frame by half of the transitions
    around it; each transition then starts half its length before the cut."""
    inputs, fc = [], ''
    for i, (f, d, into) in enumerate(parts):
        inputs += ['-i', f]
        ps = into[1] / 2 if (i and into) else 0
        nxt = parts[i + 1][2] if i + 1 < len(parts) else None
        pe = nxt[1] / 2 if nxt else 0
        fc += (f'[{i}:v]trim=0:{d:.3f},setpts=PTS-STARTPTS,'
               f'tpad=start_mode=clone:start_duration={ps:.3f}:stop_mode=clone:stop_duration={pe:.3f},'
               f'fps=30,settb=AVTB,format=yuv420p[p{i}];')
    acc, length = 'p0', parts[0][1] + (parts[1][2][1] / 2 if len(parts) > 1 and parts[1][2] else 0)
    for i in range(1, len(parts)):
        f, d, into = parts[i]
        ps = into[1] / 2 if into else 0
        nxt = parts[i + 1][2] if i + 1 < len(parts) else None
        pe = nxt[1] / 2 if nxt else 0
        if into:
            kind, td = into
            fc += f'[{acc}][p{i}]xfade=transition={kind}:duration={td:.3f}:offset={length - td:.3f}[j{i}];'
            length += d + ps + pe - td
        else:
            fc += f'[{acc}][p{i}]concat=n=2:v=1:a=0[j{i}];'
            length += d + pe
        acc = f'j{i}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc.rstrip(';'), '-map', f'[{acc}]',
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-r', '30', out], check=True)
    return length


joined_len = join(parts, f'{OUT}/joined.mp4')
assert abs(joined_len - offset) < 0.1, (joined_len, offset)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{OUT}/joined.mp4',
                '-i', f'{OUT}/logo-small.png',
                '-filter_complex', f"[0:v]subtitles={OUT}/captions.ass:fontsdir={FONTS}[s];[s][1:v]overlay=x=W-w-44:y=34:enable='gte(t\\,{OPEN})'",
                '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                '-r', '30', f'{OUT}/video.mp4'], check=True)

json.dump({'open': OPEN, 'starts': starts, 'total': offset}, open(f'{OUT}/timeline.json', 'w'))
print(f'{OUT}/video.mp4', f'{offset:.1f} s')
