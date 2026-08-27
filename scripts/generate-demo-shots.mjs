/**
 * generate-demo-shots.mjs
 *
 * Renders the Aggregate's per-instrument views as PNGs, for slides and
 * walkthroughs. Takes the same scenario file the PDF generator takes:
 *
 *   npm run demo:shots -- demo/scenarios/my-profile.json
 *   npm run demo:shots -- my-profile.json --views chart
 *   npm run demo:shots -- my-profile.json --pid        # stamp the pid on charts
 *
 * It generates the PDFs first (by shelling out to `npm run demo`, the same
 * way tests/e2e/global-setup.js builds its fixtures), then drives a real
 * browser over the real Aggregate surface. There is no headless rendering
 * path for these views: only the chart has a DOM-free export builder
 * (export-svg.js), and it produces SVG, not PNG.
 *
 * Two capture strategies, one per view — deliberately different:
 *
 *   chart    — clicks the app's OWN export button (.export-png) and saves the
 *              download. That yields the framed 1600×1000 export the
 *              clinician gets (title, date range, מדד footer, opt-in pid),
 *              not a screenshot of the card with its toolbar in shot.
 *
 *   heatmap  — has no export path, so the card is screenshotted with its
 *              `.controls` hidden. Keeps the instrument title, drops the view
 *              switcher and export cluster.
 *
 * Run as plain node, NOT vite-node: nothing here imports src/pdf/report.js,
 * so the Vite-only `?url` font imports never come into play. The PDF half
 * runs in its own vite-node subprocess.
 */

import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

import { createServer } from 'vite';
import { chromium } from '@playwright/test';

import { ScenarioError, normalizeScenario, patientOutDir } from './lib/mock-report.js';

// `document` appears only inside locator.evaluate() callbacks, which are
// serialised and run in the page — browser scope, not this file's.
/* global document */

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const ALL_VIEWS = ['chart', 'heatmap'];

// 2× density: element screenshots come out at twice the CSS size, which is
// what a slide needs. The chart's own PNG export is already 2× internally
// (AGGREGATE_SPEC §6: logical 800×500 → 1600×1000) and ignores this.
const DEVICE_SCALE_FACTOR = 2;

// Generous: a cold Vite dev server compiles the aggregate entry on first hit.
const NAV_TIMEOUT = 60_000;

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { scenario: null, out: 'demo/out', views: ALL_VIEWS, pid: false, headed: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      opts.out = argv[++i];
    } else if (arg === '--views') {
      opts.views = (argv[++i] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
      const unknown = opts.views.filter((v) => !ALL_VIEWS.includes(v));
      if (unknown.length) throw new ScenarioError(`Unknown view(s): ${unknown.join(', ')}. Known: ${ALL_VIEWS.join(', ')}.`);
      if (!opts.views.length) throw new ScenarioError('--views needs at least one of: ' + ALL_VIEWS.join(', '));
    } else if (arg === '--pid') {
      opts.pid = true;
    } else if (arg === '--headed') {
      opts.headed = true;
    } else if (arg.startsWith('--')) {
      throw new ScenarioError(`Unknown flag "${arg}".`);
    } else if (opts.scenario === null) {
      opts.scenario = arg;
    } else {
      throw new ScenarioError(`Unexpected argument "${arg}" — pass one scenario file.`);
    }
  }
  if (!opts.scenario) throw new ScenarioError('Pass a scenario file: npm run demo:shots -- demo/scenarios/<name>.json');
  return opts;
}

// ── Aggregate page driving ────────────────────────────────────────────────────

const uploadInput = (page) => page.locator('upload-list input[type="file"]');

/** The instrument cards, in the order the Aggregate chose (most-administered first). */
async function instrumentCards(page) {
  const cards = page.locator('trajectory-chart');
  const count = await cards.count();
  const out = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const id = await card.evaluate((el) => el.series?.questionnaireId ?? null);
    out.push({ card, id: id ?? `instrument-${i}` });
  }
  return out;
}

/** Switch a card to a view and confirm it actually took. */
async function selectView(card, view) {
  const button = card.locator(`button[data-view="${view}"]`);
  if ((await button.count()) === 0) return false;
  await button.click();
  // The component silently falls back to 'chart' when a view can't render
  // (the heatmap needs the config questionnaire), so trust aria-pressed,
  // not the click.
  await button.waitFor({ state: 'visible' });
  return (await button.getAttribute('aria-pressed')) === 'true';
}

/**
 * Chart: drive the app's own PNG export and save the download.
 * `--pid` ticks the export's opt-in identifier checkbox first.
 */
