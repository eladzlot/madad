#!/usr/bin/env node
/**
 * scaffold-translation.mjs
 *
 * Creates public/configs/prod/<lang>/<id>.json from the Hebrew file with every
 * text field replaced by a "TODO: <hebrew>" marker, so a translator (human or
 * LLM) fills in text only and can never touch scoring, ids, or option values.
 * validate:configs then proves the finished file is structurally identical to
 * the Hebrew one (shared/config/translation-parity.js).
 *
 * Usage:
 *   node scripts/scaffold-translation.mjs <lang> <id> [<id>...]
 *   node scripts/scaffold-translation.mjs en phq9 gad7
 *
 * Refuses to overwrite an existing translation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { isLang, DEFAULT_LANG, configBaseFor } from '../shared/i18n/core.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const TEXT_KEYS = new Set(['title', 'description', 'text', 'label', 'message', 'ratingText']);
const TEXT_MAP_KEYS = new Set(['subscaleLabels', 'labels']);

function mark(v) { return `TODO: ${v}`; }

function scaffold(node, key = null) {
  if (TEXT_KEYS.has(key) && typeof node === 'string') return mark(node);
  if (key === 'keywords' && Array.isArray(node)) return node.map(mark);
  if (Array.isArray(node)) return node.map(v => scaffold(v));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (TEXT_MAP_KEYS.has(k) && v && typeof v === 'object') {
        out[k] = Object.fromEntries(Object.entries(v).map(([sk, sv]) => [sk, mark(sv)]));
      } else {
        out[k] = scaffold(v, k);
      }
    }
    return out;
  }
  return node;
}

const [lang, ...ids] = process.argv.slice(2);
if (!isLang(lang) || lang === DEFAULT_LANG || ids.length === 0) {
  console.error('Usage: node scripts/scaffold-translation.mjs <lang> <id> [<id>...]   (lang ≠ he)');
  process.exit(2);
}

const outDir = join(ROOT, 'public', configBaseFor(lang));
mkdirSync(outDir, { recursive: true });

for (const id of ids) {
  const src = join(ROOT, 'public/configs/prod', `${id}.json`);
  const dst = join(outDir, `${id}.json`);
  if (!existsSync(src)) { console.error(`✗ no Hebrew file for "${id}" (${src})`); process.exit(1); }
  if (existsSync(dst))  { console.error(`✗ ${dst} already exists — edit it instead`); process.exit(1); }

  const data = scaffold(JSON.parse(readFileSync(src, 'utf8')));
  for (const q of data.questionnaires ?? []) {
    q.meta = { ...(q.meta ?? {}), source: 'TODO: publication / official translation this text is taken from' };
  }
  for (const b of data.batteries ?? []) {
    b.meta = { ...(b.meta ?? {}), source: 'Madad original' };
  }
  if (data.dependencies) {
    data.dependencies = data.dependencies.map(d => d.replace(/configs\/prod\//, `configs/prod/${lang}/`));
  }
  writeFileSync(dst, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ ${dst} — replace every "TODO: …" value, then npm run validate:configs && npm run build:catalog`);
}
