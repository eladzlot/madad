#!/usr/bin/env node
/**
 * build-catalog.mjs
 *
 * Generates public/composer/catalog.json — the composer's lightweight index
 * of every questionnaire/battery — by scanning public/configs/prod/*.json in
 * sorted filename order (deterministic output), plus each language directory
 * public/configs/prod/<lang>/ for translated titles and availability. Configs
 * marked `dev: true` (test fixtures) produce entries flagged dev, shown only
 * in dev mode.
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

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { buildCatalog, serializeCatalog } from '../shared/catalog/build-catalog.js';
import { remoteExcludedIds, remoteExclude } from '../shared/remote/no-text-rule.js';
import { isLang, DEFAULT_LANG } from '../shared/i18n/core.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'public/composer/catalog.json');
const PROD_DIR = join(ROOT, 'public/configs/prod');

const checkMode = process.argv.includes('--check');

const readDir = (dir) => readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const configs = readDir(PROD_DIR);

// Translations: public/configs/prod/<lang>/ for every supported language.
const translations = {};
for (const entry of readdirSync(PROD_DIR).sort()) {
  const full = join(PROD_DIR, entry);
  if (statSync(full).isDirectory() && isLang(entry) && entry !== DEFAULT_LANG) {
    translations[entry] = readDir(full);
  }
}

// Remote deployment (REMOTE_SPEC §5.3): instruments with free-text items are
// not offered. The files stay; they are simply absent from the catalog.
const excludedIds = remoteExcludedIds(configs);

let warnings = 0;
const catalog = buildCatalog(configs, {
  exclude: remoteExclude(excludedIds),
  translations,
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
  console.log(`✓ catalog.json is up to date (${catalog.entries.length} entries; ${excludedIds.size} excluded by the no-text rule)`);
} else {
  writeFileSync(CATALOG_PATH, output);
  console.log(
    `✓ catalog.json written (${catalog.entries.length} entries, ` +
    `${(output.length / 1024).toFixed(1)} KB${warnings ? `, ${warnings} warning(s)` : ''})`
  );
  if (excludedIds.size) {
    console.log(`  no-text rule excluded: ${[...excludedIds].sort().join(', ')}`);
  }
}
