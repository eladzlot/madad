#!/usr/bin/env node
/**
 * check-size.mjs
 *
 * Checks the production build output against chunk size budgets.
 * Must be run after `npm run build`.
 *
 * Budgets (gzipped):
 *   main chunk (app + Lit + engine)   ≤ 60 KB
 *   ajv-vendor chunk                  ≤ 50 KB
 *   pdf-vendor chunk (pdfmake)        ≤ 800 KB   (lazy — only loaded on results screen)
 *   total (all JS + CSS, excl. fonts) ≤ 950 KB
 *
 * Exit codes:
 *   0  — all budgets met
 *   1  — one or more budgets exceeded
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Writable } from 'stream';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '..');
const DIST_DIR  = join(ROOT, 'dist');

// ── Budgets (bytes, gzipped) ──────────────────────────────────────────────────

const KB = 1024;

const BUDGETS = [
  // chunk name pattern          limit       label
  { pattern: /pdf-vendor/,       limit: 500 * KB, label: 'pdf-vendor  (pdfmake — lazy)' },
  { pattern: /^main/,            limit:  30 * KB, label: 'main        (app + Lit + engine)' },
];

const TOTAL_BUDGET = 530 * KB;

// ── Gzip size measurement ─────────────────────────────────────────────────────

async function gzipSize(filePath) {
  // Use zlib to get gzipped size without writing a file
  const { gzipSync } = await import('zlib');
  const buf = readFileSync(filePath);
  const compressed = gzipSync(buf, { level: 9 });
  return compressed.length;
}

// ── Collect dist assets ───────────────────────────────────────────────────────

function collectAssets(dir) {
  const assets = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (!stat.isFile()) continue;
    // Only JS and CSS (fonts are served separately and excluded from budget)
    if (!full.endsWith('.js') && !full.endsWith('.css')) continue;
    // Skip source maps
    if (full.endsWith('.map')) continue;
    assets.push(full);
  }
  return assets;
}

// ── Format ────────────────────────────────────────────────────────────────────

function fmt(bytes) {
  if (bytes >= KB * KB) return (bytes / (KB * KB)).toFixed(2) + ' MB';
  return (bytes / KB).toFixed(1) + ' KB';
}

function bar(used, limit, width = 20) {
  const pct = Math.min(used / limit, 1);
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const color  = used > limit ? '\x1b[31m' : used > limit * 0.85 ? '\x1b[33m' : '\x1b[32m';
  return color + '█'.repeat(filled) + '░'.repeat(empty) + '\x1b[0m';
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Check dist dir exists
try {
  statSync(DIST_DIR);
} catch {
  console.error(`\n  ✗  dist/ not found. Run "npm run build" first.\n`);
  process.exit(1);
}

const assets = collectAssets(DIST_DIR);
if (assets.length === 0) {
  console.error(`\n  ✗  No JS/CSS files found in dist/. Run "npm run build" first.\n`);
  process.exit(1);
}

// Measure all files
const measured = await Promise.all(assets.map(async (f) => {
  const size = await gzipSize(f);
  return { path: f, rel: relative(DIST_DIR, f), name: f.split('/').pop(), size };
}));

console.log('\n  Bundle size report (gzipped)\n');
console.log(`  ${'File'.padEnd(50)} ${'Raw'.padStart(10)}  ${'Gzip'.padStart(10)}`);
console.log('  ' + '─'.repeat(76));

let totalGzip = 0;
for (const { rel, size, path } of measured) {
  const raw = statSync(path).size;
  totalGzip += size;
  console.log(`  ${rel.padEnd(50)} ${fmt(raw).padStart(10)}  ${fmt(size).padStart(10)}`);
}

console.log('  ' + '─'.repeat(76));
console.log(`  ${'TOTAL'.padEnd(50)} ${''.padStart(10)}  ${fmt(totalGzip).padStart(10)}\n`);

// ── Check per-chunk budgets ───────────────────────────────────────────────────

let failed = 0;

console.log('  Chunk budgets\n');

for (const { pattern, limit, label } of BUDGETS) {
  const matches = measured.filter(({ name }) => pattern.test(name));
  if (matches.length === 0) {
    console.log(`  ?  ${label.padEnd(42)} (no matching chunk found)`);
    continue;
  }
  const size = matches.reduce((s, m) => s + m.size, 0);
  const ok   = size <= limit;
  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const progress = bar(size, limit);
  console.log(`  ${icon}  ${label.padEnd(42)} ${fmt(size).padStart(9)} / ${fmt(limit)}  ${progress}`);
  if (!ok) {
    console.log(`     \x1b[31mExceeds budget by ${fmt(size - limit)}\x1b[0m`);
    failed++;
  }
}

// ── Check total budget ────────────────────────────────────────────────────────

const totalOk   = totalGzip <= TOTAL_BUDGET;
const totalIcon = totalOk ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
const totalProg = bar(totalGzip, TOTAL_BUDGET);
console.log(`\n  ${totalIcon}  ${'TOTAL'.padEnd(42)} ${fmt(totalGzip).padStart(9)} / ${fmt(TOTAL_BUDGET)}  ${totalProg}`);
if (!totalOk) {
  console.log(`     \x1b[31mExceeds total budget by ${fmt(totalGzip - TOTAL_BUDGET)}\x1b[0m`);
  failed++;
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
