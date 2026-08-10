/**
 * tests/e2e/patient-flow.test.js
 *
 * End-to-end tests for the full patient journey:
 *   welcome → questionnaire items → completion → results → PDF download
 *
 * Uses the standard PHQ-9 battery which has:
 *   - 1 instructions item
 *   - 9 select items
 *   - 1 alert (item 9 ≥ 1 → suicidality)
 *
 * Shadows DOM note: all components use shadow DOM. Playwright's locators
 * pierce shadow roots by default when using role/label/text selectors.
 * For CSS selectors that need to cross shadow boundaries we use
 * page.locator() with the >> combinator or evaluate().\
 */

import { test, expect } from '@playwright/test';

// ── URLs ──────────────────────────────────────────────────────────────────────
// Item IDs are addresses: the app derives config files from items= tokens
// (configs/prod/<id>.json). Dev fixture files carry dev:true — the composer
// hides them in production, but the patient app loads them like any config.

/** PHQ-9 equivalent (phq9_test) — 1 instructions + 9 select + suicidality alert */
const PHQ9_URL = `/?items=phq9_intake#pid=TEST-1`;

/** test_q battery — binary + select mix */
const TEST_URL = `/?items=standard_intake#pid=TEST-1`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pierce one level of shadow DOM to get a locator inside a custom element.
 * Usage: shadowIn(page, 'welcome-screen', '.begin-btn')
 */
function shadowIn(page, hostSelector, innerSelector) {
  return page.locator(`${hostSelector} >> ${innerSelector}`);
}

/** Click the begin button on the welcome screen */
async function clickBegin(page) {
  await shadowIn(page, 'welcome-screen', 'button.begin-btn').click();
}

/** Click a Likert option by its zero-based index */
async function clickLikertOption(page, index) {
  const options = page.locator('item-select >> button.option');
  await options.nth(index).click();
}

/** Click the first binary option (index 0 = positive / כן) */
async function clickBinaryFirst(page) {
  await page.locator('item-binary >> button.opt-btn').first().click();
}

/** Click continue on an instructions item */
async function clickContinue(page) {
  await page.locator('item-instructions >> button.continue-btn').click();
}

/** Read the current item progress value (0–100) from the progress-bar component */
async function progressValue(page) {
  return page.locator('progress-bar').evaluate(el => {
    const track = el.shadowRoot?.querySelector('[role="progressbar"]');
    return Number(track?.getAttribute('aria-valuenow') ?? 0);
  });
}

/** Answer all 9 PHQ-9 select items with a given option index (0–3) */
async function answerAllPHQ9Items(page, optionIndex = 0) {
  // First: instructions item
  await expect(page.locator('item-instructions')).toBeVisible();
  await clickContinue(page);

  // Then: 9 select items.
  // item-select stays in the DOM during transitions (controller replaces content,
  // not the element), so toBeVisible() cannot signal "we are on the next item".
  // Instead we wait for history.length to increase — the router's pushState is
  // the definitive signal that auto-advance completed and the next item is live.
  // On the last item the controller pushes the 'complete' entry and shows the
  // results screen directly, so the caller awaits results-screen directly.
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('item-select')).toBeVisible();
    const lenBefore = await page.evaluate(() => window.history.length);
    await clickLikertOption(page, optionIndex);
    if (i < 8) {
      await page.waitForFunction(n => window.history.length > n, lenBefore);
    }
  }
}

// ── Welcome screen ────────────────────────────────────────────────────────────

test.describe('welcome screen', () => {
  test('shows begin button', async ({ page }) => {
    await page.goto(PHQ9_URL);
    const welcome = page.locator('welcome-screen');
    await expect(welcome).toBeVisible();
    await expect(shadowIn(page, 'welcome-screen', 'button.begin-btn')).toBeVisible();
  });

  test('begin works — no name is asked for', async ({ page }) => {
    await page.goto(PHQ9_URL);
    await expect(shadowIn(page, 'welcome-screen', 'input')).toHaveCount(0);
    await clickBegin(page);
    await expect(page.locator('app-shell')).toBeVisible();
  });

  // CTR POC: a link without an id is refused before the welcome screen.
  test('a link with no id shows an error instead of the welcome screen', async ({ page }) => {
    await page.goto('/?items=phq9_intake');
    await expect(page.locator('welcome-screen')).toHaveCount(0);
    await expect(page.locator('#app')).toContainText('מזהה');
  });
});

// ── Questionnaire flow — PHQ-9 ────────────────────────────────────────────────

