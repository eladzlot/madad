/**
 * tests/e2e/help.e2e.test.js
 *
 * E2E contract tests for the Help surface (/help/). The page is static
 * Hebrew/RTL content plus the shared <clinician-nav>; there is no app state.
 * Contracts:
 *   - the page boots (nav registers, styles adopt) and marks עזרה active
 *   - the workflow walkthrough and FAQ render
 *   - the FAQ accordion opens
 *   - the cross-links to the composer and aggregate surfaces are present
 *
 * Runs against the dev server (npm run dev). Playwright pierces open shadow DOM,
 * so <clinician-nav>'s internal links resolve directly.
 */

import { test, expect } from '@playwright/test';

const HELP_URL = '/help/';

test.describe('help page', () => {
  test('boots, marks the active nav link, and renders the walkthrough + FAQ', async ({ page }) => {
    await page.goto(HELP_URL);

    // The shared <clinician-nav> renders only after help.js registers it — the
    // brand is the bootstrap-finished signal.
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveText('עזרה');

    // Static content authored directly in help/index.html.
    await expect(page.getByRole('heading', { name: 'איך עובדים עם מדד' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'תהליך העבודה' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'שאלות נפוצות' })).toBeVisible();

    // Cross-links back into the tool surfaces.
    await expect(page.locator('main a[href="../composer/"]').first()).toBeVisible();
    await expect(page.locator('main a[href="../aggregate/"]').first()).toBeVisible();
  });

  test('FAQ items expand on click', async ({ page }) => {
    await page.goto(HELP_URL);
    const first = page.locator('.faq details').first();
    await expect(first).not.toHaveAttribute('open', /.*/);
    await first.locator('summary').click();
    await expect(first).toHaveAttribute('open', /.*/);
  });
});

test.describe('help page in English', () => {
  test('?lang=en shows the English guide, LTR, with English nav', async ({ page }) => {
    await page.goto('/help/?lang=en');
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('clinician-nav .link[aria-current="page"]')).toHaveText('Help');
    await expect(page.getByRole('heading', { name: 'How Madad works' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'איך עובדים עם מדד' })).toHaveCount(0);
    await expect(page.locator('main[data-lang="he"]')).toBeHidden();
    await expect(page.locator('main[data-lang="en"] a[href="../composer/?lang=en"]').first()).toBeVisible();
  });

  test('a Hebrew visit keeps the English block hidden', async ({ page }) => {
    await page.goto('/help/?lang=he');
    await expect(page.locator('clinician-nav .brand')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main[data-lang="en"]')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'איך עובדים עם מדד' })).toBeVisible();
  });
});

