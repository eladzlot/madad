/**
 * tests/e2e/composer.e2e.test.js
 *
 * End-to-end tests for the Composer tool (/composer/).
 *
 * UI structure:
 *   - Full-width header: .c-header-wrap > .c-header > .c-brand-name
 *   - Two-panel layout (desktop ≥768px):
 *       .c-panel--picker  (visually RIGHT in RTL) — search, item list, reset
 *       .c-panel--output  (visually LEFT in RTL)  — URL box, PID, order list
 *   - Mobile: .c-panel--output is display:none
 *             sticky bar .c-mobile-bar at bottom (share + test buttons)
 *   - Reset: [data-action="reset"] inside .c-panel--picker
 *   - Copy:  [data-action="copy"]  inside .c-panel--output (desktop only)
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

  test('URL preview is empty on load (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
  });

  test('shows questionnaires from the config', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-item').first()).toBeVisible();
  });

  test('batteries appear with a badge', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-badge').first()).toBeVisible();
  });

  test('search input is focused on load', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-search-input')).toBeFocused();
  });

  test('mobile bar is visible on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile bar only shown on mobile');
    await gotoComposer(page);
    await expect(page.locator('.c-mobile-bar')).toBeVisible();
  });
});

// ── Desktop output panel ──────────────────────────────────────────────────────
// Entire describe block is skipped on mobile — .c-panel--output is display:none.

test.describe('desktop output panel', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'output panel is hidden on mobile');
  });

  test('output panel is visible on desktop', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-panel--output')).toBeVisible();
  });

  test('copy button is disabled on load', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-panel--output [data-action="copy"]')).toBeDisabled();
  });

  test('copy button enables when an item is selected', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-panel--output [data-action="copy"]')).toBeEnabled();
  });

  test('copy button disables again after unchecking all', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await uncheckItem(page, 'phq9');
    await expect(page.locator('.c-panel--output [data-action="copy"]')).toBeDisabled();
  });

  test('selected item appears in the order list', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-panel--output .c-order-list')).toBeVisible();
    await expect(page.locator('.c-panel--output .c-order-item')).toHaveCount(1);
  });

  test('selecting two items shows both in order list', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await checkItem(page, 'test_q');
    await expect(page.locator('.c-panel--output .c-order-item')).toHaveCount(2);
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

  test('order list disappears after reset', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-panel--output .c-order-list')).toBeVisible();
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('.c-panel--output .c-order-list')).not.toBeVisible();
  });

  test('drag reorder changes URL items order', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await checkItem(page, 'test_q');

    const urlBefore = await getPreviewUrl(page);
    expect(new URL(urlBefore).searchParams.get('items')).toBe('phq9,test_q');

    const first  = page.locator('.c-panel--output .c-order-item').nth(0);
    const second = page.locator('.c-panel--output .c-order-item').nth(1);
    await second.dragTo(first);

    const urlAfter = await getPreviewUrl(page);
    expect(new URL(urlAfter).searchParams.get('items')).toBe('test_q,phq9');
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

  test('URL contains configs param when item is selected (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    expect(url).toContain('configs=');
  });

  test('URL starts with current origin (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/?');
  });

  test('unchecking removes item from URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await uncheckItem(page, 'phq9');
    await expect(page.locator('.c-url-box--empty')).toBeVisible();
  });

  test('URL items param preserves selection order (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'test_q');
    await checkItem(page, 'phq9');
    const url = await getPreviewUrl(page);
    const items = new URL(url).searchParams.get('items').split(',');
    expect(items[0]).toBe('test_q');
    expect(items[1]).toBe('phq9');
  });

  test('selecting a battery adds it to the URL (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'URL box is in the output panel, hidden on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9_intake');
    const url = await getPreviewUrl(page);
    expect(url).toContain('phq9_intake');
  });

  test('item card gets selected style when checked', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    const card = page.locator('#chk-phq9').locator('xpath=ancestor::li[1]');
    await expect(card).toHaveClass(/c-item--selected/);
  });

  test('mobile bar test button enables when item selected', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile bar only shown on mobile');
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await expect(page.locator('.c-mobile-bar [data-action="test"]')).toBeEnabled();
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

  test('Escape clears search and returns focus to input', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').fill('phq9');
    await page.locator('.c-search-input').press('Escape');
    await expect(page.locator('.c-search-input')).toHaveValue('');
    await expect(page.locator('.c-search-input')).toBeFocused();
  });

  test('already-selected items stay checked after search', async ({ page }) => {
    await gotoComposer(page);
    await checkItem(page, 'phq9');
    await page.locator('.c-search-input').fill('phq9');
    await expect(page.locator('#chk-phq9')).toBeChecked();
  });
});

// ── Descriptions toggle ───────────────────────────────────────────────────────

test.describe('descriptions toggle', () => {
  test('descriptions are hidden by default', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-item-desc').first()).not.toBeVisible();
  });

  test('clicking פרטים shows item descriptions', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('[aria-label="הצג תיאורים"]').click();
    const descCount = await page.locator('.c-item-desc').count();
    expect(descCount).toBeGreaterThan(0);
  });

  test('clicking פרטים again hides descriptions', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('[aria-label="הצג תיאורים"]').click();
    await page.locator('[aria-label="הצג תיאורים"]').click();
    await expect(page.locator('.c-item-desc').first()).not.toBeVisible();
  });

  test('פרטים button aria-pressed reflects toggle state', async ({ page }) => {
    await gotoComposer(page);
    const btn = page.locator('[aria-label="הצג תיאורים"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Keyboard navigation ───────────────────────────────────────────────────────

test.describe('keyboard navigation', () => {
  test('ArrowDown from search focuses first item checkbox', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').press('ArrowDown');
    await expect(page.locator('.c-item-checkbox').first()).toBeFocused();
  });

  test('ArrowDown moves focus to next checkbox', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').press('ArrowDown');
    await page.locator('.c-item-checkbox').first().press('ArrowDown');
    await expect(page.locator('.c-item-checkbox').nth(1)).toBeFocused();
  });

  test('ArrowUp from first item returns focus to search', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').press('ArrowDown');
    await page.locator('.c-item-checkbox').first().press('ArrowUp');
    await expect(page.locator('.c-search-input')).toBeFocused();
  });

  test('Enter toggles item and advances focus', async ({ page }) => {
    await gotoComposer(page);
    await page.locator('.c-search-input').press('ArrowDown');
    const first = page.locator('.c-item-checkbox').first();
    const firstId = await first.getAttribute('value');
    await first.press('Enter');
    await expect(page.locator(`#chk-${firstId}`)).toBeChecked();
    await expect(page.locator('.c-item-checkbox').nth(1)).toBeFocused();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset button is in the picker panel', async ({ page }) => {
    await gotoComposer(page);
    await expect(page.locator('.c-panel--picker [data-action="reset"]')).toBeVisible();
  });

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

  test('reset clears PID field (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'PID input is in the output panel, hidden on mobile');
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
