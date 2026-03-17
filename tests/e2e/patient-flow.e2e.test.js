/**
 * tests/e2e/patient-flow.test.js
 *
 * End-to-end tests for the full patient journey:
 *   welcome → questionnaire items → completion → results → PDF download
 *
 * Uses the standard PHQ-9 battery which has:
 *   - 1 instructions item
 *   - 9 likert items
 *   - 1 alert (item 9 ≥ 1 → suicidality)
 *
 * Shadows DOM note: all components use shadow DOM. Playwright's locators
 * pierce shadow roots by default when using role/label/text selectors.
 * For CSS selectors that need to cross shadow boundaries we use
 * page.locator() with the >> combinator or evaluate().\
 */

import { test, expect } from '@playwright/test';

// ── URLs ──────────────────────────────────────────────────────────────────────

const E2E_CONFIG = '/configs/test/e2e.json';

/** PHQ-9 equivalent (phq9_test) — 1 instructions + 9 likert + suicidality alert */
const PHQ9_URL = `/?configs=${E2E_CONFIG}&items=phq9_intake`;

/** test_q battery — binary + likert mix */
const TEST_URL = `/?configs=${E2E_CONFIG}&items=standard_intake`;

/** all_types_battery — instructions + likert + binary + text */
const ALL_TYPES_URL = `/?configs=${E2E_CONFIG}&items=all_types_battery`;

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
  const options = page.locator('item-likert >> button.option');
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

/** Click the view-results button on the completion screen */
async function clickViewResults(page) {
  await page.locator('completion-screen >> button.view-btn').click();
}

/** Read the current item progress value (0–100) from the progress-bar component */
async function progressValue(page) {
  return page.locator('progress-bar').evaluate(el => {
    const track = el.shadowRoot?.querySelector('[role="progressbar"]');
    return Number(track?.getAttribute('aria-valuenow') ?? 0);
  });
}

/** Answer all 9 PHQ-9 likert items with a given option index (0–3) */
async function answerAllPHQ9Items(page, optionIndex = 0) {
  // First: instructions item
  await expect(page.locator('item-instructions')).toBeVisible();
  await clickContinue(page);

  // Then: 9 likert items
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('item-likert')).toBeVisible();
    await clickLikertOption(page, optionIndex);
    if (i < 8) await page.waitForTimeout(200);
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

  test('name field is optional — begin works without it', async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await expect(page.locator('app-shell')).toBeVisible();
  });

  test('name entered on welcome screen is not in the URL', async ({ page }) => {
    await page.goto(PHQ9_URL);
    await shadowIn(page, 'welcome-screen', 'input#patient-name').fill('ישראל ישראלי');
    await clickBegin(page);
    expect(page.url()).not.toContain('ישראל');
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
    await expect(page.locator('item-likert')).not.toBeVisible();
  });

  test('continue on instructions advances to first likert item', async ({ page }) => {
    await clickContinue(page);
    await expect(page.locator('item-likert')).toBeVisible();
    await expect(page.locator('item-instructions')).not.toBeVisible();
  });

  test('back button is hidden on first item', async ({ page }) => {
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).toHaveCSS('opacity', '0');
  });

  test('back button appears after advancing past first item', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).not.toHaveCSS('opacity', '0');
  });

  test('back navigation returns to previous item with answer preserved', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 2);
    await page.waitForTimeout(200);

    await page.goBack();
    await expect(page.locator('item-likert')).toBeVisible();

    const options = page.locator('item-likert >> button.option');
    await expect(options.nth(2)).toHaveClass(/is-selected/);
  });

  test('progress indicator advances with each item', async ({ page }) => {
    await clickContinue(page);
    const before = await progressValue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    const after = await progressValue(page);
    expect(after).toBeGreaterThan(before);
  });

  test('completing all items reaches completion screen', async ({ page }) => {
    await answerAllPHQ9Items(page, 0);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
  });
});

// ── Completion screen ─────────────────────────────────────────────────────────

