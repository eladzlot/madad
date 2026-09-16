// Remote deployment — the Aggregate's fetch mode (docs/REMOTE_SPEC.md §4.3,
// §4.4, §5.2), against a mocked /api/v1. Without link params the surface is
// the PDF-drop page and is covered by aggregate.e2e.test.js as before.
import { test, expect } from '@playwright/test';

const UID = 'E2E0-0017';
const LINK = `/aggregate/?uid=E2E00017&exp=4102444800&sig=stub`;

function envelope(daysAgo, total) {
  const date = new Date(Date.UTC(2026, 8, 14) - daysAgo * 86400_000).toISOString();
  return {
    schemaVersion: 1, generatedAt: date, appVersion: 'e2e', pid: UID, name: null,
    instruments: [{ questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'configs/prod/phq9.json' }],
    sessionState: {
      answers: { phq9: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [String(i), Math.min(3, Math.floor(total / 9))])) },
      scores: { phq9: { total, category: null } },
      alerts: {}, questionnaireIds: {},
    },
  };
}

function mockApi(page, { read = () => ({ status: 200, body: { uid: UID, sessions: [] } }), link = () => ({ status: 204 }) } = {}) {
  const calls = { read: [], link: [] };
  return page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let spec;
    if (req.method() === 'GET' && url.pathname === '/api/v1/sessions') {
      calls.read.push(Object.fromEntries(url.searchParams));
      spec = read(calls.read.length);
    } else if (req.method() === 'POST' && url.pathname === '/api/v1/links') {
      calls.link.push(req.postDataJSON());
      spec = link(calls.link.length);
    } else {
      spec = { status: 404 };
    }
    await route.fulfill({
      status: spec.status,
      headers: { 'Cache-Control': 'no-store', ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      body: spec.body ? JSON.stringify(spec.body) : '',
    });
  }).then(() => calls);
}

test.describe('aggregate fetch mode', () => {
  test('a valid link loads the uid\'s sessions from the server: chart, no upload zone, no PDF download', async ({ page }) => {
    const calls = await mockApi(page, {
      read: () => ({ status: 200, body: { uid: UID, sessions: [
        { envelope: envelope(21, 18), createdAt: '2026-08-24T10:00:00Z' },
        { envelope: envelope(14, 12), createdAt: '2026-08-31T10:00:00Z' },
        { envelope: envelope(7, 9), createdAt: '2026-09-07T10:00:00Z' },
      ] } }),
    });
    await page.goto(LINK);
    await expect(page.locator('trajectory-chart')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('upload-list')).toHaveCount(0);
    await expect(page.locator('.a-remote')).toContainText(UID);
    await expect(page.locator('.a-remote')).toContainText('3');
    expect(calls.read[0]).toEqual({ uid: 'E2E00017', exp: '4102444800', sig: 'stub' });

    // Open a point: the detail panel has no "download the original PDF" link (there is no PDF).
    await page.locator('trajectory-chart >> .marker').first().click();
    await expect(page.locator('session-detail')).toBeVisible();
    await expect(page.locator('session-detail >> .download')).toHaveCount(0);
  });

  test('an expired link shows the recovery form; submitting posts the uid and confirms without disclosing', async ({ page }) => {
    const calls = await mockApi(page, { read: () => ({ status: 403, body: { error: 'forbidden' } }) });
    await page.goto(LINK);
    const form = page.locator('link-form');
    await expect(form).toBeVisible();
    await expect(form).toContainText('פג');
    await expect(page.locator('trajectory-chart')).toHaveCount(0);
    await expect(page.locator('upload-list')).toHaveCount(0);

    // Prefilled from the link; submit.
    await expect(form.locator('input')).toHaveValue(UID);
    await form.locator('button[type="submit"]').click();
    await expect(form).toContainText('אם המזהה רשום');
    expect(calls.link).toEqual([{ uid: UID }]);
  });

  test('a server error shows the form with an error heading', async ({ page }) => {
    await mockApi(page, { read: () => ({ status: 500 }) });
    await page.goto(LINK);
    await expect(page.locator('link-form')).toContainText('לא הצלחנו');
  });

  // The common arrival: no link at all. The doorbell went to spam, was deleted,
  // or the therapist bookmarked this page instead of the link.
  test('a bare page leads with the link request and keeps the PDF drop below it', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/aggregate/');

    const form = page.locator('link-form');
    await expect(form).toBeVisible();
    await expect(form).toContainText('צפייה בסיכום מטופל');
    await expect(form.locator('input')).toHaveValue('');
    await expect(page.locator('upload-list')).toBeVisible();      // still there, secondary
    expect(calls.read).toHaveLength(0);                            // nothing fetched without a link

    // Requesting a link works from here, and the reply never discloses registration.
    await form.locator('input').fill(UID);
    await form.locator('button[type="submit"]').click();
    await expect(form).toContainText('אם המזהה רשום');
    expect(calls.link).toEqual([{ uid: UID }]);
  });

  test('a uid used here is remembered and offered on the next visit', async ({ page }) => {
    await mockApi(page);
    await page.goto('/aggregate/');
    await expect(page.locator('link-form datalist option')).toHaveCount(0);

    await page.locator('link-form input').fill(UID);
    await page.locator('link-form button[type="submit"]').click();
    await expect(page.locator('link-form')).toContainText('אם המזהה רשום');

    await page.reload();
    await expect(page.locator('link-form datalist option')).toHaveCount(1);
    await expect(page.locator('link-form datalist option')).toHaveAttribute('value', UID);
  });
});
