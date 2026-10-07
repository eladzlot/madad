// cues.mjs — SCRIPT.<lang>.docx → cues.json: when each cue and each word
// falls, in seconds from the start of its scene's narration file.
//
//   node docs/video/intro/cues.mjs --estimate     placeholder timings from word counts
//   node docs/video/intro/cues.mjs --from-audio   from narration/<lang>/<scene>.* via Whisper;
//                                                   scenes without a recording keep the estimate
//   … --lang en                                     the English video (langs.json; default he)
//
// --from-audio runs transcribe.py (faster-whisper) with MADAD_ASR_PYTHON and
// MADAD_ASR_MODEL from the environment, and caches each result next to its
// audio as <scene>.words.json (redone when the audio is newer).
//
// The script is read by paragraph style (SPEC.md §1): Heading 2 starts a
// scene (in order: SCENES below), "Narration" is spoken text, "Cue" is a
// [SYNC-POINT] marker. Everything else is direction and ignored. Inside a
// Narration line, " | " marks a caption break: never spoken, stripped before
// matching, kept as each line's `captions` (the phrases shown one by one).
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';

const HERE = new URL('.', import.meta.url).pathname;
// The language (langs.json): its script, narration, cues file and speech rate.
const LANG_ID = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'he';
const LANG = JSON.parse(readFileSync(HERE + 'langs.json'))[LANG_ID];
if (!LANG) throw new Error(`unknown --lang ${LANG_ID}`);
const DOCX = HERE + LANG.script;
const OUT = HERE + LANG.cues;
const NARRATION = HERE + LANG.narration + '/';           // active takes; older takes live in narration/archive/
const AUDIO_EXT = /\.(wav|m4a|mp3|aac|ogg|opus|flac)$/i;

export const SCENES = ['01-composer', '02-id', '03-qr', '04-patient', '05-email', '06-summary', '07-weeks', '08-closing'];

const WPS = LANG.wps;     // narration words per second (estimate only)
const LINE_PAUSE = 0.35;  // breath after each narration paragraph
const VISUAL_HOLD = 1.0;  // a "— תמונה בלבד" / "— צליל בלבד" cue gets this much air
const LEAD_IN = 0.5;
const TAIL = 0.6;

