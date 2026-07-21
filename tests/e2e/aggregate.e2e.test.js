/**
 * tests/e2e/aggregate.e2e.test.js
 *
 * The Aggregate round-trip: a real PDF produced by the patient flow is
 * uploaded into /aggregate/ and must come back as a chart. This is the
 * only test that exercises the full write→read envelope contract against
 * genuine pdfmake output (unit tests use synthetic fixtures).
 *
 * Overlay note: the dev e2e config is referenced by a legacy path
 * (/configs/test/e2e.json), which the aggregate store deliberately excludes
 * from config loading (short names only — base-path safety). Charts here
 * therefore render without severity bands; overlay geometry is pinned by
 * aggregate/src/chart/chart-model.test.js instead.
 */

import { test, expect } from '@playwright/test';

const PHQ9_URL = `/?items=phq9_intake&pid=E2E-001`;

// ── Patient-flow helpers (mirrors patient-flow.e2e.test.js) ──────────────────

async function clickBegin(page) {
  await page.locator('welcome-screen >> button.begin-btn').click();
}

async function answerAllPHQ9Items(page, optionIndex = 0) {
  await expect(page.locator('item-instructions')).toBeVisible();
  await page.locator('item-instructions >> button.continue-btn').click();
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('item-select')).toBeVisible();
    const lenBefore = await page.evaluate(() => window.history.length);
    await page.locator('item-select >> button.option').nth(optionIndex).click();
    if (i < 8) {
      await page.waitForFunction(n => window.history.length > n, lenBefore);
    }
  }
}

/**
 * Complete a PHQ-9 session and return the downloaded PDF as a
 * setInputFiles payload. Playwright stores downloads under GUID temp names
 * with no extension, so uploading by path would lose the real filename and
 * mime type — the payload form preserves both.
 */
async function downloadReport(page, optionIndex = 0) {
  await page.goto(PHQ9_URL);
  await clickBegin(page);
  await answerAllPHQ9Items(page, optionIndex);
  await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });

  const pdfBtn = page.locator('results-screen >> button.pdf-btn--primary');
  await expect(pdfBtn).not.toHaveAttribute('disabled', { timeout: 5000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    pdfBtn.click(),
  ]);
  const { readFileSync } = await import('fs');
  return {
    name: download.suggestedFilename(),
    mimeType: 'application/pdf',
    buffer: readFileSync(await download.path()),
  };
}

const uploadInput = (page) => page.locator('upload-list input[type="file"]');

// ── Round-trip ────────────────────────────────────────────────────────────────

