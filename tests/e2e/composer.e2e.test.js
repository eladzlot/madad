/**
 * tests/e2e/composer.e2e.test.js
 *
 * E2E contract tests for the Composer tool (/composer/).
 *
 * These tests verify system-level contracts only:
 *   - the composer boots and renders the selection UI
 *   - selecting/deselecting items generates or clears the URL
 *   - reset clears state
 *   - the generated URL launches a valid patient session in the app
 *
 * URL structure details (configs param, items order, pid format, pid
 * validation warnings) are unit-tested in composer-state.test.js via
 * buildUrl() and pidWarning() directly. Those properties do not need
 * a browser to be verified.
 */

import { test, expect } from '@playwright/test';

const COMPOSER_URL = '/composer/';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoComposer(page) {
  await page.goto(COMPOSER_URL);
  await expect(page.locator('.c-brand-name')).toBeVisible({ timeout: 10_000 });
}

async function getPreviewUrl(page) {
  // On desktop the url box is in .c-panel--output.
  // On mobile it's hidden — callers must skip or not call on mobile.
  return page.locator('.c-url-box').first().textContent();
}

async function checkItem(page, id) {
  await page.locator(`#chk-${id}`).check();
}

async function uncheckItem(page, id) {
  await page.locator(`#chk-${id}`).uncheck();
}

// ── Page load ─────────────────────────────────────────────────────────────────

test.describe('page load', () => {
  test('loads and shows branding and selection UI', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-brand-name')).toBeVisible();
    await expect(page.locator('.c-brand-page')).toBeVisible();
    await expect(page.locator('.c-search-input')).toBeVisible();
    await expect(page.locator('.c-item-list').first()).toBeVisible();
  });
});

// ── Desktop output panel ──────────────────────────────────────────────────────

test.describe('desktop output panel', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'output panel is hidden on mobile');
  });

  test('order list reflects selection order', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'test_q');
    await checkItem(page, 'phq9');
    const items = page.locator('.c-panel--output .c-order-item');
    const phq9Title = await page.locator('#chk-phq9').locator('..').locator('.c-item-name').textContent();
    const secondText = await items.nth(1).textContent();
    expect(secondText).toContain(phq9Title?.trim());
  });
});

// ── Selection ─────────────────────────────────────────────────────────────────

test.describe('selection', () => {
  test('checking an item generates a URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-url-box--empty')).not.toBeVisible();
    const url = await getPreviewUrl(page);
    expect(url).toContain('items=phq9');
  });

  test('unchecking removes item from URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await uncheckItem(page, 'phq9');
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
  });
});

// ── Patient ID ────────────────────────────────────────────────────────────────
// PID input is inside .c-panel--output — hidden on mobile.

test.describe('patient ID field', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'PID input is in the output panel, hidden on mobile');
  });

  test('entering a PID adds it to the URL', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TRC-2025-001');
    const url = await getPreviewUrl(page);
    expect(url).toContain('pid=TRC-2025-001');
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset clears selection and URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box and PID input are in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TRC-001');
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
    await expect(page.locator('#chk-phq9')).not.toBeChecked();
  });

  test('reset unchecks items (all viewports)', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('#chk-phq9')).not.toBeChecked();
  });
});

// ── Generated URL launches a valid session ────────────────────────────────────

test.describe('generated URL launches valid session', () => {
  test('URL for phq9 loads the patient app and shows welcome screen (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('URL with PID passes pid through to session (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'PID input and URL box are in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-pid-input').fill('TEST-PID-001');
    const url = await getPreviewUrl(page);
    expect(url).toContain('pid=TEST-PID-001');
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('URL for battery expands and launches welcome screen (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9_intake');
    const url = await getPreviewUrl(page);
    await page.goto(url);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });
});
