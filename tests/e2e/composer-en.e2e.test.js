/**
 * tests/e2e/composer-en.e2e.test.js
 *
 * The Composer in English (?lang=en) and the patient-language switch. The
 * Hebrew suite (composer.e2e.test.js) stays the reference for the browse /
 * cart mechanics; this file covers what multi-language adds:
 *   - ?lang=en renders an LTR English UI with English instrument titles
 *   - the nav toggle stores the preference and reloads into the other language
 *   - choosing English as the patient language hides Hebrew-only instruments
 *     and stamps lang=en on the generated link
 */

import { test, expect } from '@playwright/test';
import { en } from '../../clinician/i18n/en.js';

const brand = (page) => page.locator('clinician-nav .brand');
const searchBox = (page) => page.locator('catalog-controls input[type="search"]');
const card = (page, id) => page.locator(`catalog-card[data-id="${id}"]`);
const urlBox = (page) => page.locator('selection-cart .url-line');

// Trial: no link exists until a valid uid is entered (REMOTE_SPEC §3). The
// field is always on screen here, so there is nothing to open first.
const UID = 'CMPS-001J';
const fillUid = (page) =>
  page.locator('selection-cart session-settings #settings-pid').fill(UID);

// The patient language is a <select> wearing a chip — one click reaches the
// native list, no disclosure in between.
const langChip = (page) => page.locator('selection-cart session-settings select.lang-chip');

async function switchPatientLang(page, code) {
  await langChip(page).selectOption(code);
}

test.describe('composer in English', () => {
  test.beforeEach(async ({ isMobile }) => {
    // The rail is the desktop surface; the phone reaches the same
    // <session-settings> through the sheet, covered in composer.e2e.test.js.
    test.skip(isMobile, 'the rail is desktop-only');
  });

  test('?lang=en renders an LTR English UI with translated titles', async ({ page }) => {
    await page.goto('/composer/?lang=en');
    await expect(brand(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page).toHaveTitle(en['composer.title']);
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveText(en['nav.composer']);
    await expect(page.locator('clinician-nav select.lang')).toHaveValue('en');
    // Cross-surface links keep the explicit language.
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveAttribute('href', '../composer/?lang=en');
    await expect(searchBox(page)).toHaveAttribute('placeholder', en['controls.searchPlaceholder']);
    // The default patient language follows the UI language, so only English
    // instruments are listed — with English titles.
    await expect(langChip(page)).toHaveValue('en');
    await expect(card(page, 'phq9').locator('.name')).toHaveText('Patient Health Questionnaire (PHQ-9)');
    // A Hebrew-only instrument. If this one ever gains public/configs/prod/en/,
    // repoint these assertions at another config whose catalog entry is langs: ['he'].
    await expect(card(page, 'ocsrs_m')).toHaveCount(0);
    await searchBox(page).fill('OCSRS');
    await expect(card(page, 'ocsrs_m')).toHaveCount(0);
  });

  test('the nav toggle reloads into the other language and remembers it', async ({ page }) => {
    await page.goto('/composer/?lang=en');
    await expect(brand(page)).toBeVisible({ timeout: 10_000 });
    await page.locator('clinician-nav select.lang').selectOption('he');
    await expect(page).toHaveURL(/lang=he/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveText('מחולל קישורים');
    // Stored preference wins on a plain visit.
    await page.goto('/composer/');
    await expect(brand(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    expect(await page.evaluate(() => localStorage.getItem('madad.lang.v1'))).toBe('he');
  });

  test('a Hebrew clinician can send an English link; the switch drops Hebrew-only picks', async ({ page }) => {
    await page.goto('/composer/?lang=he');
    await expect(brand(page)).toBeVisible({ timeout: 10_000 });
    // Pick a Hebrew-only instrument and an English-capable one.
    // A Hebrew-only instrument. If this one ever gains public/configs/prod/en/,
    // repoint these assertions at another config whose catalog entry is langs: ['he'].
    await searchBox(page).fill('OCSRS');
    await card(page, 'ocsrs_m').locator('button.card').click();
    await searchBox(page).fill('');
    await card(page, 'phq9').locator('button.card').click();
    await fillUid(page);
    await expect(urlBox(page)).toContainText('items=ocsrs_m,phq9');
    await expect(urlBox(page)).not.toContainText('lang=');

    await switchPatientLang(page, 'en');
    await expect(urlBox(page)).toContainText('items=phq9');
    await expect(urlBox(page)).toContainText('lang=en');
    await expect(page.locator('selection-cart session-settings .dropped')).toContainText('English');
    await expect(card(page, 'ocsrs_m')).toHaveCount(0);
    // Titles stay Hebrew (UI language), the link is English (patient language).
    await expect(card(page, 'phq9').locator('.name')).toContainText('PHQ-9');
    await expect(card(page, 'phq9').locator('.name')).toContainText('שאלון');

    // The generated link opens the English patient app.
    const url = (await urlBox(page).textContent()).trim();
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the preview shows the instrument in the patient language', async ({ page }) => {
    await page.goto('/composer/?lang=he');
    await expect(brand(page)).toBeVisible({ timeout: 10_000 });
    await switchPatientLang(page, 'en');
    await card(page, 'phq9').locator('button.preview-btn').click();
    const dialog = page.locator('preview-dialog dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText('Not at all');        // English option label
    await expect(dialog).toContainText('תצוגה מקדימה');       // Hebrew chrome
    await expect(dialog.locator('a.icon-btn')).toHaveAttribute('href', /lang=en/);
  });
});
