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

const E2E_CONFIG = '/configs/test/e2e.json';
const PHQ9_URL = `/?configs=${E2E_CONFIG}&items=phq9_intake&pid=E2E-001`;

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
  await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
  await page.locator('completion-screen >> button.view-btn').click();
  await expect(page.locator('results-screen')).toBeVisible();

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

    // Per-file status row flips to "received".
    await expect(page.locator('upload-list li.ok')).toContainText('נקלט');

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

    await expect(page.locator('upload-list li.ok')).toHaveCount(2);
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

    // View-as-table toggles the numeric reference.
    await chart.locator('.table-toggle').click();
    const table = chart.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(1);
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
