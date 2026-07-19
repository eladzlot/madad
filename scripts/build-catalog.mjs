#!/usr/bin/env node
/**
 * build-catalog.mjs
 *
 * Generates public/composer/catalog.json — the composer's lightweight index
 * of every questionnaire/battery — from the manifest
 * (public/composer/configs.json) and the config files it lists.
 *
 * Run whenever a config file changes:
 *   npm run build:catalog
 *
 * CI freshness check (regenerate + byte-compare, exit 1 on drift):
 *   node scripts/build-catalog.mjs --check
 *
 * The catalog is committed so the dev server (which serves public/ directly)
 * and the production build see the same file. `npm run build` regenerates it,
 * so dist/ is always fresh even if the committed copy lags.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { buildCatalog, serializeCatalog } from '../shared/catalog/build-catalog.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'public/composer/configs.json');
const CATALOG_PATH = join(ROOT, 'public/composer/catalog.json');
const PUBLIC_DIR = join(ROOT, 'public');

const checkMode = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

const configsByUrl = new Map();
for (const entry of manifest.configs) {
  const filePath = join(PUBLIC_DIR, entry.url.replace(/^\//, ''));
  configsByUrl.set(entry.url, JSON.parse(readFileSync(filePath, 'utf8')));
}

let warnings = 0;
const catalog = buildCatalog(manifest, configsByUrl, {
  warn: (msg) => {
    warnings++;
    console.warn(`⚠ ${msg}`);
  },
});
const output = serializeCatalog(catalog);

if (checkMode) {
  const current = existsSync(CATALOG_PATH) ? readFileSync(CATALOG_PATH, 'utf8') : null;
  if (current !== output) {
    console.error(
      '✗ public/composer/catalog.json is out of date with the config files.\n' +
      '  Run `npm run build:catalog` and commit the result.'
    );
    process.exit(1);
  }
  console.log(`✓ catalog.json is up to date (${catalog.entries.length} entries)`);
} else {
  writeFileSync(CATALOG_PATH, output);
  console.log(
    `✓ catalog.json written (${catalog.entries.length} entries, ` +
    `${(output.length / 1024).toFixed(1)} KB${warnings ? `, ${warnings} warning(s)` : ''})`
  );
}
