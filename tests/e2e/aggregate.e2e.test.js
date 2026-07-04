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

/** Complete a PHQ-9 session and return the downloaded PDF's temp path. */
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
  return download.path();
}

const uploadInput = (page) => page.locator('upload-list input[type="file"]');

// ── Round-trip ────────────────────────────────────────────────────────────────

test.describe('aggregate round-trip', () => {
  test('a patient PDF uploads into a rendered trajectory chart', async ({ page }) => {
    const pdfPath = await downloadReport(page, 0);

    await page.goto('/aggregate/');
    await expect(page.locator('upload-list')).toBeVisible();
    await uploadInput(page).setInputFiles(pdfPath);

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
    const pdfPath = await downloadReport(page, 1);

    await page.goto('/aggregate/');
    await uploadInput(page).setInputFiles([pdfPath, pdfPath]);

    await expect(page.locator('upload-list li.ok')).toHaveCount(2);
    const chart = page.locator('trajectory-chart');
    // optionIndex 1 → PHQ-9 item 9 = 1 → suicidality alert → each marker
    // carries an alert ring: 2 markers + 2 rings.
    await expect(chart.locator('circle')).toHaveCount(4);
    await expect(chart.locator('path')).toHaveCount(1);
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
