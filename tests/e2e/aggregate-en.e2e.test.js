/**
 * tests/e2e/aggregate-en.e2e.test.js
 *
 * The Aggregate with an English UI and a mixed-language corpus: PDFs a
 * patient answered in English (tests/fixtures/pdfs/en3, generated from
 * tests/fixtures/scenarios/english-3-weeks.json) and PDFs answered in Hebrew
 * (mixed15). Titles and chart chrome must follow the *clinician's* language;
 * the answers inside a session stay in the *patient's* language, flagged by
 * a badge when the two differ.
 */

import { test, expect } from '@playwright/test';
import { en } from '../../clinician/i18n/en.js';

const uploadInput = (page) => page.locator('upload-list input[type="file"]');

async function fixtureFiles(dir, take = Infinity) {
  const { readdirSync } = await import('fs');
  const base = new URL(`../fixtures/pdfs/${dir}/`, import.meta.url).pathname;
  return readdirSync(base).filter(n => n.endsWith('.pdf')).sort().slice(0, take).map(n => base + n);
}

test.describe('aggregate in English', () => {
  test('English UI, English-answered PDFs: titles, bands and chrome in English', async ({ page }) => {
    await page.goto('/aggregate/?lang=en');
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page).toHaveTitle(en['aggregate.title']);
    await expect(page.locator('upload-list label')).toContainText(en['upload.choose']);

    await uploadInput(page).setInputFiles(await fixtureFiles('en3'));
    await expect(page.locator('upload-list details.ok-summary summary')).toContainText('3 reports loaded');

    const charts = page.locator('trajectory-chart');
    await expect(charts).toHaveCount(2);
    await expect(charts.nth(0).locator('h3')).toContainText('Patient Health Questionnaire (PHQ-9)');
    await expect(charts.nth(1).locator('h3')).toContainText('Generalized Anxiety Disorder scale (GAD-7)');
    // Severity bands come from the English config.
    await expect(charts.nth(0).locator('svg text', { hasText: 'Moderate' }).first()).toBeVisible();
    await expect(charts.nth(0).locator('.c-seg button').first()).toHaveText(en['chart.chart']);

    // Table view: English headers, en-GB dates.
    await charts.nth(0).locator('.c-seg button[data-view="table"]').click();
    await expect(charts.nth(0).locator('th').first()).toHaveText(en['chart.date']);
    await expect(charts.nth(0).locator('td').first()).toContainText('01/05/2026');
  });

  test('Hebrew-answered PDFs in an English UI: English title, Hebrew answers with a language badge', async ({ page }) => {
    await page.goto('/aggregate/?lang=en');
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await uploadInput(page).setInputFiles(await fixtureFiles('mixed15', 2));

    const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' });
    await expect(phq.locator('h3')).toContainText('Patient Health Questionnaire (PHQ-9)');
    // WSAS has an English file now, so it resolves through it like PHQ-9.
    await expect(page.locator('trajectory-chart h3', { hasText: 'WSAS' }))
      .toContainText('Work and Social Adjustment Scale (WSAS)');

    await phq.locator('circle').first().click();
    const panel = page.locator('session-detail');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toContainText('Patient Health Questionnaire (PHQ-9)');
    await expect(panel.locator('.lang-badge')).toContainText('עברית');
    await expect(panel.locator('h4')).toHaveText(en['detail.answers']);
    // Scored answers are stored as values; their labels resolve through the
    // loaded (English) config — structural parity guarantees the same value
    // means the same option in every language.
    await expect(panel.locator('.items .q-answer').first()).toContainText('Nearly every day');
  });

  test('no badge when the report and UI languages agree', async ({ page }) => {
    await page.goto('/aggregate/?lang=en');
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await uploadInput(page).setInputFiles(await fixtureFiles('en3', 1));
    await page.locator('trajectory-chart').first().locator('circle').first().click();
    await expect(page.locator('session-detail')).toBeVisible();
    await expect(page.locator('session-detail .lang-badge')).toHaveCount(0);
  });
});
