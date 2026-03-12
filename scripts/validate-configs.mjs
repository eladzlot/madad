#!/usr/bin/env node
/**
 * validate-configs.mjs
 *
 * Validates every JSON file in public/configs/ against the QuestionnaireSet
 * schema and semantic rules from src/config/config-validation.js.
 *
 * Usage:
 *   node scripts/validate-configs.mjs [path...]
 *
 * If no paths are given, defaults to all JSON files under public/configs/.
 *
 * Exit codes:
 *   0  — all files valid
 *   1  — one or more files failed
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, join } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv/dist/2020.js';
import { collectConfigErrors } from '../src/config/config-validation.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const ROOT        = resolve(__dirname, '..');
const SCHEMA_PATH = join(ROOT, 'src/config/QuestionnaireSet.schema.json');
const CONFIGS_DIR = join(ROOT, 'public/configs');

// ── AJV setup ─────────────────────────────────────────────────────────────────

const schema   = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const ajv      = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

// ── File discovery ────────────────────────────────────────────────────────────

function findJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

function resolveTargets(args) {
  if (args.length === 0) return findJsonFiles(CONFIGS_DIR);
  return args.map(a => resolve(a));
}

// ── Validate one file ─────────────────────────────────────────────────────────

function validateFile(filePath) {
  const rel = relative(ROOT, filePath);
  let data;

  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { rel, errors: [`Parse error: ${err.message}`] };
  }

  const errors = [];

  if (!validate(data)) {
    for (const e of validate.errors) {
      errors.push(`Schema: ${e.instancePath || '/'} — ${e.message}`);
    }
  } else {
    // Only run semantic checks if schema passed (avoids false positives on
    // structurally invalid data, e.g. missing required fields)
    for (const msg of collectConfigErrors(data)) {
      errors.push(`Semantic: ${msg}`);
    }
  }

  return { rel, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = resolveTargets(process.argv.slice(2));

if (files.length === 0) {
  console.log('No config files found.');
  process.exit(0);
}

let passed = 0;
let failed = 0;

for (const file of files) {
  const { rel, errors } = validateFile(file);
  if (errors.length === 0) {
    console.log(`  ✓  ${rel}`);
    passed++;
  } else {
    console.error(`  ✗  ${rel}`);
    for (const err of errors) console.error(`       ${err}`);
    failed++;
  }
}

console.log(`\n${passed + failed} file(s) checked — ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
