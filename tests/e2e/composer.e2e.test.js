/**
 * tests/e2e/composer.test.js
 *
 * End-to-end tests for the Composer tool (/composer/composer.html).
 *
 * Tests cover:
 *   - page load and basic UI structure
 *   - questionnaire and battery selection
 *   - URL generation and live updates
 *   - patient ID field
 *   - search / filtering
 *   - copy button feedback
 *   - reset button
 *   - generated URL launches a valid session
 */

import { test, expect } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPOSER_URL = '/composer/index.html';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navigate to composer and wait for it to finish loading */
async function gotoComposer(page) {
  await page.goto(COMPOSER_URL);
  // Wait for either the item list to appear or an error to show
  await expect(
    page.locator('.c-item-list, .c-error, .c-empty')
  ).toBeVisible({ timeout: 15_000 });
}

/** Get the current URL shown in the URL preview box */
async function getPreviewUrl(page) {
  return page.locator('.c-url-box').textContent();
}

/** Check a questionnaire/battery by its item ID */
async function checkItem(page, id) {
  await page.locator(`#chk-${id}`).check();
}

/** Uncheck a questionnaire/battery by its item ID */
async function uncheckItem(page, id) {
  await page.locator(`#chk-${id}`).uncheck();
}

// ── Page load ─────────────────────────────────────────────────────────────────

test.describe('page load', () => {
  test('loads and shows the selection UI', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-title')).toBeVisible();
    await expect(page.locator('.c-search-input')).toBeVisible();
    await expect(page.locator('.c-item-list').first()).toBeVisible();
  });

  test('URL preview is empty on load', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
  });

  test('copy button is disabled on load', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('[data-action="copy"]')).toBeDisabled();
  });

  test('shows questionnaires from the config', async ({ page }) => {
    await gotoComposer(page);
    // At least one item should be in the list
    await expect(page.locator('.c-item').first()).toBeVisible();
  });

  test('batteries appear with a badge', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-badge').first()).toBeVisible();
  });
});

// ── Selection ─────────────────────────────────────────────────────────────────

test.describe('selection', () => {
  test('checking an item generates a URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-url-box--empty')).not.toBeVisible();
    const url = await getPreviewUrl(page);
    expect(url).toContain('items=phq9');
  });

  test('URL contains configs param when item is selected', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    expect(url).toContain('configs=');
  });

  test('URL starts with current origin', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/?');
  });

  test('unchecking removes item from URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await uncheckItem(page, 'phq9');
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
  });

  test('selected item appears in the order list', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-order-list')).toBeVisible();
    await expect(page.locator('.c-order-item')).toHaveCount(1);
  });

  test('selecting two items shows both in order list', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await checkItem(page, 'test_q');
    await expect(page.locator('.c-order-item')).toHaveCount(2);
  });

  test('order list reflects selection order, not list order', async ({ page }) => {
    await gotoComposer(page);
    // Select test_q before phq9
    await checkItem(page, 'test_q');
    await checkItem(page, 'phq9');
    const items = page.locator('.c-order-item');
    const first = await items.nth(0).textContent();
    const second = await items.nth(1).textContent();
    // first selected should appear first in order
    expect(first).not.toBe(second);
    // test_q was checked first so should be first
    const phq9Title = await page.locator('#chk-phq9').locator('..').locator('.c-item-name').textContent();
    expect(second).toContain(phq9Title?.trim());
  });

  test('URL items param preserves selection order', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'test_q');
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    const itemsIndex = url.indexOf('items=');
    const itemsValue = url.slice(itemsIndex + 6).split('&')[0];
    expect(itemsValue.split(',')[0]).toBe('test_q');
    expect(itemsValue.split(',')[1]).toBe('phq9');
  });

  test('selecting a battery adds it to the URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9_intake');
    const url = await getPreviewUrl(page);
    expect(url).toContain('phq9_intake');
  });

  test('copy button becomes enabled when items are selected', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('[data-action="copy"]')).toBeEnabled();
  });

  test('copy button becomes disabled again after unchecking all', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await uncheckItem(page, 'phq9');
    await expect(page.locator('[data-action="copy"]')).toBeDisabled();
  });
});

// ── Patient ID ────────────────────────────────────────────────────────────────

test.describe('patient ID field', () => {
  test('entering a PID adds it to the URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TRC-2025-001');
    const url = await getPreviewUrl(page);
    expect(url).toContain('pid=TRC-2025-001');
  });

  test('clearing PID removes it from URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TRC-001');
    await page.locator('.c-pid-input').fill('');
    const url = await getPreviewUrl(page);
    expect(url).not.toContain('pid=');
  });

  test('invalid PID characters show a warning', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-pid-input').fill('invalid pid!');
    await expect(page.locator('.c-warnings')).toBeVisible();
    await expect(page.locator('.c-warning-item')).toBeVisible();
  });

  test('valid PID shows no warning', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-pid-input').fill('TRC-2025-001');
    await expect(page.locator('.c-warnings')).not.toBeVisible();
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

test.describe('search', () => {
  test('searching by questionnaire ID filters the list', async ({ page }) => {
    await gotoComposer(page);
    const totalBefore = await page.locator('.c-item').count();
    await page.locator('.c-search-input').fill('phq9');
    const totalAfter = await page.locator('.c-item').count();
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);
    // phq9 should still be visible
    await expect(page.locator('#chk-phq9')).toBeVisible();
  });

  test('searching for a non-matching string shows no-results message', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').fill('xyzzy_not_a_real_questionnaire');
    await expect(page.locator('.c-no-results')).toBeVisible();
    await expect(page.locator('.c-item')).toHaveCount(0);
  });

  test('clearing search restores the full list', async ({ page }) => {
    await gotoComposer(page);
    const totalBefore = await page.locator('.c-item').count();
    await page.locator('.c-search-input').fill('phq9');
    await page.locator('.c-search-input').fill('');
    const totalAfter = await page.locator('.c-item').count();
    expect(totalAfter).toBe(totalBefore);
  });

  test('already-selected items stay checked after search', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-search-input').fill('phq9');
    await expect(page.locator('#chk-phq9')).toBeChecked();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset clears selection and URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TRC-001');
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
    await expect(page.locator('#chk-phq9')).not.toBeChecked();
  });

  test('reset clears PID field', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-pid-input').fill('TRC-001');
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-pid-input')).toHaveValue('');
  });

  test('reset clears search query', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').fill('phq9');
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-search-input')).toHaveValue('');
  });

  test('order list disappears after reset', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-order-list')).toBeVisible();
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-order-list')).not.toBeVisible();
  });
});

// ── Generated URL launches a valid session ────────────────────────────────────

test.describe('generated URL launches valid session', () => {
  test('URL for phq9 loads the patient app and shows welcome screen', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    // Navigate to the generated URL
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('URL with PID passes pid through to session', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TEST-PID-001');
    const url = await getPreviewUrl(page);
    expect(url).toContain('pid=TEST-PID-001');
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('URL for battery expands and launches welcome screen', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9_intake');
    const url = await getPreviewUrl(page);
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });
});