test.describe('PHQ-9 questionnaire flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
  });

  test('first screen is an instructions item', async ({ page }) => {
    await expect(page.locator('item-instructions')).toBeVisible();
    await expect(page.locator('item-select')).not.toBeVisible();
  });

  test('continue on instructions advances to first select item', async ({ page }) => {
    await clickContinue(page);
    await expect(page.locator('item-select')).toBeVisible();
    await expect(page.locator('item-instructions')).not.toBeVisible();
  });

  test('back button is hidden on first item', async ({ page }) => {
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).toBeDisabled();
  });

  test('back button appears after advancing past first item', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await expect(page.locator('item-select')).toBeVisible();
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).not.toBeDisabled();
  });

  test('back navigation returns to previous item with answer preserved', async ({ page }) => {
    await clickContinue(page);
    // Wait for item-select to be visible before capturing history length.
    // The controller uses setTimeout(fn, 0) for instructions advances, so
    // page.evaluate() can execute in the browser before that timer fires —
    // yielding a stale history.length of 2 instead of 3. Waiting for
    // item-select to appear guarantees the timer has fired, router.push('q')
    // has run, and the DOM and history are stable.
    await expect(page.locator('item-select')).toBeVisible();
    const lenBefore = await page.evaluate(() => window.history.length);
    await clickLikertOption(page, 2);
    await page.waitForFunction(n => window.history.length > n, lenBefore);

    await page.goBack();
    await expect(page.locator('item-select')).toBeVisible();

    const options = page.locator('item-select >> button.option');
    await expect(options.nth(2)).toHaveClass(/is-selected/);
  });

  test('progress indicator advances with each item', async ({ page }) => {
    await clickContinue(page);
    const before = await progressValue(page);
    await clickLikertOption(page, 0);
    // Poll until progress actually updates — item-select stays visible during
    // transition so toBeVisible() resolves too early on the current item.
    await expect(async () => {
      expect(await progressValue(page)).toBeGreaterThan(before);
    }).toPass({ timeout: 5000 });
  });

  test('completing all items reaches results screen', async ({ page }) => {
    await answerAllPHQ9Items(page, 0);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
  });
});

// ── Results screen ────────────────────────────────────────────────────────────

test.describe('results screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 0);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
  });

  test('shows results screen with a score row', async ({ page }) => {
    await expect(page.locator('results-screen >> .scores')).toBeVisible();
    const scoreRows = page.locator('results-screen >> .score-row');
    await expect(scoreRows).toHaveCount(1);
  });

  test('score is 0 when all options answered as first choice (value 0)', async ({ page }) => {
    const scoreValue = page.locator('results-screen >> .score-value');
    await expect(scoreValue).toContainText('0');
  });

  test('download button is present', async ({ page }) => {
    // On desktop canShare is false — one primary download button
    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toBeVisible();
    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toContainText('הורד');
  });

  test('back button is enabled on results screen — patient can still edit', async ({ page }) => {
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).toBeEnabled();
  });

  test('browser back from results returns to the last questionnaire item', async ({ page }) => {
    await page.goBack();
    await expect(page.locator('item-select')).toBeVisible();
    await expect(page.locator('results-screen')).not.toBeVisible();
  });

  test('answer changed after going back is reflected in the recomputed score', async ({ page }) => {
    // Score starts at 0 (all first-choice answers). Go back to the last item,
    // pick the max option, return to results, and the recomputed total must rise.
    await page.goBack();
    await expect(page.locator('item-select')).toBeVisible();
    await clickLikertOption(page, 3); // value 3 on the last PHQ-9 item
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
    const scoreValue = page.locator('results-screen >> .score-value');
    await expect(scoreValue).toContainText('3');
  });
});

// ── Alert conditions ──────────────────────────────────────────────────────────

test.describe('alert — PHQ-9 item 9 (suicidality)', () => {
  async function answerWithItem9(page, item9OptionIndex) {
    await page.goto(PHQ9_URL);
    await clickBegin(page);

    await expect(page.locator('item-instructions')).toBeVisible();
    await clickContinue(page);

    // Items 1–8: wait for router pushState before moving to the next item
    for (let i = 0; i < 8; i++) {
      await expect(page.locator('item-select')).toBeVisible();
      const lenBefore = await page.evaluate(() => window.history.length);
      await clickLikertOption(page, 0);
      await page.waitForFunction(n => window.history.length > n, lenBefore);
    }

    // Item 9 (last): click then await the results screen
    await expect(page.locator('item-select')).toBeVisible();
    await clickLikertOption(page, item9OptionIndex);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
  }

  test('item 9 = 0 → score 0, session completes normally', async ({ page }) => {
    await answerWithItem9(page, 0);
    const scoreText = await page.locator('results-screen >> .score-value').textContent();
    expect(parseInt(scoreText, 10)).toBe(0);
  });

  test('item 9 ≥ 1 → session still completes and shows results', async ({ page }) => {
    await answerWithItem9(page, 1);
    await expect(page.locator('results-screen')).toBeVisible();
    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toBeVisible();
  });
});

// ── Mixed battery (test_q — binary + select) ─────────────────────────────────

test.describe('standard_intake battery (binary + select)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await clickBegin(page);
  });

  test('shows instructions item first', async ({ page }) => {
    await expect(page.locator('item-instructions')).toBeVisible();
  });

  test('binary items render after instructions', async ({ page }) => {
    await clickContinue(page);
    await expect(page.locator('item-binary')).toBeVisible();
  });

  test('completes full test_q battery and reaches results', async ({ page }) => {
    await clickContinue(page);

    // 2 binary items — same type, so wait for router pushState after each
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('item-binary')).toBeVisible();
      const lenBefore = await page.evaluate(() => window.history.length);
      await clickBinaryFirst(page);
      await page.waitForFunction(n => window.history.length > n, lenBefore);
    }

    // 2 select items — same type; last one uses router.replace for completion
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('item-select')).toBeVisible();
      const lenBefore = await page.evaluate(() => window.history.length);
      await clickLikertOption(page, 0);
      if (i < 1) {
        await page.waitForFunction(n => window.history.length > n, lenBefore);
      }
    }

    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
  });
});

// CTR POC: the all-item-types battery was a dev fixture containing free-text
// items; it was removed along with the free-text instruments, and its e2e
// block went with it.