/** Paragraphs of the docx as { style, text }. */
export function readScript(path = DOCX) {
  const xml = execFileSync('unzip', ['-p', path, 'word/document.xml']).toString('utf8');
  const paras = [];
  for (const [, body] of xml.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? '';
    const text = [...body.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .trim();
    if (text) paras.push({ style, text });
  }
  return paras;
}

/** Scenes as ordered items: { kind: 'cue', name, visual } | { kind: 'line', text }. */
export function parseScenes(paras) {
  const scenes = [];
  let cur = null;
  for (const p of paras) {
    if (/^Heading2$/i.test(p.style)) {
      cur = { id: SCENES[scenes.length], title: p.text, items: [] };
      scenes.push(cur);
    } else if (!cur) {
      continue;
    } else if (p.style === 'Cue') {
      const m = p.text.match(/^\[([A-Z0-9-]+)(.*)\]$/);
      if (!m) throw new Error(`malformed cue in ${cur.id}: ${p.text}`);
      cur.items.push({ kind: 'cue', name: m[1], visual: /בלבד|only/i.test(m[2]) });
    } else if (p.style === 'Narration') {
      const captions = p.text.split('|').map((x) => x.trim()).filter(Boolean);
      cur.items.push({ kind: 'line', text: captions.join(' '), captions });
    }
  }
  if (scenes.length !== SCENES.length) {
    throw new Error(`expected ${SCENES.length} scenes (Heading 2), found ${scenes.length}`);
  }
  return scenes;
}

const norm = (w) => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();   // Whisper's case is not the script's

// Written one way, said another (langs.json saidAs). Matching uses the spoken
// form; captions keep the written one. ("PHQ-9" is said "PHQ" in the Hebrew
// narration.)
const SAID_AS = LANG.saidAs.map(([from, to]) => [new RegExp(from, 'g'), to]);
const spoken = (w) => SAID_AS.reduce((x, [re, to]) => x.replace(re, to), w);

// Whisper splits a Hebrew prefix letter off a Latin/hyphenated word
// ("ה" + "-PHQ,"). Join them back so they match the script's one word.
function joinPrefixes(words) {
  if (LANG_ID !== 'he') return words;
  const out = [];
  for (const w of words) {
    const prev = out.at(-1);
    if (prev && /^[הובלמשכ]$/.test(prev.w) && /^[-A-Za-z]/.test(w.w)) {
      out[out.length - 1] = { ...prev, w: prev.w + w.w, end: w.end };
    } else out.push({ ...w });
  }
  return out;
}

// Script words ← Whisper words, matched in order (longest common subsequence
// on normalised tokens). Unmatched script words are interpolated between
// matched neighbours. Returns the scene's lines with word times, plus the
// script words Whisper did not hear.
function align(scene, asr) {
  const script = scene.items.filter((it) => it.kind === 'line')
    .flatMap((l, li) => l.text.split(/\s+/).filter(Boolean).map((w) => ({ w, li })));
  asr = { ...asr, words: joinPrefixes(asr.words) };
  const a = script.map((x) => norm(spoken(x.w))), b = asr.words.map((x) => norm(x.w));
  const L = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { script[i].start = asr.words[j].start; script[i].end = asr.words[j].end; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const missed = script.filter((x) => x.start == null).map((x) => x.w);
  for (const x of script) x.heard = x.start != null;
  // Interpolate the gaps.
  for (let i = 0; i < script.length; i++) {
    if (script[i].start != null) continue;
    let j = i; while (j < script.length && script[j].start == null) j++;
    const from = i > 0 ? script[i - 1].end : 0, to = j < script.length ? script[j].start : asr.duration;
    const step = (to - from) / (j - i + 1);
    for (let k = i; k < j; k++) { script[k].start = +(from + step * (k - i + 0.5)).toFixed(3); script[k].end = +(from + step * (k - i + 1)).toFixed(3); }
    i = j;
  }
  const lines = scene.items.filter((it) => it.kind === 'line').map((l, li) => {
    const mine = script.filter((x) => x.li === li);
    const words = mine.map(({ w, start, end }) => ({ w, start, end }));
    const heard = mine.filter((x) => x.heard).length / mine.length;
    return { text: l.text, captions: l.captions, start: words[0].start, end: words.at(-1).end, words, heard: +heard.toFixed(2) };
  });
  return { lines, missed };
}

// A line the recording no longer matches (the script was edited after
// recording: under STALE_HEARD of its words heard) is re-timed by the
// word-count estimate after the line before it, and everything later shifts
// by the difference. The scene notes where its stale part starts, so the
// mix can stop the old voice there.
const STALE_HEARD = 0.6;
function retimeStale(lines, duration) {
  let shift = 0, staleFrom = null;
  lines.forEach((l, i) => {
    const prevEnd = i > 0 ? lines[i - 1].end : LEAD_IN - LINE_PAUSE;
    if (l.heard >= STALE_HEARD) {
      if (shift) for (const w of l.words) { w.start = +(w.start + shift).toFixed(3); w.end = +(w.end + shift).toFixed(3); }
    } else {
      const oldEnd = l.end + shift, t = prevEnd + LINE_PAUSE;
      staleFrom ??= t;
      l.words.forEach((w, k) => { w.start = +(t + k / WPS).toFixed(3); w.end = +(t + (k + 1) / WPS).toFixed(3); });
      l.stale = true;
      shift += l.words.at(-1).end - oldEnd;
    }
    l.start = l.words[0].start; l.end = l.words.at(-1).end;
  });
  return { duration: +Math.max(duration + shift, lines.at(-1).end + TAIL).toFixed(3), staleFrom };
}

// Cue times from the aligned lines: a cue sits just before the line that
// follows it; a cue with no line after it (visual beats at the end) sits
// just after the previous line.
function cuesFromLines(scene, lines) {
  const cues = {};
  let li = 0;
  scene.items.forEach((it, idx) => {
    if (it.kind === 'line') { li++; return; }
    const nextIsLine = scene.items.slice(idx + 1).find((x) => x.kind === 'line');
    const next = nextIsLine ? lines[li] : null;
    const prev = lines[li - 1];
    cues[it.name] = +(next ? Math.max(prev ? prev.end : 0, next.start - 0.15) : (prev ? prev.end + 0.25 : 0)).toFixed(3);
  });
  return cues;
}

function audioFor(id) {
  if (!existsSync(NARRATION)) return null;
  const f = readdirSync(NARRATION).find((n) => n.startsWith(id + '.') && AUDIO_EXT.test(n));
  return f ? NARRATION + f : null;
}

// Whisper's word times run early (~0.3 s after each pause here) and it can
// stretch the first word back to 0 over leading silence. Correct them against
// the audio: every speech onset (the end of a silence ffmpeg detects) snaps
// the nearest word start to it, and the words in between take the correction
// interpolated from the anchors on either side.
// Pauses in the recording, [start, end], merged across speech blips shorter
// than 0.15 s (a click or a breath is not the start of a word).
function pauses(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=n=-38dB:d=0.2', '-f', 'null', '-'], { encoding: 'utf8' });
  const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const out = [];
  starts.forEach((s, i) => {
    const e = ends[i] ?? Infinity;
    if (out.length && s - out.at(-1)[1] < 0.15) out.at(-1)[1] = e; else out.push([s, e]);
  });
  return out.filter(([, e]) => Number.isFinite(e));
}
function snapToSpeech(asr, file) {
  const words = asr.words.map((w) => ({ ...w }));
  if (!words.length) return asr;
  // After each pause, the first word that starts during or after it is the
  // one that starts when the pause ends. (Whisper runs early, so a "nearest
  // word" rule would grab the word after it.)
  const anchors = [];                       // [word index, correction]
  const used = new Set();
  for (const [ps, pe] of pauses(file)) {
    const i = words.findIndex((w, k) => !used.has(k) && w.start >= ps - 0.15);
    if (i < 0 || words[i].start > pe + 0.5) continue;
    used.add(i); anchors.push([i, pe - words[i].start]);
  }
  if (!anchors.length) return asr;
  anchors.sort((a, b) => a[0] - b[0]);
  const corr = (i) => {
    const after = anchors.find(([j]) => j >= i), before = [...anchors].reverse().find(([j]) => j <= i);
    if (!before) return after[1];
    if (!after || after[0] === before[0]) return before[1];
    const f = (words[i].start - words[before[0]].start) / (words[after[0]].start - words[before[0]].start || 1);
    return before[1] + (after[1] - before[1]) * f;
  };
  const shift = words.map((_, i) => corr(i));
  words.forEach((w, i) => { w.start = +(w.start + shift[i]).toFixed(3); w.end = +(w.end + shift[i]).toFixed(3); });
  for (let i = 0; i < words.length - 1; i++) if (words[i].end > words[i + 1].start) words[i].end = words[i + 1].start;
  return { ...asr, words, snapped: anchors.length };
}

function transcribe(id, file, scene) {
  const cache = NARRATION + id + '.words.json';
  if (existsSync(cache) && statSync(cache).mtimeMs > statSync(file).mtimeMs) return JSON.parse(readFileSync(cache));
  const py = process.env.MADAD_ASR_PYTHON, model = process.env.MADAD_ASR_MODEL;
  if (!py || !model) throw new Error('--from-audio needs MADAD_ASR_PYTHON and MADAD_ASR_MODEL');
  const prompt = scene.items.filter((it) => it.kind === 'line').map((l) => l.text).join(' ');
  const out = execFileSync(py, [HERE + 'transcribe.py', file, '--lang', LANG_ID, '--prompt', prompt],
    { env: { ...process.env, MADAD_ASR_MODEL: model }, maxBuffer: 1 << 24 }).toString('utf8');
  writeFileSync(cache, out);
  return JSON.parse(out);
}

function estimate(scenes) {
  const out = {};
  for (const s of scenes) {
    let t = LEAD_IN;
    const cues = {}, lines = [];
    for (const it of s.items) {
      if (it.kind === 'cue') {
        cues[it.name] = +t.toFixed(3);
        if (it.visual) t += VISUAL_HOLD;
        continue;
      }
      const ws = it.text.split(/\s+/).filter(Boolean);
      const words = ws.map((w, i) => ({ w, start: +(t + i / WPS).toFixed(3), end: +(t + (i + 1) / WPS).toFixed(3) }));
      lines.push({ text: it.text, captions: it.captions, start: +t.toFixed(3), end: words.at(-1).end, words });
      t = words.at(-1).end + LINE_PAUSE;
    }
    out[s.id] = { title: s.title, duration: +(t + TAIL).toFixed(3), cues, lines };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.find((a) => a === '--estimate' || a === '--from-audio');
  const scenes = parseScenes(readScript());
  if (mode === '--estimate') {
    const data = { source: 'estimate', wps: WPS, generated: new Date().toISOString(), scenes: estimate(scenes) };
    writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
    let total = 0;
    for (const [id, s] of Object.entries(data.scenes)) {
      total += s.duration;
      console.log(`${id.padEnd(12)} ${s.duration.toFixed(1).padStart(5)} s  ${Object.keys(s.cues).join(' ')}`);
    }
    console.log(`total ${total.toFixed(1)} s (estimate, ${WPS} words/s) → ${OUT}`);
  } else if (mode === '--from-audio') {
    const est = estimate(scenes);
    const out = {};
    for (const sc of scenes) {
      const file = audioFor(sc.id);
      if (!file) { out[sc.id] = { ...est[sc.id], source: 'estimate' }; continue; }
      const asr = snapToSpeech(transcribe(sc.id, file, sc), file);
      const { lines, missed } = align(sc, asr);
      const { duration, staleFrom } = retimeStale(lines, asr.duration);
      out[sc.id] = { title: sc.title, source: 'audio', audio: file.slice(HERE.length), duration,
        cues: cuesFromLines(sc, lines), lines, missed, ...(staleFrom != null ? { staleFrom: +staleFrom.toFixed(3) } : {}) };
    }
    const data = { source: 'mixed', generated: new Date().toISOString(), scenes: out };
    writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
    let total = 0;
    for (const [id, s] of Object.entries(out)) {
      total += s.duration;
      const stale = s.lines.filter((l) => l.stale).length;
      const note = s.source !== 'audio' ? ''
        : stale ? `${stale} line(s) changed since recording: estimated from ${s.staleFrom}s, voice muted there`
        : s.missed.length ? `not heard: ${s.missed.join(' ')}` : 'all words matched';
      console.log(`${id.padEnd(12)} ${s.source.padEnd(8)} ${s.duration.toFixed(1).padStart(5)} s  ${note}`);
    }
    console.log(`total ${total.toFixed(1)} s → ${OUT}`);
  } else {
    console.error('usage: cues.mjs --estimate | --from-audio');
    process.exit(2);
  }
}
