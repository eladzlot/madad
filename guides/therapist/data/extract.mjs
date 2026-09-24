import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { parsePdfBytes } from '../../../aggregate/src/parse-pdf.js';
const dir = new URL('./pdfs/', import.meta.url).pathname;
const out = [];
for (const f of readdirSync(dir).sort()) {
  const p = await parsePdfBytes(new Uint8Array(readFileSync(dir + f)));
  if (!p.ok) throw new Error(f + ' ' + p.reason);
  out.push({ envelope: p.envelope, createdAt: p.envelope.generatedAt });
}
writeFileSync(new URL('./sessions.json', import.meta.url), JSON.stringify(out));
console.log(out.length, Object.keys(out[0].envelope));