test.describe('completion screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 0);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
  });

  test('shows confirmation and view-results button', async ({ page }) => {
    await expect(page.locator('completion-screen >> .title')).toBeVisible();
    await expect(page.locator('completion-screen >> button.view-btn')).toBeVisible();
  });

  test('back from completion returns to last likert item', async ({ page }) => {
    await page.goBack();
    await expect(page.locator('item-likert')).toBeVisible();
    await expect(page.locator('completion-screen')).not.toBeVisible();
  });

  test('answer changed after going back is reflected when re-completing', async ({ page }) => {
    await page.goBack();
    await expect(page.locator('item-likert')).toBeVisible();
    await clickLikertOption(page, 3);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('completion-screen >> button.view-btn')).toBeVisible();
  });
});

// ── Results screen ────────────────────────────────────────────────────────────

test.describe('results screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 0);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();
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
    await expect(page.locator('results-screen >> button.pdf-btn')).toBeVisible();
  });

  test('back button is hidden on results screen (session locked)', async ({ page }) => {
    const backBtn = page.locator('app-shell >> button[aria-label="חזור לשאלה הקודמת"]');
    await expect(backBtn).toHaveCSS('opacity', '0');
  });

  test('browser back from results does not return to questionnaire', async ({ page }) => {
    await page.goBack();
    await expect(page.locator('item-likert')).not.toBeVisible();
    await expect(page.locator('item-instructions')).not.toBeVisible();
  });
});

// ── Score accuracy ────────────────────────────────────────────────────────────

test.describe('score accuracy', () => {
  async function completeWithOptionIndex(page, optionIndex) {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, optionIndex);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();
    const scoreText = await page.locator('results-screen >> .score-value').textContent();
    return parseInt(scoreText.trim(), 10);
  }

  test('all zeros → score 0', async ({ page }) => {
    expect(await completeWithOptionIndex(page, 0)).toBe(0);
  });

  test('all max (index 3, value 3) → score 27', async ({ page }) => {
    expect(await completeWithOptionIndex(page, 3)).toBe(27);
  });

  test('all second option (index 1, value 1) → score 9', async ({ page }) => {
    expect(await completeWithOptionIndex(page, 1)).toBe(9);
  });
});

// ── Alert conditions ──────────────────────────────────────────────────────────

test.describe('alert — PHQ-9 item 9 (suicidality)', () => {
  async function answerWithItem9(page, item9OptionIndex) {
    await page.goto(PHQ9_URL);
    await clickBegin(page);

    await expect(page.locator('item-instructions')).toBeVisible();
    await clickContinue(page);

    for (let i = 0; i < 8; i++) {
      await expect(page.locator('item-likert')).toBeVisible();
      await clickLikertOption(page, 0);
      await page.waitForTimeout(200);
    }

    await expect(page.locator('item-likert')).toBeVisible();
    await clickLikertOption(page, item9OptionIndex);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();
  }

  test('item 9 = 0 → score 0, session completes normally', async ({ page }) => {
    await answerWithItem9(page, 0);
    const scoreText = await page.locator('results-screen >> .score-value').textContent();
    expect(parseInt(scoreText, 10)).toBe(0);
  });

  test('item 9 ≥ 1 → session still completes and shows results', async ({ page }) => {
    await answerWithItem9(page, 1);
    await expect(page.locator('results-screen')).toBeVisible();
    await expect(page.locator('results-screen >> button.pdf-btn')).toBeVisible();
  });
});

// ── Mixed battery (test_q — binary + likert) ─────────────────────────────────

test.describe('standard_intake battery (binary + likert)', () => {
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

    for (let i = 0; i < 2; i++) {
      await expect(page.locator('item-binary')).toBeVisible();
      await clickBinaryFirst(page);
      await page.waitForTimeout(200);
    }

    for (let i = 0; i < 2; i++) {
      await expect(page.locator('item-likert')).toBeVisible();
      await clickLikertOption(page, 0);
      await page.waitForTimeout(200);
    }

    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();
  });
});

