#!/usr/bin/env node
/**
 * validate-configs.mjs
 *
 * Validates every JSON file in public/configs/ against the QuestionnaireSet
 * schema and semantic rules from shared/config/config-validation.js.
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
import { collectConfigErrors, checkCrossFileBatteryRefs } from '../shared/config/config-validation.js';
import { remoteExcludedIds } from '../shared/remote/no-text-rule.js';
import { checkTranslationParity } from '../shared/config/translation-parity.js';
import { parseConfigPath, DEFAULT_LANG, LANG_CODES } from '../shared/i18n/core.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const ROOT        = resolve(__dirname, '..');
const SCHEMA_PATH = join(ROOT, 'shared/config/QuestionnaireSet.schema.json');
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
    for (const msg of checkProdFileLayout(rel, data)) {
      errors.push(`Layout: ${msg}`);
    }
  }

  return { rel, errors };
}

// ── Per-instrument layout convention (public/configs/prod/) ──────────────────
// Item IDs are addresses: the patient app expands each `items=` token to
// configs/prod/<token>.json — or configs/prod/<lang>/<token>.json when the
// link carries `lang=` (docs/I18N_SPEC.md §3–4). Every config must therefore
// hold exactly one questionnaire or battery, with filename = entity id =
// config id. Test fixtures follow the same rule and are marked `dev: true`.

function checkProdFileLayout(rel, data) {
  if (!rel.startsWith('public/configs/prod/')) return [];
  const parsed = parseConfigPath(rel);
  if (!parsed) {
    return [
      `"${rel}" is not a valid prod config path — expected public/configs/prod/<id>.json ` +
      `or public/configs/prod/<lang>/<id>.json with <lang> one of ${LANG_CODES.filter(l => l !== DEFAULT_LANG).join(', ')} ` +
      `(Hebrew is the canonical tree and never lives under a language directory).`,
    ];
  }
  const basename = parsed.id;
  const entities = [...(data.questionnaires ?? []), ...(data.batteries ?? [])];

  if (entities.length !== 1) {
    return [
      `"${basename}.json" defines ${entities.length} entities — configs are exactly one questionnaire/battery per file ` +
      `(filename = entity id; patient URLs resolve items by fetching configs/prod/<id>.json).`,
    ];
  }

  const errors = [];
  if (entities[0].id !== basename) {
    errors.push(`Entity id "${entities[0].id}" must equal filename "${basename}" (items= tokens in patient URLs resolve to configs/prod/<id>.json)`);
  }
  if (data.id !== basename) {
    errors.push(`Config id "${data.id}" must equal filename "${basename}"`);
  }
  return errors;
}

// ── Translations (public/configs/prod/<lang>/) ───────────────────────────────
// A translated file is the Hebrew file with only its text replaced. Structure
// parity is proven by shared/config/translation-parity.js; here we pair each
// translation with its canonical twin and check battery completeness (every
// questionnaire a translated battery sequences must exist in that language).

function checkTranslations(validFiles) {
  const errors = [];
  const byLang = new Map();   // lang → Map(id → { rel, data })
  for (const f of validFiles) {
    const parsed = parseConfigPath(f.rel);
    if (!parsed) continue;
    if (!byLang.has(parsed.lang)) byLang.set(parsed.lang, new Map());
    byLang.get(parsed.lang).set(parsed.id, f);
  }
  const canonical = byLang.get(DEFAULT_LANG) ?? new Map();

  for (const [lang, files] of byLang) {
    if (lang === DEFAULT_LANG) continue;
    for (const [id, { rel, data }] of files) {
      const twin = canonical.get(id);
      if (!twin) {
        errors.push(`${rel}: no canonical Hebrew file public/configs/prod/${id}.json — translations never introduce new instruments.`);
        continue;
      }
      for (const msg of checkTranslationParity(twin.data, data, lang)) {
        errors.push(`${rel}: ${msg}`);
      }
      for (const b of data.batteries ?? []) {
        for (const ref of collectSequenceRefs(b.sequence)) {
          if (!files.has(ref)) {
            errors.push(`${rel}: battery "${b.id}" sequences "${ref}" but public/configs/prod/${lang}/${ref}.json does not exist — a battery is offered in a language only when every questionnaire in it is.`);
          }
        }
      }
    }
  }
  return errors;
}

function collectSequenceRefs(sequence) {
  const refs = [];
  for (const node of sequence ?? []) {
    if (node.questionnaireId) refs.push(node.questionnaireId);
    if (node.then) refs.push(...collectSequenceRefs(node.then));
    if (node.else) refs.push(...collectSequenceRefs(node.else));
    if (node.ids)  refs.push(...collectSequenceRefs(node.ids));
  }
  return refs;
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
// IDs must be globally unique across all configs the patient app can load
// together — i.e. within one language. The same id in configs/prod/ and
// configs/prod/en/ is the same instrument, translated (never loaded together).

if (validFiles.length > 1) {
  const seenQ = new Map();  // `${lang}:${questionnaire id}` → rel
  const seenB = new Map();  // `${lang}:${battery id}` → rel
  const crossErrors = [];
  const langOf = (rel) => parseConfigPath(rel)?.lang ?? DEFAULT_LANG;

  for (const { rel, data } of validFiles) {
    const lang = langOf(rel);
    for (const q of data.questionnaires ?? []) {
      const key = `${lang}:${q.id}`;
      if (seenQ.has(key)) {
        crossErrors.push(`Duplicate questionnaire ID "${q.id}" in ${rel} (already in ${seenQ.get(key)})`);
      } else {
        seenQ.set(key, rel);
      }
    }
    for (const b of data.batteries ?? []) {
      const key = `${lang}:${b.id}`;
      if (seenB.has(key)) {
        crossErrors.push(`Duplicate battery ID "${b.id}" in ${rel} (already in ${seenB.get(key)})`);
      } else {
        seenB.set(key, rel);
      }
      if (seenQ.has(key)) {
        crossErrors.push(`Battery ID "${b.id}" in ${rel} collides with questionnaire ID in ${seenQ.get(key)}`);
      }
    }
  }

  if (crossErrors.length > 0) {
    console.error('\n  ✗  Cross-file ID conflicts:');
    for (const err of crossErrors) console.error(`       ${err}`);
    failed++;
  }

  // ── Cross-file battery reference check ──────────────────────────────────────
  const refErrors = checkCrossFileBatteryRefs(validFiles);
  if (refErrors.length > 0) {
    console.error('\n  ✗  Cross-file battery reference errors:');
    for (const err of refErrors) console.error(`       ${err}`);
    failed++;
  }

  // ── Translation parity ─────────────────────────────────────────────────────
  const translationErrors = checkTranslations(validFiles);
  if (translationErrors.length > 0) {
    console.error('\n  ✗  Translation errors:');
    for (const err of translationErrors) console.error(`       ${err}`);
    failed++;
  }
}

// ── Remote deployment: no-text rule (REMOTE_SPEC §5.3) ───────────────────────
// Informational: which prod instruments the catalog will withhold because they
// contain free-text items. The files are valid; they are simply not offered.
{
  const prod = validFiles.filter(f => f.rel.startsWith('public/configs/prod/')).map(f => f.data);
  const excluded = [...remoteExcludedIds(prod)].sort();
  if (excluded.length) {
    console.log(`\n  ℹ  no-text rule withholds ${excluded.length} instrument(s) from the remote catalog: ${excluded.join(', ')}`);
  }
}

console.log(`\n${passed + failed} file(s) checked — ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
