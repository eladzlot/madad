/**
 * tests/e2e/composer.e2e.test.js
 *
 * E2E contract tests for the Composer tool (/composer/) after the Stage 3 Lit
 * rewrite. System-level contracts only:
 *   - the composer boots and renders the browse UI
 *   - selecting/deselecting items generates or clears the patient URL
 *   - selection order is preserved and reorderable
 *   - the patient-ID field flows into the URL
 *   - reset clears state
 *   - the generated URL launches a valid patient session
 *   - browse affordances: tabs, curated view → הצג הכל, search, mobile sheet
 *
 * URL grammar details (items-only, pid format/validation) are unit-tested in
 * composer-state.test.js / composer-store.test.js. Playwright's CSS/text engines
 * pierce open shadow DOM, so component-internal selectors resolve directly.
 *
 * Runs against the dev server (npm run dev), where the dev fixtures test_q and
 * phq9_intake are present in the catalog. phq9 is featured, so it shows in the
 * curated default view; the non-featured fixtures are reached via search.
 */

import { test, expect } from '@playwright/test';

const COMPOSER_URL = '/composer/';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoComposer(page) {
  await page.goto(COMPOSER_URL);
  // The shared <clinician-nav> renders only after the catalog loads and
  // <composer-app> mounts — its brand is the bootstrap-finished signal.
  await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
}

const searchBox = (page) => page.locator('catalog-controls input[type="search"]');
const cardButton = (page, id) => page.locator(`catalog-card[data-id="${id}"] button`);
const urlBox = (page) => page.locator('selection-cart .url-box');

// The category switch (tabs) and filter chips are collapsed behind the סינון
// caret — open it before touching a tab.
async function openFilters(page) {
  await page.locator('catalog-controls .filter-caret').click();
  await expect(page.locator('catalog-controls [role="tablist"]')).toBeVisible();
}

// Reach any instrument (featured or not) by searching, then toggle its card.
async function selectItem(page, id) {
  await searchBox(page).fill(id);
  await cardButton(page, id).click();
  await searchBox(page).fill('');
}

// ── Page load ─────────────────────────────────────────────────────────────────

test.describe('page load', () => {
  test('loads branding, the active-page nav link, and the browse UI', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveText('מחולל קישורים');
    await expect(page.locator('clinician-nav .link[href="../aggregate/"]')).toHaveCount(1);
    await expect(searchBox(page)).toBeVisible();
    await expect(page.locator('catalog-card').first()).toBeVisible();
  });

  test('curated default view shows featured instruments with a הצג הכל escape', async ({ page }) => {
    await gotoComposer(page);
    // phq9 is featured → visible without searching.
    await expect(page.locator('catalog-card[data-id="phq9"]')).toBeVisible();
    // A non-featured dev fixture is hidden until show-all / search.
    await expect(page.locator('catalog-card[data-id="test_q"]')).toHaveCount(0);
    await page.locator('catalog-list .curated-note .link-btn').click();
    await expect(page.locator('catalog-card[data-id="test_q"]')).toBeVisible();
  });
});

// ── Selection → URL (desktop cart) ─────────────────────────────────────────────

test.describe('selection', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'the URL cart is desktop-only; mobile uses the bottom sheet');
  });

  test('checking an item generates an items= URL', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await expect(urlBox(page)).toContainText('items=phq9');
  });

  test('unchecking clears the URL', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await cardButton(page, 'phq9').click(); // toggle off (phq9 visible in curated view)
    await expect(urlBox(page)).toContainText('לא נבחרו');
  });

  test('the cart lists selections in order', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'test_q');
    await selectItem(page, 'phq9');
    const titles = page.locator('selection-cart li.item .item-title');
    await expect(titles).toHaveCount(2);
    // phq9 was picked second → second row.
    const phq9Title = await cardButton(page, 'phq9').locator('.name').textContent();
    await expect(titles.nth(1)).toContainText((phq9Title ?? '').trim());
  });

  test('reorder (↑) swaps the last item ahead of the first', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'test_q');
    await selectItem(page, 'phq9');
    // Move the 2nd row up → phq9 becomes first in the URL.
    await page.locator('selection-cart li.item').nth(1).locator('[aria-label="הזז מעלה"]').click();
    await expect(urlBox(page)).toContainText('items=phq9,test_q');
  });
});

// ── Patient ID ────────────────────────────────────────────────────────────────

test.describe('patient ID field', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'PID field is in the desktop cart');
  });

  test('entering a PID adds it to the URL', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await page.locator('#cart-pid').fill('TRC-2025-001');
    await expect(urlBox(page)).toContainText('pid=TRC-2025-001');
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset clears selection and URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'reset lives in the desktop cart');
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await page.locator('#cart-pid').fill('TRC-001');
    await page.locator('catalog-controls .reset-btn').click();
    await expect(urlBox(page)).toContainText('לא נבחרו');
    await expect(page.locator('catalog-card[data-id="phq9"] button')).toHaveAttribute('aria-checked', 'false');
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

test.describe('tabs', () => {
  test('switching to the batteries tab shows batteries', async ({ page }) => {
    await gotoComposer(page);
    await openFilters(page);
    await page.locator('catalog-controls [role="tab"]', { hasText: 'סוללות' }).click();
    await expect(page.locator('catalog-controls [role="tab"][aria-pressed="true"]')).toHaveText('סוללות');
    await expect(page.locator('catalog-card').first()).toBeVisible();
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

test.describe('search', () => {
  test('typing filters the list to matching instruments', async ({ page }) => {
    await gotoComposer(page);
    await searchBox(page).fill('phq9');
    await expect(page.locator('catalog-card[data-id="phq9"]')).toBeVisible();
  });
});

// ── Mobile bottom sheet ────────────────────────────────────────────────────────

test.describe('mobile bottom sheet', () => {
  test('selecting then opening the sheet shows the link and PID', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the bottom sheet is the mobile-only selection surface');
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await expect(page.locator('mobile-bar .count')).toContainText('נבחרו 1');
    await page.locator('mobile-bar .bar button:has-text("פרטים")').click();
    const sheet = page.locator('mobile-bar .sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.url-box')).toContainText('items=phq9');
    await expect(sheet.locator('#sheet-pid')).toBeVisible();
  });
});

// ── Generated URL launches a valid session ────────────────────────────────────

test.describe('generated URL launches valid session', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'reads the URL from the desktop cart');
  });

  test('phq9 URL loads the patient app welcome screen', async ({ page }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    const url = await urlBox(page).textContent();
    await page.goto(url.trim());
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('a battery URL expands and launches the welcome screen', async ({ page }) => {
    await gotoComposer(page);
    // Batteries live in their own tab; search is scoped to the active tab.
    await openFilters(page);
    await page.locator('catalog-controls [role="tab"]', { hasText: 'סוללות' }).click();
    await selectItem(page, 'phq9_intake');
    const url = await urlBox(page).textContent();
    await page.goto(url.trim());
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });
});
