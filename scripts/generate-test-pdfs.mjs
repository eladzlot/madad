/**
 * generate-test-pdfs.mjs
 *
 * Generates real Madad report PDFs from a scenario description — for
 * Aggregate testing, demo slides, and any "show me a patient with symptom
 * profile X" need. The output is byte-faithful to patient-produced PDFs: it
 * reuses the production pipeline end to end (engine scoring → alert
 * evaluation → buildDocDefinition → pdfmake → embedded data.json envelope),
 * only swapping the browser pdfmake build for the node one and injecting the
 * session date.
 *
 * The scenario grammar and everything that turns a scenario into a scored
 * session live in scripts/lib/mock-report.js (and are unit-tested there).
 * This file is the CLI: fonts, pdfmake, writing, verification, reporting.
 *
 * Run with vite-node (report.js uses Vite-only `?url` font imports):
 *
 *   npx vite-node scripts/generate-test-pdfs.mjs                    # default scenario
 *   npx vite-node scripts/generate-test-pdfs.mjs s.json --out dir   # a scenario file
 *   npx vite-node scripts/generate-test-pdfs.mjs --describe phq9    # item ids + options
 *
 * Or through the npm scripts: `npm run demo -- <scenario.json>` writes into
 * demo/out/, `npm run pdf:fixtures` regenerates the test fixtures.
 *
 * Scenario shape (JSON) — see demo/README.md for the full grammar:
 *   {
 *     "pid": "DEMO-001",
 *     "name": null,
 *     "sessions": [
 *       { "date": "2026-06-05", "instruments": {
 *           "phq9": { "answers": { "1": 3, "2": 2, ... } },   // explicit
 *           "oci_r": 31                                        // target total
 *       } }
 *     ]
 *   }
 *
 * A `{ "patients": [ … ] }` wrapper (or a bare array) generates a whole set in
 * one run, each patient into its own subdirectory.
 *
 * There is no config field: item IDs are addresses, so each instrument named
 * in `instruments` is loaded from public/configs/prod/<id>.json — the same
 * expansion the patient app does with `?items=`. A legacy `config` field in an
 * old scenario file is ignored.
 *
 * Each written file is verified by re-parsing it with the Aggregate parser
 * (parse-pdf.js) and checking the envelope's totals against what the engine
 * scored.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

import { buildDocDefinition, buildFilename, initBidiForTesting } from '../src/pdf/report.js';
import { parsePdfBytes } from '../aggregate/src/parse-pdf.js';
import pdfmakeModule from 'pdfmake';

import {
  ScenarioError,
  normalizeScenario,
  collectInstrumentIds,
  loadQuestionnaires,
  buildSessionState,
  describeInstrument,
  summarizeSession,
  patientOutDir,
} from './lib/mock-report.js';

// CJS interop: pdfmake's node entry is `module.exports = new pdfmake()`;
// depending on the loader the instance is the default export or the module.
const pdfmake = pdfmakeModule.default ?? pdfmakeModule;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIG_DIR = resolve(ROOT, 'public/configs/prod');

// ── Default scenario: 5 weekly sessions, declining PHQ-9, OCI-R at the
//    first and last (crossing its screening cutoff of 21 on the way down).
const DEFAULT_SCENARIO = {
  pid: 'DEMO-001',
  name: null,
  sessions: [
    { date: '2026-06-05', instruments: { phq9: 18, oci_r: 31 } },
    { date: '2026-06-12', instruments: { phq9: 14 } },
    { date: '2026-06-19', instruments: { phq9: 11 } },
    { date: '2026-06-26', instruments: { phq9: 7 } },
    { date: '2026-07-03', instruments: { phq9: 4, oci_r: 17 } },
  ],
};

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = [...argv];
  const opts = { out: null, describe: null, scenario: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      opts.out = args[++i];
    } else if (args[i] === '--describe') {
      opts.describe = args[++i];
    } else if (args[i].startsWith('--')) {
      throw new ScenarioError(`Unknown flag "${args[i]}".`);
    } else if (opts.scenario === null) {
      opts.scenario = args[i];
    } else {
      throw new ScenarioError(`Unexpected argument "${args[i]}" — pass one scenario file.`);
    }
  }
  return opts;
}

// ── PDF rendering (node-side pdfmake, same version as the browser) ────────────

function initPdfmake() {
  // The node build exposes the virtual file system directly (the browser
  // build's addVirtualFileSystem() doesn't exist here); Buffers go in as-is.
  pdfmake.virtualfs.writeFileSync(
    'NotoSansHebrew-Regular.ttf',
    readFileSync(join(ROOT, 'public/fonts/NotoSansHebrew-Regular.ttf'))
  );
  pdfmake.virtualfs.writeFileSync(
    'NotoSansHebrew-Bold.ttf',
    readFileSync(join(ROOT, 'public/fonts/NotoSansHebrew-Bold.ttf'))
  );
  // No external resources are ever fetched; make that explicit (also
  // silences pdfmake's server-side URL-policy warning).
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.addFonts({
    NotoSansHebrew: {
      normal: 'NotoSansHebrew-Regular.ttf',
      bold: 'NotoSansHebrew-Bold.ttf',
      italics: 'NotoSansHebrew-Regular.ttf',
      bolditalics: 'NotoSansHebrew-Bold.ttf',
    },
  });
}

// ── --describe ────────────────────────────────────────────────────────────────

function describe(instrumentId) {
  const questionnaires = loadQuestionnaires([instrumentId], CONFIG_DIR);
  const q = questionnaires.get(instrumentId);
  const rows = describeInstrument(q);

  console.log(`\n${instrumentId} — ${q.title ?? ''}`);
  console.log(`${rows.length} scored items\n`);
  for (const row of rows) {
    const opts = row.options.map((o) => `${o.value}=${o.label}`).join('  ');
    console.log(`  "${row.id}"${row.excluded ? ' (excluded from total)' : ''}  ${row.prompt}`);
    console.log(`      ${opts}\n`);
  }
  console.log('Answer with: { "answers": { ' + rows.slice(0, 3).map((r) => `"${r.id}": 0`).join(', ') + ', … } }\n');
}

// ── Generation ────────────────────────────────────────────────────────────────

async function generatePatient(patient, questionnaires, outDir) {
  const config = { questionnaires: [...questionnaires.values()] };
  const session = { pid: patient.pid ?? null, name: patient.name ?? null };

  mkdirSync(outDir, { recursive: true });

  // Two sessions on the same date would collide on report-<pid>-<date>.pdf;
  // suffix duplicates so both files survive (real patients get distinct
  // browser-download names the same way).
  const usedNames = new Map();

  for (const s of patient.sessions) {
    const now = new Date(`${s.date}T09:30:00`);
    const sessionState = buildSessionState(questionnaires, s.instruments);
    const dd = buildDocDefinition(sessionState, config, session, now);

    let filename = buildFilename(session, now);
    const seen = usedNames.get(filename) ?? 0;
    usedNames.set(filename, seen + 1);
    if (seen > 0) filename = filename.replace(/\.pdf$/, ` (${seen}).pdf`);
    const outPath = join(outDir, filename);

    const buffer = await pdfmake.createPdf(dd).getBuffer();
    writeFileSync(outPath, buffer);

    // Verify: the Aggregate parser must read back exactly what the engine scored.
    const parsed = await parsePdfBytes(new Uint8Array(buffer));
    if (!parsed.ok) {
      throw new Error(`${filename}: verification failed — ${parsed.reason} ${parsed.detail ?? ''}`);
    }
    for (const [qId, scoreResult] of Object.entries(sessionState.scores)) {
      const got = parsed.envelope.sessionState.scores[qId]?.total;
      if (got !== scoreResult.total) {
        throw new Error(`${filename}: envelope total for ${qId} is ${got}, expected ${scoreResult.total}`);
      }
    }

    console.log(`✓ ${filename}`);
    for (const line of summarizeSession(sessionState)) console.log(`    ${line}`);
  }

  return patient.sessions.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.describe) {
    describe(opts.describe);
    return;
  }

  const raw = opts.scenario
    ? JSON.parse(readFileSync(resolve(ROOT, opts.scenario), 'utf8'))
    : DEFAULT_SCENARIO;

  const patients = normalizeScenario(raw);
  const baseOut = resolve(ROOT, opts.out ?? 'tests/fixtures/pdfs');

  await initBidiForTesting();
  initPdfmake();

  const questionnaires = loadQuestionnaires(collectInstrumentIds(patients), CONFIG_DIR);

  let written = 0;
  for (const [i, patient] of patients.entries()) {
    const outDir = patientOutDir(patient, i, patients.length, baseOut);
    if (patients.length > 1) console.log(`\n── ${patient.pid ?? '(no pid)'} → ${outDir}`);
    written += await generatePatient(patient, questionnaires, outDir);
  }

  console.log(`\n${written} PDF${written === 1 ? '' : 's'} written to ${baseOut}`);
}

main().catch((err) => {
  // Authoring mistakes get their message alone; real bugs keep the stack.
  if (err instanceof ScenarioError) console.error(`\n${err.message}\n`);
  else console.error(err);
  process.exit(1);
});
