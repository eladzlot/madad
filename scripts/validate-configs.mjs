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

// Per-file validation
const validFiles = [];  // { rel, data } for files that passed

for (const file of files) {
  const { rel, errors } = validateFile(file);
  if (errors.length === 0) {
    console.log(`  ✓  ${rel}`);
    passed++;
    validFiles.push({ rel, data: JSON.parse(readFileSync(file, 'utf8')) });
  } else {
    console.error(`  ✗  ${rel}`);
    for (const err of errors) console.error(`       ${err}`);
    failed++;
  }
}

// ── Cross-file duplicate ID check ─────────────────────────────────────────────
// IDs must be globally unique across all loaded configs. Catch violations here.

if (validFiles.length > 1) {
  const seenQ = new Map();  // questionnaire id → rel
  const seenB = new Map();  // battery id → rel
  const crossErrors = [];

  for (const { rel, data } of validFiles) {
    for (const q of data.questionnaires ?? []) {
      if (seenQ.has(q.id)) {
        crossErrors.push(`Duplicate questionnaire ID "${q.id}" in ${rel} (already in ${seenQ.get(q.id)})`);
      } else {
        seenQ.set(q.id, rel);
      }
    }
    for (const b of data.batteries ?? []) {
      if (seenB.has(b.id)) {
        crossErrors.push(`Duplicate battery ID "${b.id}" in ${rel} (already in ${seenB.get(b.id)})`);
      } else {
        seenB.set(b.id, rel);
      }
      if (seenQ.has(b.id)) {
        crossErrors.push(`Battery ID "${b.id}" in ${rel} collides with questionnaire ID in ${seenQ.get(b.id)}`);
      }
    }
  }

  if (crossErrors.length > 0) {
    console.error('\n  ✗  Cross-file ID conflicts:');
    for (const err of crossErrors) console.error(`       ${err}`);
    failed++;
  }
}

console.log(`\n${passed + failed} file(s) checked — ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
