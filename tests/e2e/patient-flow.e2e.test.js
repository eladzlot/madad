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
const PHQ9_URL = `/?items=phq9_intake`;

/** test_q battery — binary + select mix */
const TEST_URL = `/?items=standard_intake`;

/** all_types_battery — instructions + select + binary + text */
const ALL_TYPES_URL = `/?items=all_types_battery`;

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

/** Type text into the item-text component and optionally submit */
async function fillTextItem(page, text, { submit = true } = {}) {
  const input = page.locator('item-text >> input');
  await input.fill(text);
  if (submit) {
    await page.locator('item-text >> button.submit-btn').click();
  }
}

/** Advance past a text item without filling it in (submit with empty field) */
async function skipTextItem(page) {
  await page.locator('item-text >> button.submit-btn').click();
}

/** Toggle a multiselect option by 1-based index */
async function toggleMultiselectOption(page, index) {
  await page.locator('item-multiselect >> button.option').nth(index - 1).click();
}

/** Submit multiselect */
async function submitMultiselect(page) {
  await page.locator('item-multiselect >> button.submit-btn').click();
}

/** Move the slider to a given value and submit */
async function setSliderValue(page, value, { submit = true } = {}) {
  const input = page.locator('item-slider >> input[type="range"]');
  await input.evaluate((el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
  if (submit) {
    await page.locator('item-slider >> button.submit-btn').click();
  }
}

/** Click a select option by zero-based index */
async function clickSelectOption(page, index) {
  await page.locator('item-select >> button.option').nth(index).click();
}

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('error handling', () => {
  test('missing items param shows Hebrew error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toContainText('לא נבחרו שאלונים');
  });

  test('unknown item token shows load-error screen', async ({ page }) => {
    // nonexistent_xyz.json does not exist. In production this is a clean 404
    // → "הקישור שגוי" branch; the Vite dev server instead serves the SPA
    // fallback (200 + HTML) so the JSON parse fails → generic load-error
    // branch. Both land on the retryable error screen — assert that state
    // rather than environment-dependent message text.
    await page.goto('/?items=nonexistent_xyz');
    await expect(page.locator('#app')).toContainText('לא ניתן לטעון את השאלון');
    await expect(page.locator('[data-action="retry"]')).toBeVisible();
    await expect(page.locator('welcome-screen')).toHaveCount(0);
  });

  test('legacy configs= parameter is ignored — bundle-era links still resolve by items', async ({ page }) => {
    // Bundle-era URLs named config files explicitly (configs=standard, full
    // paths, even nonexistent ones). The app ignores the parameter entirely
    // and resolves items= tokens as addresses, so old links keep working
    // even though the files the parameter names no longer exist.
    await page.goto('/?configs=/configs/nonexistent_xyz.json&items=phq9_test');
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#app')).not.toContainText('לא ניתן לטעון');
  });

  test('battery URL resolves cross-file references via declared dependencies', async ({ page }) => {
    // clinical_intake.json declares dependencies on every questionnaire file
    // its sequence references (diamond_sr, phq9, pcl5, …). The loader's BFS
    // auto-fetch pulls them, so a bare items=clinical_intake URL resolves.
    await page.goto('/?items=clinical_intake');
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 8000 });
    // No error screen — neither load-error nor resolution-error should appear.
    await expect(page.locator('#app')).not.toContainText('לא ניתן לטעון');
    await expect(page.locator('#app')).not.toContainText('הקישור שגוי');
  });

  test('aborted config fetch shows load-error screen with retry button', async ({ page }) => {
    // Intercept all config JSON requests and abort them to simulate a network failure.
    await page.route('**/*.json', route => route.abort('failed'));

    await page.goto(PHQ9_URL, { waitUntil: 'domcontentloaded' });

    // The app should surface the Hebrew load-error message.
    await expect(page.locator('#app')).toContainText('לא ניתן לטעון את השאלון', { timeout: 8000 });

    // A retry button must be visible — clicking it reloads the page.
    const retryBtn = page.locator('[data-action="retry"]');
    await expect(retryBtn).toBeVisible();
  });

  test('retry button on load error triggers a page reload', async ({ page }) => {
    // Block config on first load only so the reload can succeed.
    let requestCount = 0;
    await page.route('**/*.json', route => {
      requestCount++;
      if (requestCount === 1) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    await page.goto(PHQ9_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-action="retry"]')).toBeVisible({ timeout: 8000 });

    // After clicking retry the page reloads; config loads successfully this time.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('[data-action="retry"]').click(),
    ]);

    // Should be back to the welcome screen, not the error screen.
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });
});

// ── PDF download ──────────────────────────────────────────────────────────────