test.describe('aggregate round-trip', () => {
  test('a patient PDF uploads into a rendered trajectory chart', async ({ page }) => {
    const pdfFile = await downloadReport(page, 0);

    await page.goto('/aggregate/');
    await expect(page.locator('upload-list')).toBeVisible();
    await uploadInput(page).setInputFiles(pdfFile);

    // Successes collapse into a one-line summary (failures would get rows).
    await expect(page.locator('upload-list details.ok-summary summary')).toContainText('דוח אחד נקלט');

    // The chart renders: instrument title + one marker, no connecting line.
    const chart = page.locator('trajectory-chart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('h3')).toContainText('PHQ-9 (E2E)');
    await expect(chart.locator('circle')).toHaveCount(1);
    await expect(chart.locator('path')).toHaveCount(0);
  });

  test('two sessions chart as two markers with a connecting line (no dedup)', async ({ page }) => {
    const pdfFile = await downloadReport(page, 1);

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles([pdfFile, pdfFile]);

    await expect(page.locator('upload-list details.ok-summary summary')).toContainText('נקלטו 2 דוחות');
    const chart = page.locator('trajectory-chart');
    // optionIndex 1 → PHQ-9 item 9 = 1 → suicidality alert → each marker
    // carries an alert ring: 2 markers + 2 rings.
    await expect(chart.locator('circle')).toHaveCount(4);
    await expect(chart.locator('path')).toHaveCount(1);
  });
});

// ── Interaction (AGGREGATE_SPEC §5.6) ─────────────────────────────────────────

test.describe('aggregate interaction', () => {
  test('tooltip, detail panel with PDF download, and view-as-table', async ({ page }) => {
    const pdfFile = await downloadReport(page, 1);   // option 1 → alert fires

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles(pdfFile);
    const chart = page.locator('trajectory-chart');
    await expect(chart).toBeVisible();

    // Hover a marker → tooltip with the total.
    await chart.locator('.marker').first().hover();
    await expect(chart.locator('.tooltip')).toBeVisible();
    await expect(chart.locator('.tooltip')).toContainText('9');   // PHQ-9 total: 9×1

    // Click the marker → detail panel with the session breakdown.
    await chart.locator('.marker').first().click();
    const panel = page.locator('session-detail');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('PHQ-9 (E2E)');
    await expect(panel).toContainText('9');

    // The panel offers the original PDF back as a download.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      panel.locator('a.download').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Escape closes the panel.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // The segmented view switcher (D-16) swaps the chart for the numeric table.
    await chart.locator('[data-view="table"]').click();
    const table = chart.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(chart.locator('svg')).toHaveCount(0);   // views are exclusive
  });

  test('markers are keyboard-operable: arrows move focus, Enter opens the panel', async ({ page }) => {
    const pdfFile = await downloadReport(page, 0);

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles([pdfFile, pdfFile]);
    const chart = page.locator('trajectory-chart');
    await expect(chart.locator('.marker')).toHaveCount(2);

    await chart.locator('.marker').first().focus();
    await expect(chart.locator('.tooltip')).toBeVisible();   // focus shows tooltip

    await page.keyboard.press('ArrowRight');                  // move to 2nd marker
    await page.keyboard.press('Enter');                       // open panel
    await expect(page.locator('session-detail')).toBeVisible();
  });
});

// ── Image export (AGGREGATE_SPEC §6) ──────────────────────────────────────────

test.describe('aggregate image export', () => {
  test('SVG export carries the chart framing; pid appears only when opted in', async ({ page }) => {
    const pdfFile = await downloadReport(page, 0);   // session pid = E2E-001

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles(pdfFile);
    const chart = page.locator('trajectory-chart');
    await expect(chart).toBeVisible();

    // PNG/SVG/pid live in the ייצוא dropdown (D-16); open it if closed.
    const openExportMenu = async () => {
      const menu = chart.locator('details.export-menu');
      if (!(await menu.evaluate((d) => d.open))) await menu.locator('summary').click();
    };

    const downloadSvg = async () => {
      await openExportMenu();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        chart.locator('.export-svg').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^madad-phq9_test-\d{4}-\d{2}-\d{2}\.svg$/);
      const { readFileSync } = await import('fs');
      return readFileSync(await download.path(), 'utf8');
    };

    // Default: title, timestamp footer, brand — and no pid.
    const plain = await downloadSvg();
    expect(plain).toContain('PHQ-9 (E2E)');
    expect(plain).toContain('הופק');
    expect(plain).toContain('מדד');
    expect(plain).not.toContain('E2E-001');

    // Opt in → pid stamped.
    await openExportMenu();
    await chart.locator('.export-pid input').check();
    const withPid = await downloadSvg();
    expect(withPid).toContain('מזהה: E2E-001');
  });

  test('copy places a PNG on the clipboard with visible feedback', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission grants are chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const pdfFile = await downloadReport(page, 0);

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles(pdfFile);
    const chart = page.locator('trajectory-chart');
    await expect(chart).toBeVisible();

    await chart.locator('.export-copy').click();
    await expect(chart.locator('.export-copy')).toContainText('הועתק');

    const types = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return item.types;
    });
    expect(types).toContain('image/png');
  });

  test('PNG export rasterizes in-browser and downloads a real image', async ({ page }) => {
    const pdfFile = await downloadReport(page, 0);

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles(pdfFile);
    const chart = page.locator('trajectory-chart');
    await expect(chart).toBeVisible();

    await chart.locator('details.export-menu summary').click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      chart.locator('.export-png').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const { readFileSync } = await import('fs');
    const buffer = readFileSync(await download.path());
    // PNG magic bytes; a broken canvas path would download nothing or an SVG.
    expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(buffer.length).toBeGreaterThan(10_000);   // 1600×1000 chart, not a stub
  });
});

// ── Bad-file handling (AGGREGATE_SPEC §5.7) ───────────────────────────────────

test.describe('aggregate bad-file handling', () => {
  test('non-PDF and non-Madad files get per-file warnings; page keeps working', async ({ page }) => {
    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a pdf') },
      { name: 'other.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF') },
    ]);

    const failed = page.locator('upload-list li.failed');
    await expect(failed).toHaveCount(2);
    await expect(failed.nth(0)).toContainText('לא קובץ PDF');
    await expect(failed.nth(1)).toContainText('לא דוח מדד');
    await expect(page.locator('trajectory-chart')).toHaveCount(0);
  });
});
