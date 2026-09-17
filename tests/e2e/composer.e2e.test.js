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
const cardButton = (page, id) => page.locator(`catalog-card[data-id="${id}"] button.card`);
const previewButton = (page, id) => page.locator(`catalog-card[data-id="${id}"] button.preview-btn`);
// <selection-cart> is one component with two hosts: it is the rail on desktop
// and the body of the phone's sheet. Same selectors either way — which is why
// these tests run in both viewports instead of skipping half of themselves.
// On a phone the rail is still in the DOM (hidden by CSS) while the sheet
// holds a second instance, so the scope has to name the visible one.
const outputScope = (isMobile) => (isMobile ? 'mobile-bar selection-cart' : 'selection-cart');
const urlBox = (page, isMobile) => page.locator(`${outputScope(isMobile)} .url-line`);

// On a phone the rail is a sheet the bar opens; on desktop it is already there.
async function openOutput(page, isMobile) {
  if (!isMobile) return;
  await page.locator('mobile-bar .count-btn').click();
  await expect(page.locator('mobile-bar .sheet')).toBeVisible();
}

// Trial: the identifier is a minted uid and it is mandatory, so the field is
// always on screen — no chip to open first (REMOTE_SPEC §3, §8.2). The link is
// withheld until the check symbol validates.
const UID = 'CMPS-001J';

async function fillPid(page, isMobile, value = UID) {
  await page.locator(`${outputScope(isMobile)} session-settings #settings-pid`).fill(value);
}

// Most tests want a link to exist at all, which on this deployment means a uid.
async function withUid(page, isMobile) {
  await openOutput(page, isMobile);
  await fillPid(page, isMobile);
}

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

// ── Selection → link ──────────────────────────────────────────────────────────

test.describe('selection', () => {
  test('checking an item generates an items= URL', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await openOutput(page, isMobile);
    await expect(urlBox(page, isMobile)).toContainText('יש להזין מזהה');
    await fillPid(page, isMobile);
    await expect(urlBox(page, isMobile)).toContainText('items=phq9');
  });

  test('unchecking clears the link', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    if (isMobile) await expect(page.locator('mobile-bar .count')).toContainText('נבחרו 1');
    await cardButton(page, 'phq9').click(); // toggle off (phq9 visible in curated view)
    // The phone reports the empty state on its bar; the rail shows the
    // placeholder link, at the same height it had a moment ago.
    if (isMobile) await expect(page.locator('mobile-bar .count')).toContainText('טרם');
    else await expect(urlBox(page, isMobile)).toContainText('לא נבחרו');
  });

  test('the picked list keeps selection order', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'test_q');
    await selectItem(page, 'phq9');
    await openOutput(page, isMobile);
    const titles = page.locator(`${outputScope(isMobile)} li.item .item-title`);
    await expect(titles).toHaveCount(2);
    // phq9 was picked second → second row.
    const phq9Title = await cardButton(page, 'phq9').locator('.name').textContent();
    await expect(titles.nth(1)).toContainText((phq9Title ?? '').trim());
  });

  test('reorder (↑) swaps the last item ahead of the first', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'test_q');
    await selectItem(page, 'phq9');
    await withUid(page, isMobile);
    // Move the 2nd row up → phq9 becomes first in the URL. The arrows fade in
    // on hover/focus in the rail, but they are always in the DOM and enabled.
    await page.locator(`${outputScope(isMobile)} li.item`).nth(1)
      .locator('[aria-label="הזז מעלה"]').click();
    await expect(urlBox(page, isMobile)).toContainText('items=phq9,test_q');
  });
});

// ── Patient uid ───────────────────────────────────────────────────────────────

