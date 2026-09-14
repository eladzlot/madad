// Remote deployment — the patient-side transport (docs/REMOTE_SPEC.md §4.1,
// §4.2, §8.1), driven against a mocked /api/v1 with Playwright route
// interception. The server itself is unit-tested in server/lib; this suite
// proves the app's behaviour for each server answer.
import { test, expect } from '@playwright/test';

const UID = 'E2E0-0017';                       // valid check symbol
const URL_OK = `/?items=phq9#pid=${UID}`;

const shadowIn = (page, host, inner) => page.locator(`${host} >> ${inner}`);
const clickBegin = (page) => shadowIn(page, 'welcome-screen', 'button.begin-btn').click();
const clickContinue = (page) => page.locator('item-instructions >> button.continue-btn').click();

async function answerPhq9(page, optionIndex = 1) {
  await expect(page.locator('item-instructions')).toBeVisible();
  await clickContinue(page);
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('item-select')).toBeVisible();
    const lenBefore = await page.evaluate(() => window.history.length);
    await page.locator('item-select >> button.option').nth(optionIndex).click();
    if (i < 8) await page.waitForFunction(n => window.history.length > n, lenBefore);
  }
  await expect(page.locator('results-screen')).toBeVisible({ timeout: 3000 });
}

/** Mock the API. `check` and `submit` are functions (route) → response spec. */
function mockApi(page, { check = () => ({ status: 204 }), submit = () => ({ status: 204 }) } = {}) {
  const calls = { check: [], submit: [] };
  const fulfil = async (route, spec) => {
    if (spec === 'abort') return route.abort('connectionrefused');
    return route.fulfill({
      status: spec.status,
      headers: { 'Cache-Control': 'no-store', ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      body: spec.body ? JSON.stringify(spec.body) : '',
    });
  };
  return page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname.startsWith('/api/v1/uids/')) {
      calls.check.push(decodeURIComponent(url.pathname.split('/').pop()));
      return fulfil(route, check(calls.check.length));
    }
    if (req.method() === 'POST' && url.pathname === '/api/v1/sessions') {
      calls.submit.push(req.postDataJSON());
      return fulfil(route, submit(calls.submit.length));
    }
    return route.fulfill({ status: 404 });
  }).then(() => calls);
}

test.describe('session start — registry check (§4.1)', () => {
  test('a registered uid reaches the welcome screen and the check carried the uid', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto(URL_OK);
    await expect(page.locator('welcome-screen')).toBeVisible();
    expect(calls.check).toEqual([UID]);
  });

  test('an unknown uid is refused before the welcome screen', async ({ page }) => {
    await mockApi(page, { check: () => ({ status: 404, body: { error: 'unknown_uid' } }) });
    await page.goto(URL_OK);
    await expect(page.locator('welcome-screen')).toHaveCount(0);
    await expect(page.locator('#app')).toContainText('אינו רשום');
  });

  test('an unreachable API fails open — the session proceeds', async ({ page }) => {
    await mockApi(page, { check: () => 'abort' });
    await page.goto(URL_OK);
    await expect(page.locator('welcome-screen')).toBeVisible();
  });

  test('a bare 404 (static host, no API) also fails open', async ({ page }) => {
    await mockApi(page, { check: () => ({ status: 404 }) });
    await page.goto(URL_OK);
    await expect(page.locator('welcome-screen')).toBeVisible();
  });
});

test.describe('completion — submission (§4.2, §8.1)', () => {
  test('sends the envelope once, shows "sent", keeps the PDF button, has no share button', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto(URL_OK);
    await clickBegin(page);
    await answerPhq9(page, 1);

    const status = page.locator('results-screen >> .status');
    await expect(status).toHaveClass(/status--success/);
    await expect(status).toContainText('נשלחו');
    expect(calls.submit).toHaveLength(1);
    const { uid, envelope } = calls.submit[0];
    expect(uid).toBe(UID);
    expect(envelope.pid).toBe(UID);
    expect(envelope.name).toBe('');
    expect(envelope.instruments.map(i => i.questionnaireId)).toEqual(['phq9']);
    expect(envelope.sessionState.scores.phq9.total).toBe(9);

    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toContainText('הורד');
    await expect(page.locator('results-screen >> button', { hasText: 'שתף' })).toHaveCount(0);
  });

  test('going back and changing an answer sends again; revisiting unchanged does not', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto(URL_OK);
    await clickBegin(page);
    await answerPhq9(page, 1);
    await expect(page.locator('results-screen >> .status--success')).toBeVisible();

    // Back to the last item, re-answer with a different value → new completion.
    await page.goBack();
    await expect(page.locator('item-select')).toBeVisible();
    await page.locator('item-select >> button.option').nth(2).click();
    await expect(page.locator('results-screen >> .status--success')).toBeVisible();
    expect(calls.submit).toHaveLength(2);
    expect(calls.submit[1].envelope.sessionState.scores.phq9.total).toBe(10);

    // Back and forward with no change → no third submission.
    await page.goBack();
    await expect(page.locator('item-select')).toBeVisible();
    await page.goForward();
    await expect(page.locator('results-screen >> .status--success')).toBeVisible();
    expect(calls.submit).toHaveLength(2);
  });

  test('a failed send shows the fallback with a retry that succeeds', async ({ page }) => {
    // First two attempts (initial + automatic retry) fail; the manual retry succeeds.
    const calls = await mockApi(page, { submit: (n) => (n <= 2 ? { status: 503 } : { status: 204 }) });
    await page.goto(URL_OK);
    await clickBegin(page);
    await answerPhq9(page, 0);

    const status = page.locator('results-screen >> .status');
    await expect(status).toHaveClass(/status--error/, { timeout: 10_000 });
    await expect(status).toContainText('PDF');
    expect(calls.submit).toHaveLength(2);
    await expect(page.locator('results-screen >> button.pdf-btn--primary')).toBeVisible();

    await status.locator('button').click();
    await expect(status).toHaveClass(/status--success/);
    expect(calls.submit).toHaveLength(3);
  });

  test('a refused send (unknown uid at submit time) offers the PDF and no retry', async ({ page }) => {
    const calls = await mockApi(page, { submit: () => ({ status: 404, body: { error: 'unknown_uid' } }) });
    await page.goto(URL_OK);
    await clickBegin(page);
    await answerPhq9(page, 0);

    const status = page.locator('results-screen >> .status');
    await expect(status).toHaveClass(/status--error/);
    await expect(status).toContainText('קישור חדש');
    await expect(status.locator('button')).toHaveCount(0);
    expect(calls.submit).toHaveLength(1);          // refusals are not retried
  });
});