async function shootChart(page, card, outPath, { pid }) {
  if (!(await selectView(card, 'chart'))) throw new Error('chart view unavailable');

  await card.locator('details.export-menu summary').click();

  if (pid) {
    const checkbox = card.locator('.export-pid input[type="checkbox"]');
    if (await checkbox.count()) await checkbox.check();
    else console.warn('      (no pid to stamp — points are unidentified or mixed)');
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    card.locator('.export-png').click(),
  ]);
  await download.saveAs(outPath);
}

/**
 * Heatmap: no export path, so screenshot the card with its toolbar hidden.
 * The style goes into the element's shadow root — page-level CSS cannot
 * reach into a Lit component's shadow DOM.
 *
 * The mouse is parked in the corner first: after clicking the view switcher
 * the cursor sits where that button was, which lands over a heatmap cell once
 * the view re-renders and leaves a stray :hover outline in the image.
 */
async function shootHeatmap(page, card, outPath) {
  if (!(await selectView(card, 'heatmap'))) return false;
  await card.locator('table.heatmap').waitFor({ state: 'visible', timeout: 10_000 });

  await page.mouse.move(0, 0);
  await card.evaluate((el) => {
    el.shadowRoot.activeElement?.blur();
    const style = document.createElement('style');
    style.dataset.shotMask = 'true';
    // Hide the toolbar, and neutralise the interaction states a driven browser
    // leaves behind — they are UI affordances, not part of the picture.
    style.textContent = `
      .controls { display: none !important; }
      *:hover, *:focus, *:focus-visible { outline: none !important; }
      table.heatmap td.cell:hover { outline: none !important; }
    `;
    el.shadowRoot.appendChild(style);
  });
  try {
    await card.screenshot({ path: outPath });
  } finally {
    await card.evaluate((el) => el.shadowRoot.querySelector('style[data-shot-mask]')?.remove());
  }
  return true;
}

// ── Per-patient run ───────────────────────────────────────────────────────────

async function shootPatient(page, { label, pdfDir, imageDir }, opts) {
  const pdfs = readdirSync(pdfDir).filter((f) => f.endsWith('.pdf')).map((f) => join(pdfDir, f));
  if (!pdfs.length) throw new Error(`No PDFs in ${pdfDir} — did the scenario generate anything?`);

  console.log(`\n── ${label} (${pdfs.length} session${pdfs.length === 1 ? '' : 's'}) → ${imageDir}`);
  mkdirSync(imageDir, { recursive: true });

  await page.goto('/aggregate/', { timeout: NAV_TIMEOUT });
  await uploadInput(page).setInputFiles(pdfs);

  const firstCard = page.locator('trajectory-chart').first();
  await firstCard.waitFor({ state: 'visible', timeout: 20_000 });
  // The config fetch that supplies severity bands and the heatmap resolves
  // after the first render; the heatmap button appearing is the signal that
  // overlays have landed. Absent for instruments with no config — hence the
  // short timeout and the swallow.
  await firstCard.locator('button[data-view="heatmap"]')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => console.warn('   ! no config overlays loaded — charts render without severity bands'));

  let written = 0;
  for (const { card, id } of await instrumentCards(page)) {
    for (const view of opts.views) {
      const outPath = join(imageDir, `${id}-${view}.png`);
      if (view === 'chart') {
        await shootChart(page, card, outPath, opts);
      } else if (!(await shootHeatmap(page, card, outPath))) {
        console.warn(`   ! ${id}: no heatmap (needs the instrument's config) — skipped`);
        continue;
      }
      console.log(`   ✓ ${id}-${view}.png`);
      written++;
    }
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseOut = resolve(ROOT, opts.out);

  // Build the PDFs first, in their own vite-node subprocess (report.js needs
  // Vite's `?url` font imports). Same delegation tests/e2e/global-setup.js uses.
  console.log('Generating PDFs…');
  execFileSync('npm', ['run', '-s', 'demo', '--', opts.scenario, '--out', opts.out], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const patients = normalizeScenario(JSON.parse(readFileSync(resolve(ROOT, opts.scenario), 'utf8')));

  console.log('\nStarting the app…');
  const server = await createServer({ root: ROOT, mode: 'development', server: { port: 0 } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('Vite did not report a local URL.');

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({ baseURL: url, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();

  let total = 0;
  try {
    for (const [i, patient] of patients.entries()) {
      const pdfDir = patientOutDir(patient, i, patients.length, baseOut);
      total += await shootPatient(
        page,
        {
          label: patient.pid ?? '(no pid)',
          pdfDir,
          imageDir: join(pdfDir, 'images'),
        },
        opts
      );
    }
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }

  console.log(`\n${total} image${total === 1 ? '' : 's'} written under ${baseOut}`);
}

main().catch((err) => {
  if (err instanceof ScenarioError) console.error(`\n${err.message}\n`);
  else console.error(err);
  process.exit(1);
});
