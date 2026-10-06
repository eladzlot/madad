// outline.mjs — a text renderer for logo-core.js that draws glyph outlines
// instead of live <text>, so exported marks need no font. Uses fontkit (in
// node_modules through pdfmake) for layout; right-to-left runs come back in
// visual order. Tracking is added between glyphs, as letter-spacing would.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = {
  700: fontkit.openSync(path.join(here, '../public/fonts/NotoSansHebrew-Bold.ttf')),
  400: fontkit.openSync(path.join(here, '../public/fonts/NotoSansHebrew-Regular.ttf')),
};

const r2 = (n) => Math.round(n * 100) / 100;

/** Same signature as logo-core's live text: draws `str` centred on x. */
export function outlineText(str, { x, y, size, fill, opacity = 1, weight = 700, direction = 'ltr', tracking = 0 }) {
  const font = FONTS[weight >= 600 ? 700 : 400];
  const run = font.layout(str, [], null, null, direction);
  const s = size / font.unitsPerEm;
  const total = run.positions.reduce((a, p) => a + p.xAdvance * s, 0) + tracking * (run.glyphs.length - 1);
  let pen = x - total / 2;
  const d = run.glyphs.map((g, i) => {
    const p = run.positions[i];
    const gx = pen + p.xOffset * s, gy = y - p.yOffset * s;
    pen += p.xAdvance * s + tracking;
    // Font units are y-up; scale, flip, place.
    return g.path.commands.map(({ command, args }) => {
      const pts = [];
      for (let k = 0; k < args.length; k += 2) pts.push(`${r2(gx + args[k] * s)} ${r2(gy - args[k + 1] * s)}`);
      return { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }[command] + pts.join(' ');
    }).join('');
  }).join('');
  return `<path d="${d}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>`;
}
