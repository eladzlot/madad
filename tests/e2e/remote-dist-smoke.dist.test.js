// Remote deployment — dist-smoke for the built trial bundle (REMOTE_SPEC
// §12.4). Runs in the dist-smoke project (the filename matches its testMatch)
// against `vite preview` at the production base, where there is no API:
// proves the guards and the fail-open path hold in the shipped artifact.
import { test, expect } from '@playwright/test';

const UID = 'DSMK-001E';

test.describe('remote dist smoke', () => {
  test('the catalog ships without any text-item instrument', async ({ page }) => {
    const res = await page.request.get('composer/catalog.json');
    expect(res.ok()).toBe(true);
    const ids = (await res.json()).entries.map(e => e.id);
    for (const excluded of ['top3', 'demographics', 'anger_log', 'scq', 'cpt_abc', 'cpt_alternative', 'cpt_exploring', 'cpt_patterns']) {
      expect(ids).not.toContain(excluded);
    }
    expect(ids).toContain('phq9');
  });

  test('a link without a uid is refused; with a uid the registry check goes to the same origin and fails open', async ({ page }) => {
    await page.goto('?items=phq9');
    await expect(page.locator('welcome-screen')).toHaveCount(0);
    await expect(page.locator('#app')).toContainText('מזהה מטופל');

    const apiRequests = [];
    page.on('request', (req) => { if (req.url().includes('/api/v1/')) apiRequests.push(new URL(req.url())); });
    await page.goto('about:blank');                    // a fragment-only change would not reload the app
    await page.goto(`?items=phq9#pid=${UID}`);
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0].origin).toBe(new URL(page.url()).origin);
    expect(apiRequests[0].pathname).toMatch(/\/api\/v1\/uids\/DSMK-001E$/);
    // No name field, disclosure present.
    await expect(page.locator('welcome-screen >> #patient-name')).toHaveCount(0);
    await expect(page.locator('welcome-screen >> .disclosure')).toBeVisible();
  });

  test('a hand-crafted link to a text-item instrument is refused', async ({ page }) => {
    await page.goto(`?items=top3#pid=${UID}`);
    await expect(page.locator('welcome-screen')).toHaveCount(0);
    await expect(page.locator('#app')).toContainText('אינו זמין בגרסה זו');
  });

  test('the aggregate without link params is the PDF surface; with params it asks the API', async ({ page }) => {
    await page.goto('aggregate/');
    await expect(page.locator('upload-list')).toBeVisible({ timeout: 10_000 });

    const apiRequests = [];
    page.on('request', (req) => { if (req.url().includes('/api/v1/')) apiRequests.push(new URL(req.url()).pathname); });
    await page.goto('aggregate/?uid=DSMK001E&exp=1&sig=x');
    await expect(page.locator('link-form')).toBeVisible({ timeout: 10_000 });   // no API → error → recovery form
    // Base-agnostic: this project also runs at a deep base path, where the call
    // correctly becomes <base>/api/v1/sessions. Asserting the rooted path would
    // be asserting that the base was ignored, which is the bug this job hunts.
    expect(apiRequests.some(p => p.endsWith('/api/v1/sessions'))).toBe(true);
  });
});
