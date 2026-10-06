// generate.mjs — every production asset of the Madad mark, from the master.
//
//   node brand/generate.mjs        → brand/export/ (SVG, PNG, ICO) + brand/export/index.html
//
// All text is outlined (outline.mjs), so the files need no font. PNG and ICO
// rasters are made by Inkscape and ImageMagick.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outlineText } from './outline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
await import('./logo-core.js');
const { DEFAULTS, renderLogo, compose } = globalThis.MadadLogo;
const out = path.join(here, 'export');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const files = [];
const write = async (name, data, note) => {
  await fs.writeFile(path.join(out, name), data);
  files.push({ name, note });
};
const png = async (svgName, pngName, width, note, height = null) => {
  const args = [path.join(out, svgName), `--export-filename=${path.join(out, pngName)}`, `--export-width=${width}`];
  if (height) args.push(`--export-height=${height}`);
  execFileSync('inkscape', args, { stdio: 'ignore' });
  files.push({ name: pngName, note });
};
const logo = (settings) => renderLogo({}, { text: outlineText, ...settings });

// ── The mark ──────────────────────────────────────────────────────────────────
// Transparent backgrounds; clear space of half a cap height is built in.
const MODES = {
  light: 'on light backgrounds',
  dark: 'on dark backgrounds (white names, accent rule)',
  'mono-ink': 'one colour, ink — print, stamps, fax',
  'mono-white': 'one colour, white — on photos and coloured grounds',
};
for (const [mode, note] of Object.entries(MODES)) {
  const sfx = mode === 'light' ? '' : `-${mode}`;
  await write(`madad${sfx}.svg`, logo({ mode }), `The mark, ${note}.`);
  await write(`madad-tagline-he${sfx}.svg`, logo({ mode, tagline: 'he' }), `With the Hebrew tagline, ${note}.`);
  await write(`madad-tagline-en${sfx}.svg`, logo({ mode, tagline: 'en' }), `With the English tagline, ${note}.`);
}
// One language, the same rule system: for a header in a single-language UI.
for (const lang of ['he', 'en']) {
  for (const mode of ['light', 'dark']) {
    const sfx = mode === 'light' ? '' : '-dark';
    await write(`madad-wordmark-${lang}${sfx}.svg`, logo({ mode, variant: lang }),
      `${lang === 'he' ? 'Hebrew' : 'English'} name alone, ${MODES[mode]} — a single-language header.`);
  }
}

// Rasters of the mark, for slides and documents.
await png('madad.svg', 'madad@2x.png', 1600, 'The mark, 1600 px wide, transparent.');
await png('madad-dark.svg', 'madad-dark@2x.png', 1600, 'The dark mark, 1600 px wide, transparent.');
await png('madad-tagline-he.svg', 'madad-tagline-he@2x.png', 1600, 'With the Hebrew tagline, 1600 px wide.');
await png('madad-tagline-en.svg', 'madad-tagline-en@2x.png', 1600, 'With the English tagline, 1600 px wide.');

