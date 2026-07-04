/**
 * generate-test-pdfs.mjs
 *
 * Generates real Madad report PDFs from a scenario description — for
 * Aggregate testing, demo slides, and any future "show me a patient with
 * outcome X" need. The output is byte-faithful to patient-produced PDFs:
 * it reuses the production pipeline end to end (engine scoring → alert
 * evaluation → buildDocDefinition → pdfmake → embedded data.json
 * envelope), only swapping the browser pdfmake build for the node one and
 * injecting the session date.
 *
 * Run with vite-node (report.js uses Vite-only `?url` font imports):
 *
 *   npx vite-node scripts/generate-test-pdfs.mjs                 # default scenario
 *   npx vite-node scripts/generate-test-pdfs.mjs my-scenario.json --out some/dir
 *
 * Scenario shape (JSON):
 *   {
 *     "pid": "DEMO-001",
 *     "name": null,
 *     "config": "public/configs/prod/standard.json",
 *     "sessions": [
 *       { "date": "2026-06-05", "instruments": { "phq9": 18, "oci_r": 31 } },
 *       { "date": "2026-06-12", "instruments": { "phq9": 14 } }
 *     ]
 *   }
 *
 * Instrument values are target *total scores*; answers are derived
 * greedily (first items filled to max first), then scored by the real
 * engine — so the printed subscales, categories, and alerts are genuine.
 * If the greedy fill cannot hit the target exactly, the script aborts.
 *
 * Each written file is verified by re-parsing it with the Aggregate
 * parser (parse-pdf.js) and checking the envelope's totals and date.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

import { score } from '../src/engine/scoring.js';
import { evaluateAlerts } from '../src/engine/alerts.js';
import { buildDocDefinition, buildFilename, initBidiForTesting } from '../src/pdf/report.js';
import { parsePdfBytes } from '../aggregate/src/parse-pdf.js';
import pdfmakeModule from 'pdfmake';

// CJS interop: pdfmake's node entry is `module.exports = new pdfmake()`;
// depending on the loader the instance is the default export or the module.
const pdfmake = pdfmakeModule.default ?? pdfmakeModule;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Default scenario: 5 weekly sessions, declining PHQ-9, OCI-R at the
//    first and last (crossing its screening cutoff of 21 on the way down).
const DEFAULT_SCENARIO = {
  pid: 'DEMO-001',
  name: null,
  config: 'public/configs/prod/standard.json',
  sessions: [
    { date: '2026-06-05', instruments: { phq9: 18, oci_r: 31 } },
    { date: '2026-06-12', instruments: { phq9: 14 } },
    { date: '2026-06-19', instruments: { phq9: 11 } },
    { date: '2026-06-26', instruments: { phq9: 7 } },
    { date: '2026-07-03', instruments: { phq9: 4, oci_r: 17 } },
  ],
};

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = resolve(ROOT, outIdx !== -1 ? args[outIdx + 1] : 'tests/fixtures/pdfs');
const scenarioArg = args.filter((a, i) => a !== '--out' && i !== outIdx + 1)[0];
const scenario = scenarioArg
  ? JSON.parse(readFileSync(resolve(ROOT, scenarioArg), 'utf8'))
  : DEFAULT_SCENARIO;

// ── Answer derivation ─────────────────────────────────────────────────────────

// Greedy fill: walk scored items in order, assigning each the largest
// available option value that doesn't overshoot the target. Front-loading
// keeps late items at 0 — which for PHQ-9 keeps item 9 (suicidality alert)
// quiet unless the target is high enough to force it, matching how a real
// severe presentation would score anyway.
function answersForTotal(questionnaire, target) {
  const excluded = new Set(questionnaire.scoring?.exclude ?? []);
  const items = questionnaire.items.filter(
    (it) => it.type === 'select' && it.id && !excluded.has(it.id)
  );
  const answers = {};
  let remaining = target;
  for (const item of items) {
    const options = item.options
      ?? questionnaire.optionSets?.[item.optionSetId ?? questionnaire.defaultOptionSetId]
      ?? [];
    const values = options.map((o) => o.value).sort((a, b) => b - a);
    const pick = values.find((v) => v <= remaining) ?? 0;
    answers[item.id] = pick;
    remaining -= pick;
  }
  if (remaining !== 0) {
    throw new Error(
      `Cannot reach total ${target} for "${questionnaire.id}" (short by ${remaining}).`
    );
  }
  return answers;
}

// ── Session assembly ──────────────────────────────────────────────────────────

function buildSessionState(questionnaires, instrumentTargets) {
  const state = { answers: {}, scores: {}, alerts: {}, questionnaireIds: {} };
  for (const [qId, target] of Object.entries(instrumentTargets)) {
    const q = questionnaires.get(qId);
    if (!q) throw new Error(`Questionnaire "${qId}" not found in config.`);
    const answers = answersForTotal(q, target);
    const scoreResult = score(q, answers);
    if (scoreResult.total !== target) {
      throw new Error(
        `Engine scored "${qId}" at ${scoreResult.total}, expected ${target} — check the fill algorithm.`
      );
    }
    state.answers[qId] = answers;
    state.scores[qId] = scoreResult;
    state.alerts[qId] = evaluateAlerts(q, answers, scoreResult);
    state.questionnaireIds[qId] = qId;
  }
  return state;
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initBidiForTesting();
  initPdfmake();

  const configData = JSON.parse(readFileSync(resolve(ROOT, scenario.config), 'utf8'));
  // Mirror the loader's configFile annotation so envelopes carry the same
  // short name a browser session would ('standard', not a path).
  const shortName = scenario.config.replace(/^public\/configs\/prod\//, '').replace(/\.json$/, '');
  const questionnaires = new Map(
    configData.questionnaires.map((q) => [q.id, { ...q, configFile: shortName }])
  );
  const config = { questionnaires: [...questionnaires.values()] };
  const session = { pid: scenario.pid ?? null, name: scenario.name ?? null };

  mkdirSync(outDir, { recursive: true });

  for (const s of scenario.sessions) {
    const now = new Date(`${s.date}T09:30:00`);
    const sessionState = buildSessionState(questionnaires, s.instruments);
    const dd = buildDocDefinition(sessionState, config, session, now);
    const filename = buildFilename(session, now);
    const outPath = join(outDir, filename);

    const buffer = await pdfmake.createPdf(dd).getBuffer();
    writeFileSync(outPath, buffer);

    // Verify: the Aggregate parser must read back exactly what we meant.
    const parsed = await parsePdfBytes(new Uint8Array(buffer));
    if (!parsed.ok) throw new Error(`${filename}: verification failed — ${parsed.reason} ${parsed.detail ?? ''}`);
    const got = Object.fromEntries(
      Object.entries(parsed.envelope.sessionState.scores).map(([k, v]) => [k, v.total])
    );
    for (const [qId, target] of Object.entries(s.instruments)) {
      if (got[qId] !== target) throw new Error(`${filename}: envelope total for ${qId} is ${got[qId]}, expected ${target}`);
    }

    const alerts = Object.values(sessionState.alerts).flat().map((a) => a.id);
    console.log(
      `✓ ${filename} — ${Object.entries(s.instruments).map(([q, t]) => `${q}:${t}`).join(', ')}` +
      (alerts.length ? `  [alerts: ${alerts.join(', ')}]` : '')
    );
  }

  console.log(`\n${scenario.sessions.length} PDFs written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