test.describe('PDF download', () => {
  test('clicking download triggers a file download', async ({ page }) => {
    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 1);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });

    // On desktop canShare is false — primary button is the download button
    const pdfBtn = page.locator('results-screen >> button.pdf-btn--primary');
    await expect(pdfBtn).not.toHaveAttribute('disabled', { timeout: 5000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      pdfBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // The PDF must carry the embedded data.json envelope (the Aggregate
    // integration boundary). Named embedded files appear in the raw PDF as
    // an /EmbeddedFiles name tree entry plus the attachment's filename.
    const path = await download.path();
    const { readFileSync } = await import('fs');
    const pdfBytes = readFileSync(path).toString('latin1');
    expect(pdfBytes).toContain('/EmbeddedFiles');
    expect(pdfBytes).toContain('data.json');
  });
});

// ── PDF error recovery ────────────────────────────────────────────────────────

test.describe('PDF error recovery', () => {
  test('font fetch failure shows Hebrew error message and retry button', async ({ page }) => {
    // Block all font requests so pdfmake cannot load.
    await page.route('**/*.ttf', route => route.abort('failed'));

    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 1);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });

    const pdfBtn = page.locator('results-screen >> button.pdf-btn--primary');
    await expect(pdfBtn).not.toHaveAttribute('disabled', { timeout: 5000 });
    await pdfBtn.click();

    // Error message and retry button must appear.
    await expect(page.locator('results-screen >> .pdf-error')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('results-screen >> .pdf-error__msg')).toContainText('לא ניתן');

    const retryBtn = page.locator('results-screen >> .pdf-error button');
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toContainText('נסה');
  });

  test('retry button attempts generation again (clears error on success)', async ({ page }) => {
    // Block ALL font requests. generateReport makes two load attempts before
    // surfacing PdfGenerationError to the UI (initial preload + one internal
    // retry), both of which must fail. We unroute after the error is visible
    // so the user-triggered retry can load the fonts and succeed.
    await page.route('**/*.ttf', route => route.abort('failed'));

    await page.goto(PHQ9_URL);
    await clickBegin(page);
    await answerAllPHQ9Items(page, 1);
    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });

    // Trigger the failure.
    const pdfBtn = page.locator('results-screen >> button.pdf-btn--primary');
    await expect(pdfBtn).not.toHaveAttribute('disabled', { timeout: 5000 });
    await pdfBtn.click();
    await expect(page.locator('results-screen >> .pdf-error')).toBeVisible({ timeout: 8000 });

    // Unblock fonts so the user-triggered retry can succeed.
    await page.unroute('**/*.ttf');

    // Click retry — fonts now load — PDF generation should succeed.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.locator('results-screen >> .pdf-error button').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // Error state must be gone.
    await expect(page.locator('results-screen >> .pdf-error')).not.toBeVisible();
  });
});

// ── All item types battery ────────────────────────────────────────────────────

test.describe('all item types battery (instructions + select + binary + select + slider + text + multiselect)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ALL_TYPES_URL);
    await clickBegin(page);
  });

  test('first item is instructions', async ({ page }) => {
    await expect(page.locator('item-instructions')).toBeVisible();
  });

  test('full sequence renders all item types in order', async ({ page }) => {
    await expect(page.locator('item-instructions')).toBeVisible();
    await clickContinue(page);

    await expect(page.locator('item-select')).toBeVisible();
    await clickSelectOption(page, 1);

    await expect(page.locator('item-binary')).toBeVisible();
    await clickBinaryFirst(page);

    await expect(page.locator('item-select')).toBeVisible();
    await clickSelectOption(page, 0);

    await expect(page.locator('item-slider')).toBeVisible();
    await setSliderValue(page, 5);

    await expect(page.locator('item-text')).toBeVisible();
    await skipTextItem(page);

    await expect(page.locator('item-multiselect')).toBeVisible();
  });

  test('completes full battery and shows results with pdf button', async ({ page }) => {
    await clickContinue(page);

    await expect(page.locator('item-select')).toBeVisible();
    await clickSelectOption(page, 1);

    await expect(page.locator('item-binary')).toBeVisible();
    await clickBinaryFirst(page);

    await expect(page.locator('item-select')).toBeVisible();
    await clickSelectOption(page, 1);

    await expect(page.locator('item-slider')).toBeVisible();
    await setSliderValue(page, 7);

    await expect(page.locator('item-text')).toBeVisible();
    await fillTextItem(page, 'הערה לדוגמה');

    await expect(page.locator('item-multiselect')).toBeVisible();
    await toggleMultiselectOption(page, 2);
    await submitMultiselect(page);

    await expect(page.locator('results-screen')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toBeVisible();
  });
});