// ── The icon ──────────────────────────────────────────────────────────────────
// The mark has no symbol, so the icon takes its first letter and its rule: a
// white מ over a white rule with three ticks, on an accent tile. (The site's
// favicon already had this shape; this is it redrawn from the master.)
function icon({ size = 512, radius = 0.22, inset = 0, tile = DEFAULTS.accent, glyph = '#FFFFFF' } = {}) {
  // 100-unit box; `inset` shrinks the content toward the centre (maskable
  // icons keep it inside the middle 80%).
  const k = 1 - inset;
  const c = (v) => 50 + (v - 50) * k;
  const letter = outlineText('מ', { x: c(50), y: c(64), size: 66 * k, fill: glyph, weight: 700, direction: 'rtl' });
  const ruleY = c(77), l = c(24), r = c(76), w = 5.2 * k, tw = 3 * k;
  const ticks = [0.25, 0.5, 0.75].map((f) => {
    const x = l + (r - l) * f;
    return `<line x1="${x}" y1="${ruleY - 3 * k}" x2="${x}" y2="${ruleY + 4.4 * k}" stroke="${glyph}" stroke-width="${tw}" stroke-linecap="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Madad">
${tile === 'none' ? '' : `<rect width="100" height="100" rx="${radius * 100}" fill="${tile}"/>`}${letter}<line x1="${l}" y1="${ruleY}" x2="${r}" y2="${ruleY}" stroke="${glyph}" stroke-width="${w}" stroke-linecap="round"/>${ticks}
</svg>\n`;
}
await write('icon.svg', icon(), 'The icon: favicon (SVG) and the source of the rasters below.');
await write('icon-maskable.svg', icon({ radius: 0, inset: 0.2 }), 'For Android adaptive icons and iOS: full-bleed tile, content in the safe zone.');
await write('icon-mono.svg', icon({ tile: 'none', glyph: DEFAULTS.ink }), 'The icon in one colour (ink, no tile).');
for (const [name, s, src, note] of [
  ['favicon-16.png', 16, 'icon.svg', 'Favicon, 16 px.'],
  ['favicon-32.png', 32, 'icon.svg', 'Favicon, 32 px.'],
  ['favicon-48.png', 48, 'icon.svg', 'Favicon, 48 px.'],
  ['apple-touch-icon.png', 180, 'icon-maskable.svg', 'iOS home screen, 180 px (iOS rounds the corners itself).'],
  ['icon-192.png', 192, 'icon.svg', 'Web app manifest, 192 px.'],
  ['icon-512.png', 512, 'icon.svg', 'Web app manifest, 512 px.'],
  ['icon-maskable-512.png', 512, 'icon-maskable.svg', 'Web app manifest, maskable, 512 px.'],
]) await png(src, name, s, note);
execFileSync('convert', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon.ico'].map((f) => path.join(out, f)));
files.push({ name: 'favicon.ico', note: 'Favicon for old browsers: 16, 32 and 48 px in one file.' });

// ── Share images (Open Graph, 1200×630) ───────────────────────────────────────
for (const lang of ['he', 'en']) {
  const { parts, box } = compose(DEFAULTS, 'light', { tagline: lang, text: outlineText });
  const W = 1200, H = 630, scale = 820 / box.w;
  const tx = (W - box.w * scale) / 2 - box.x * scale, ty = (H - box.h * scale) / 2 - box.y * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#F7FAF9"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${parts}</g>
</svg>\n`;
  await write(`og-${lang}.svg`, svg, `Share image source (${lang === 'he' ? 'Hebrew' : 'English'} tagline).`);
  await png(`og-${lang}.svg`, `og-${lang}.png`, W, `Share image, 1200×630, ${lang === 'he' ? 'Hebrew' : 'English'} tagline.`, H);
}

// ── Into the app ──────────────────────────────────────────────────────────────
// The files the product uses, copied (or spliced) from the exports above, so
// rerunning this keeps the app in step with the master.
const repo = path.join(here, '..');
const copy = (from, to) => fs.copyFile(path.join(out, from), path.join(repo, to));
await fs.mkdir(path.join(repo, 'public/brand'), { recursive: true });
await copy('icon.svg', 'public/favicon.svg');
await copy('favicon.ico', 'public/favicon.ico');
await copy('apple-touch-icon.png', 'public/apple-touch-icon.png');
// In the UI the mark sits in a layout that gives it room, so its built-in
// clear space is trimmed to a sliver (pad 0.12 of a cap height). It is shown
// 20–46 px tall there, where the master's rule would be a hairline, so these
// copies are the small-size cut: a heavier rule (6.5 against 4).
const ui = (mode) => renderLogo({ lineThickness: 6.5 }, { text: outlineText, mode, pad: 0.12 });
await fs.writeFile(path.join(repo, 'public/brand/madad.svg'), ui('light'));       // the patient app's welcome screen
await fs.writeFile(path.join(repo, 'landing/madad.svg'), ui('light'));            // the landing page (its own build)
await fs.writeFile(path.join(repo, 'landing/madad-dark.svg'), ui('dark'));       // its mock of the app header

// The share images keep their own messages (the composer's, the patient
// link's); only the corner mark between the markers below is ours.
async function spliceMark(file, mode, { right, top, width }) {
  const src = path.join(repo, file);
  const svg = await fs.readFile(src, 'utf8');
  const { parts, box } = compose(DEFAULTS, mode, { text: outlineText });
  const k = width / box.w;
  const tx = right - box.w * k - box.x * k, ty = top - box.y * k;
  const group = `<!-- Madad mark: generated by brand/generate.mjs -->
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${parts}</g>
  <!-- /Madad mark -->`;
  const re = /<!-- Madad mark: generated by brand\/generate\.mjs -->[\s\S]*?<!-- \/Madad mark -->/;
  if (!re.test(svg)) throw new Error(`${file}: no Madad mark markers`);
  await fs.writeFile(src, svg.replace(re, group));
}
await spliceMark('public/og-image.svg', 'dark', { right: 1152, top: 60, width: 260 });
await spliceMark('public/og-image-app.svg', 'light', { right: 1152, top: 56, width: 250 });

// ── A page that shows them all ────────────────────────────────────────────────
const dark = (n) => /-(dark|mono-white)/.test(n);
const sheet = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Madad brand assets</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #EEF2F1; color: #162232; }
main { max-width: 1100px; margin: 0 auto; padding: 28px 20px 60px; }
h1 { margin: 0 0 4px; } p.lede { margin: 0 0 22px; color: #4d5d66; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
figure { margin: 0; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(22,34,50,.06); }
.art { height: 170px; display: grid; place-items: center; padding: 14px; background: #fff;
  background-image: linear-gradient(45deg,#f1f4f5 25%,transparent 25%,transparent 75%,#f1f4f5 75%),linear-gradient(45deg,#f1f4f5 25%,transparent 25%,transparent 75%,#f1f4f5 75%);
  background-size: 16px 16px; background-position: 0 0, 8px 8px; }
.art.dark { background: #162232; }
.art img { max-width: 100%; max-height: 142px; width: auto; height: auto; object-fit: contain; }
figcaption { padding: 10px 14px 12px; } figcaption b { font-family: ui-monospace, monospace; font-size: 13px; display: block; }
figcaption span { color: #5e7080; font-size: 13px; }
</style></head><body><main>
<h1>Madad — brand assets</h1>
<p class="lede">Generated from the master mark by <code>node brand/generate.mjs</code>. Text is outlined: no file needs a font.</p>
<div class="grid">
${files.filter((f) => !f.name.endsWith('.ico')).map((f) => `<figure><div class="art${dark(f.name) ? ' dark' : ''}"><img src="${f.name}" alt=""></div><figcaption><b>${f.name}</b><span>${f.note}</span></figcaption></figure>`).join('\n')}
</div>
<h2>Files</h2><ul>${files.map((f) => `<li><code>${f.name}</code> — ${f.note}</li>`).join('')}</ul>
</main></body></html>`;
await fs.writeFile(path.join(out, 'index.html'), sheet);
console.log(`${files.length} assets → ${path.relative(process.cwd(), out)}/ (open index.html)`);
