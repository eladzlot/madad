// cues.mjs — SCRIPT.he.docx → cues.json: when each cue and each word falls,
// in seconds from the start of its scene's narration file.
//
//   node guides/video/intro/cues.mjs --estimate     placeholder timings from word counts
//   node guides/video/intro/cues.mjs --from-audio   (next) from narration/*.wav via Whisper
//
// The script is read by paragraph style (SPEC.md §1): Heading 2 starts a
// scene (in order: SCENES below), "Narration" is spoken text, "Cue" is a
// [SYNC-POINT] marker. Everything else is direction and ignored.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const HERE = new URL('.', import.meta.url).pathname;
const DOCX = HERE + 'SCRIPT.he.docx';
const OUT = HERE + 'cues.json';

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
      cur.items.push({ kind: 'line', text: p.text });
    }
  }
  if (scenes.length !== SCENES.length) {
    throw new Error(`expected ${SCENES.length} scenes (Heading 2), found ${scenes.length}`);
  }
  return scenes;
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
      lines.push({ text: it.text, start: +t.toFixed(3), end: words.at(-1).end, words });
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
    console.error('--from-audio: not yet — waits for the scratch narration.');
    process.exit(2);
  } else {
    console.error('usage: cues.mjs --estimate | --from-audio');
    process.exit(2);
  }
}
