// cues.mjs — SCRIPT.he.docx → cues.json: when each cue and each word falls,
// in seconds from the start of its scene's narration file.
//
//   node guides/video/intro/cues.mjs --estimate     placeholder timings from word counts
//   node guides/video/intro/cues.mjs --from-audio   from narration/scratch/<scene>.* via Whisper;
//                                                   scenes without a recording keep the estimate
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
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';

const HERE = new URL('.', import.meta.url).pathname;
const DOCX = HERE + 'SCRIPT.he.docx';
const OUT = HERE + 'cues.json';
const NARRATION = HERE + 'narration/scratch/';
const AUDIO_EXT = /\.(wav|m4a|mp3|aac|ogg|opus|flac)$/i;

export const SCENES = ['01-composer', '02-id', '03-qr', '04-patient', '05-email', '06-summary', '07-weeks', '08-closing'];

const WPS = 2.4;          // Hebrew narration, words per second (estimate only)
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
      cur.items.push({ kind: 'cue', name: m[1], visual: /בלבד/.test(m[2]) });
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

const norm = (w) => w.replace(/[^\p{L}\p{N}]/gu, '');

// Script words ← Whisper words, matched in order (longest common subsequence
// on normalised tokens). Unmatched script words are interpolated between
// matched neighbours. Returns the scene's lines with word times, plus the
// script words Whisper did not hear.
function align(scene, asr) {
  const script = scene.items.filter((it) => it.kind === 'line')
    .flatMap((l, li) => l.text.split(/\s+/).filter(Boolean).map((w) => ({ w, li })));
  const a = script.map((x) => norm(x.w)), b = asr.words.map((x) => norm(x.w));
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
    const words = script.filter((x) => x.li === li).map(({ w, start, end }) => ({ w, start, end }));
    return { text: l.text, captions: l.captions, start: words[0].start, end: words.at(-1).end, words };
  });
  return { lines, missed };
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

function transcribe(id, file, scene) {
  const cache = NARRATION + id + '.words.json';
  if (existsSync(cache) && statSync(cache).mtimeMs > statSync(file).mtimeMs) return JSON.parse(readFileSync(cache));
  const py = process.env.MADAD_ASR_PYTHON, model = process.env.MADAD_ASR_MODEL;
  if (!py || !model) throw new Error('--from-audio needs MADAD_ASR_PYTHON and MADAD_ASR_MODEL');
  const prompt = scene.items.filter((it) => it.kind === 'line').map((l) => l.text).join(' ');
  const out = execFileSync(py, [HERE + 'transcribe.py', file, '--prompt', prompt],
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
  const mode = process.argv[2];
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
      const asr = transcribe(sc.id, file, sc);
      const { lines, missed } = align(sc, asr);
      out[sc.id] = { title: sc.title, source: 'audio', audio: file.slice(HERE.length), duration: asr.duration,
        cues: cuesFromLines(sc, lines), lines, missed };
    }
    const data = { source: 'mixed', generated: new Date().toISOString(), scenes: out };
    writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
    let total = 0;
    for (const [id, s] of Object.entries(out)) {
      total += s.duration;
      const note = s.source === 'audio' ? (s.missed.length ? `not heard: ${s.missed.join(' ')}` : 'all words matched') : '';
      console.log(`${id.padEnd(12)} ${s.source.padEnd(8)} ${s.duration.toFixed(1).padStart(5)} s  ${note}`);
    }
    console.log(`total ${total.toFixed(1)} s → ${OUT}`);
  } else {
    console.error('usage: cues.mjs --estimate | --from-audio');
    process.exit(2);
  }
}