/** Type text into the item-text component and optionally submit */
async function fillTextItem(page, text, { submit = true } = {}) {
  const input = page.locator('item-text >> input');
  await input.fill(text);
  if (submit) {
    await page.locator('item-text >> button.submit-btn').click();
  }
}

/** Click skip on a text item */
async function skipTextItem(page) {
  await page.locator('item-text >> button.skip-btn').click();
}

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('error handling', () => {
  test('missing items param shows Hebrew error', async ({ page }) => {
    await page.goto(`/?configs=${E2E_CONFIG}`);
    await expect(page.locator('#app')).toContainText('לא נבחרו שאלונים');
  });

  test('unknown item token shows Hebrew error', async ({ page }) => {
    await page.goto(`/?configs=${E2E_CONFIG}&items=nonexistent_xyz`);
    await expect(page.locator('#app')).toContainText('שגיאה');
  });

  test('invalid config URL shows Hebrew error', async ({ page }) => {
    await page.goto('/?configs=/configs/nonexistent_xyz.json&items=phq9');
    await expect(page.locator('#app')).toContainText('שגיאה');
  });
});

// ── PDF download ──────────────────────────────────────────────────────────────

test.describe('PDF download', () => {
  test('clicking download triggers a file download', async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 1);
    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();

    const pdfBtn = page.locator('results-screen >> button.pdf-btn');
    await expect(pdfBtn).not.toHaveAttribute('disabled', { timeout: 5000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      pdfBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ── All item types battery ────────────────────────────────────────────────────

test.describe('all item types battery (instructions + likert + binary + text)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ALL_TYPES_URL);
    await clickBegin(page);
  });

  test('first item is instructions', async ({ page }) => {
    await expect(page.locator('item-instructions')).toBeVisible();
  });

  test('instructions → likert → binary → text sequence renders correctly', async ({ page }) => {
    // instructions
    await expect(page.locator('item-instructions')).toBeVisible();
    await clickContinue(page);

    // likert
    await expect(page.locator('item-likert')).toBeVisible();
    await clickLikertOption(page, 1);
    await page.waitForTimeout(200);

    // binary
    await expect(page.locator('item-binary')).toBeVisible();
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    // text
    await expect(page.locator('item-text')).toBeVisible();
  });

  test('text item shows question text', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    await expect(page.locator('item-text')).toBeVisible();
    const question = page.locator('item-text >> .question');
    await expect(question).toContainText('הערות');
  });

  test('text item shows skip button (skippable by default)', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    await expect(page.locator('item-text >> button.skip-btn')).toBeVisible();
  });

  test('text item can be skipped to reach completion', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    await expect(page.locator('item-text')).toBeVisible();
    await skipTextItem(page);

    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
  });

  test('text item can be submitted with text to reach completion', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    await expect(page.locator('item-text')).toBeVisible();
    await fillTextItem(page, 'בדיקה בדיקה');

    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
  });

  test('back navigation from text item restores typed value', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 0);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);

    await expect(page.locator('item-text')).toBeVisible();
    const input = page.locator('item-text >> input');
    await input.fill('טקסט לבדיקה');

    // navigate back then forward
    await page.goBack();
    await expect(page.locator('item-binary')).toBeVisible();
    await page.goForward();

    await expect(page.locator('item-text')).toBeVisible();
    await expect(page.locator('item-text >> input')).toHaveValue('טקסט לבדיקה');
  });

  test('completes full battery and shows results with pdf button', async ({ page }) => {
    await clickContinue(page);
    await clickLikertOption(page, 1);
    await page.waitForTimeout(200);
    await clickBinaryFirst(page);
    await page.waitForTimeout(200);
    await fillTextItem(page, 'הערה לדוגמה');

    await expect(page.locator('completion-screen')).toBeVisible({ timeout: 2000 });
    await clickViewResults(page);
    await expect(page.locator('results-screen')).toBeVisible();
    await expect(page.locator('results-screen >> button.pdf-btn')).toBeVisible();
  });
});