test.describe('patient uid field', () => {
  test('the field is on screen without opening anything — it is mandatory', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await openOutput(page, isMobile);
    const scope = outputScope(isMobile);
    await expect(page.locator(`${scope} session-settings #settings-pid`)).toBeVisible();
    // No chip to reveal it, and nothing to un-reveal it.
    await expect(page.locator(`${scope} session-settings .pid-chip`)).toHaveCount(0);
  });

  test('a valid uid is canonicalised into the URL fragment', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await openOutput(page, isMobile);
    await fillPid(page, isMobile, UID.toLowerCase().replace('-', ''));
    await expect(urlBox(page, isMobile)).toContainText(`#pid=${UID}`);
  });

  test('an invalid uid withholds the link and warns', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await openOutput(page, isMobile);
    await fillPid(page, isMobile, 'TRC-2025-001');
    const scope = outputScope(isMobile);
    await expect(urlBox(page, isMobile)).toContainText('יש להזין מזהה');
    await expect(page.locator(`${scope} session-settings .pid-warning`)).toContainText('XXXX-XXXX');
    await expect(page.locator(`${scope} session-settings #settings-pid`))
      .toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`${scope} .copy-btn`)).toBeDisabled();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset clears selection and link', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await withUid(page, isMobile);

    // Reset lives in the browse toolbar on desktop and in the sheet on a phone,
    // where the toolbar is behind the sheet's backdrop.
    if (isMobile) await page.locator('mobile-bar .reset-btn').click();
    else await page.locator('catalog-controls .reset-btn').click();

    await expect(urlBox(page, isMobile)).toContainText('לא נבחרו');
    await expect(page.locator('catalog-card[data-id="phq9"] button.card')).toHaveAttribute('aria-checked', 'false');
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
  test('the bar counts the selection and says it opens', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the sheet is the phone stand-in for the desktop rail');
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await expect(page.locator('mobile-bar .count')).toContainText('נבחרו 1');
    // The chevron is the affordance: without it the count read as a status line.
    await expect(page.locator('mobile-bar .chev')).toBeVisible();
    await expect(page.locator('mobile-bar .count-btn')).toHaveAttribute('aria-expanded', 'false');
    // No URL at this width — it always clipped.
    await expect(page.locator('mobile-bar .url-line')).toHaveCount(0);

    await page.locator('mobile-bar .count-btn').click();
    await expect(page.locator('mobile-bar .sheet')).toBeVisible();
    await expect(page.locator('mobile-bar .count-btn')).toHaveAttribute('aria-expanded', 'true');
    // The sheet renders the same panel the rail does.
    await expect(page.locator('mobile-bar selection-cart .url-line')).toContainText('יש להזין מזהה');
    await expect(page.locator('mobile-bar selection-cart session-settings')).toBeVisible();
  });

  test('the bar prompts for the uid and lands the cursor in the field', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the bar is the phone stand-in for the desktop rail');
    await gotoComposer(page);
    // Reachable before anything is picked — the uid has to be enterable first.
    await expect(page.locator('mobile-bar .count-btn')).toBeEnabled();
    await selectItem(page, 'phq9');
    // No link can exist without a uid, so the primary says what is missing.
    const prompt = page.locator('mobile-bar .prompt-pid-btn');
    await expect(prompt).toBeVisible();
    await prompt.click();
    await expect(page.locator('mobile-bar .sheet')).toBeVisible();
    await expect(page.locator('mobile-bar selection-cart session-settings #settings-pid'))
      .toBeFocused();

    await fillPid(page, isMobile);
    await expect(prompt).toHaveCount(0);
    await expect(page.locator('mobile-bar selection-cart .url-line')).toContainText('items=phq9');
  });

  test('the sheet closes on the backdrop', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the sheet is the phone stand-in for the desktop rail');
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await page.locator('mobile-bar .count-btn').click();
    await expect(page.locator('mobile-bar .sheet')).toBeVisible();
    await page.locator('mobile-bar .backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('mobile-bar .sheet')).toHaveCount(0);
  });
});

// ── Preview modal ──────────────────────────────────────────────────────────────

test.describe('preview modal', () => {
  const dialog = (page) => page.locator('preview-dialog dialog');

  test('👁 opens a read-only preview; mechanics reveals ids/DSL; ✕ closes it', async ({ page }) => {
    await gotoComposer(page);
    // phq9 is featured → visible in the curated view without searching.
    await previewButton(page, 'phq9').click();
    await expect(dialog(page)).toBeVisible({ timeout: 10_000 });
    // Summary + a resolved select option + the alert message (always shown).
    await expect(dialog(page)).toContainText('PHQ-9');
    await expect(dialog(page)).toContainText('כלל לא');
    await expect(dialog(page)).toContainText('אובדנות');
    // Raw DSL is hidden until the mechanics toggle is on.
    await expect(dialog(page)).not.toContainText('item.9 ≥ 1');
    await dialog(page).locator('.mech-btn').click();
    await expect(dialog(page)).toContainText('item.9 ≥ 1');
    // Opening the preview must not select the item.
    await expect(cardButton(page, 'phq9')).toHaveAttribute('aria-checked', 'false');
    // Close.
    await dialog(page).locator('button.icon-btn').click();
    await expect(dialog(page)).toBeHidden();
  });

  test('conditional items render under a "מוצג בתנאי" divider', async ({ page }) => {
    await gotoComposer(page);
    // pqb has nested item-level if-nodes (top3, the original subject, is
    // withheld on this deployment by the no-text rule). Not featured, so
    // reach it by search.
    await searchBox(page).fill('pqb');
    await previewButton(page, 'pqb').click();
    await expect(dialog(page)).toBeVisible({ timeout: 10_000 });
    await expect(dialog(page)).toContainText('מוצג בתנאי');
  });
});

// ── Generated URL launches a valid session ────────────────────────────────────

test.describe('generated URL launches valid session', () => {
  test('phq9 URL loads the patient app welcome screen', async ({ page, isMobile }) => {
    await gotoComposer(page);
    await selectItem(page, 'phq9');
    await withUid(page, isMobile);
    const url = await urlBox(page, isMobile).textContent();
    await page.goto(url.trim());
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('a battery URL expands and launches the welcome screen', async ({ page, isMobile }) => {
    await gotoComposer(page);
    // Batteries live in their own tab; search is scoped to the active tab.
    await openFilters(page);
    await page.locator('catalog-controls [role="tab"]', { hasText: 'סוללות' }).click();
    await selectItem(page, 'phq9_intake');
    await withUid(page, isMobile);
    const url = await urlBox(page, isMobile).textContent();
    await page.goto(url.trim());
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });
});
