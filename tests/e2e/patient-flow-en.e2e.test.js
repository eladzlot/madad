/**
 * tests/e2e/patient-flow-en.e2e.test.js
 *
 * The English patient journey: a link with `lang=en` must render an LTR,
 * English-chrome app from the English config directory, and the PDF it
 * produces must record the language in its envelope. The Hebrew journey in
 * patient-flow.e2e.test.js stays the reference for everything else.
 */

import { test, expect } from '@playwright/test';
import { en } from '../../src/i18n/en.js';

const EN_URL = '/?items=phq9&lang=en#pid=E2E-EN-1';

async function clickBegin(page) {
  await page.locator('welcome-screen >> button.begin-btn').click();
}

async function answerAll(page, optionIndex = 0) {
  await expect(page.locator('item-instructions')).toBeVisible();
  await page.locator('item-instructions >> button.continue-btn').click();
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('item-select')).toBeVisible();
    const lenBefore = await page.evaluate(() => window.history.length);
    await page.locator('item-select >> button.option').nth(optionIndex).click();
    if (i < 8) await page.waitForFunction(n => window.history.length > n, lenBefore);
  }
}

test.describe('English patient flow', () => {
  test('document is LTR English with the English instrument', async ({ page }) => {
    await page.goto(EN_URL);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(en['app.title']);
    await expect(page.locator('welcome-screen >> button.begin-btn')).toHaveText(en['welcome.begin']);

    await clickBegin(page);
    await expect(page.locator('item-instructions')).toContainText('Over the last two weeks');
    await expect(page.locator('item-instructions >> button.continue-btn')).toHaveText(en['item.continue']);
    await expect(page.locator(`app-shell >> button[aria-label="${en['nav.back']}"]`)).toBeVisible();
  });

  test('Likert options and results are English; the PDF envelope says en', async ({ page }) => {
    await page.goto(EN_URL);
    await clickBegin(page);
    await page.locator('item-instructions >> button.continue-btn').click();
    await expect(page.locator('item-select >> button.option').first()).toContainText('Not at all');
    await page.goto(EN_URL);
    await clickBegin(page);
    await answerAll(page, 3);

    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('results-screen >> .title')).toHaveText(en['results.title']);
    await expect(page.locator('results-screen >> .score-category')).toHaveText('Severe');

    const btn = page.locator('results-screen >> button.pdf-btn--primary');
    await expect(btn).toContainText(en['results.download']);
    const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(await download.path());
    const { parsePdfBytes } = await import('../../aggregate/src/parse-pdf.js');
    const parsed = await parsePdfBytes(new Uint8Array(bytes));
    expect(parsed.ok).toBe(true);
    expect(parsed.envelope.lang).toBe('en');
    expect(parsed.envelope.instruments[0].title).toBe('Patient Health Questionnaire (PHQ-9)');
    expect(parsed.envelope.instruments[0].configVersion).toBe('1.0.0');
    expect(parsed.envelope.sessionState.scores.phq9.category).toBe('Severe');
  });

  test('an unknown language is a malformed link, not a silent Hebrew fallback', async ({ page }) => {
    await page.goto('/?items=phq9&lang=xx');
    await expect(page.locator('.boot-screen__title')).toHaveText('הקישור שגוי או שאינו זמין.');
  });

  test('an instrument without an English file fails to load rather than showing Hebrew', async ({ page }) => {
    // The dev server answers a missing config with the SPA fallback (HTML,
    // status 200) and production with a real 404 — both are load failures,
    // reported in English, never a silent Hebrew questionnaire.
    // A Hebrew-only instrument. If this one ever gains public/configs/prod/en/,
    // repoint these assertions at another config whose catalog entry is langs: ['he'].
    await page.goto('/?items=ocsrs_m&lang=en');
    const title = page.locator('.boot-screen__title');
    await expect(title).toBeVisible();
    expect([en['error.badLink'], en['error.cannotLoad']]).toContain(await title.textContent());
    await expect(page.locator('welcome-screen')).toHaveCount(0);
  });
});
