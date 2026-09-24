// Screenshots for the therapist handout. Runs against `vite preview` of dist/
// (the trial build, branch `remote`) on :4173 with /api/v1 mocked — nothing
// touches ctrmadad.com. Usage (from the repo root):
//   npm run build && npx vite preview --port 4173 --strictPort --base=/ &
//   node guides/therapist/data/shots.mjs [only-prefix]
import { chromium, devices } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { doorbellEmail } from '../../../server/lib/email.js';

const LOCAL = 'http://localhost:4173';
const BASE = 'https://ctrmadad.com';   // served from LOCAL by interception; never hits the network
const OUT = new URL('../images/', import.meta.url).pathname;
const UID = 'K7M3-9QR7';
const SESSIONS = JSON.parse(readFileSync(new URL('./sessions.json', import.meta.url)));
const ONLY = process.argv[2];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function mockApi(page, { read = { status: 200, body: { uid: UID, sessions: SESSIONS } } } = {}) {
  await page.route(BASE + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) {
      const res = await route.fetch({ url: LOCAL + url.pathname + url.search });
      return route.fulfill({ response: res });
    }
    let spec = { status: 404 };
    if (req.method() === 'GET' && url.pathname.startsWith('/api/v1/uids/')) spec = { status: 204 };
    else if (req.method() === 'POST' && url.pathname === '/api/v1/sessions') spec = { status: 204 };
    else if (req.method() === 'GET' && url.pathname === '/api/v1/sessions') spec = read;
    else if (req.method() === 'POST' && url.pathname === '/api/v1/links') spec = { status: 204 };
    await route.fulfill({
      status: spec.status,
      headers: { 'Cache-Control': 'no-store', ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      body: spec.body ? JSON.stringify(spec.body) : '',
    });
  });
}

async function desktop() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'he-IL', deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await mockApi(page);
  return page;
}
async function phone() {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'he-IL', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await mockApi(page);
  return page;
}
const shot = async (target, name, opts = {}) => {
  if (ONLY && !name.startsWith(ONLY)) return;
  await target.screenshot({ path: OUT + name + '.png', animations: 'disabled', ...opts });
  console.log('✓', name);
};
const settle = (page, ms = 500) => page.waitForTimeout(ms);

// ── 1. Composer ──────────────────────────────────────────────────────────────
// Order follows the handout: pick questionnaires, then the uid, then the QR.
{
  const page = await desktop();
  await page.goto(BASE + '/composer/');
  await page.locator('clinician-nav .brand').waitFor({ timeout: 20_000 });
  await settle(page);
  await shot(page, '01-composer');

  await page.locator('catalog-card[data-id="course_up"] button.card').click();
  await settle(page);
  await shot(page, '02-course-selected');

  // Add an optional instrument through search.
  await page.locator('catalog-controls input[type="search"]').fill('שינה');
  await settle(page, 700);
  await shot(page, '03-search');
  await page.locator('catalog-card[data-id="isi"] button.card').click();
  await page.locator('catalog-controls input[type="search"]').fill('');
  await settle(page);
  await shot(page, '04-instrument-added');

  // Preview a questionnaire (eye icon).
  await page.locator('catalog-card[data-id="phq9"] button.preview-btn').click();
  await settle(page, 800);
  await shot(page, '05-preview');
  await page.keyboard.press('Escape');
  await settle(page);

  await page.locator('selection-cart session-settings #settings-pid').fill(UID);
  await settle(page);
  await shot(page, '06-uid-entered');

  // QR handover.
  await page.locator('selection-cart .qr-btn').click();
  await settle(page, 800);
  await shot(page, '07-qr');
  await page.keyboard.press('Escape');
  await page.context().close();
}

// ── 1b. Composer on a phone ──────────────────────────────────────────────────
// Same steps as above; on a phone the rail lives in a bottom sheet behind the
// bar, so the uid and the picked list are shown with the sheet open.
{
  const page = await phone();
  const bar = page.locator('mobile-bar');
  const openSheet = async () => { await bar.locator('.count-btn').click(); await settle(page); };
  const closeSheet = async () => { await bar.locator('.close-btn').click(); await settle(page); };

  await page.goto(BASE + '/composer/');
  await page.locator('clinician-nav .brand').waitFor({ timeout: 20_000 });
  await settle(page);
  await shot(page, '01-composer-phone');

  await page.locator('catalog-card[data-id="course_up"] button.card').click();
  await settle(page);
  await shot(page, '02-course-selected-phone');

  await page.locator('catalog-controls input[type="search"]').fill('שינה');
  await settle(page, 700);
  await shot(page, '03-search-phone');
  await page.locator('catalog-card[data-id="isi"] button.card').click();
  await page.locator('catalog-controls input[type="search"]').fill('');
  await settle(page);
  await openSheet();
  await shot(page, '04-instrument-added-phone');
  await closeSheet();

  await page.locator('catalog-card[data-id="phq9"] button.preview-btn').click();
  await settle(page, 800);
  await shot(page, '05-preview-phone');
  await page.keyboard.press('Escape');
  await settle(page);

  await openSheet();
  await bar.locator('selection-cart #settings-pid').fill(UID);
  await settle(page);
  await shot(page, '06-uid-entered-phone');
  await closeSheet();

  await bar.locator('.bar .qr-btn').first().click();
  await settle(page, 800);
  await shot(page, '07-qr-phone');
  await page.context().close();
}

// ── 1c. Composites: desktop + phone pairs, and rows of phone screens ─────────
{
  const src = (f) => 'data:image/png;base64,' + readFileSync(OUT + f + '.png').toString('base64');
  const PHONE = 'border:8px solid #1d2622;border-radius:30px';
  const page = await desktop();
  const compose = async (name, inner) => {
    if (ONLY && !name.startsWith(ONLY)) return;
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;
      font-family:'IBM Plex Sans Hebrew','Noto Sans Hebrew',Arial,sans-serif">
      <div id="c" style="display:inline-flex;gap:28px;align-items:flex-end;padding:16px">${inner}</div>
      </body></html>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await shot(page.locator('#c'), name);
  };

  for (const name of ['01-composer', '02-course-selected', '03-search', '04-instrument-added',
                      '05-preview', '06-uid-entered', '07-qr']) {
    await compose(name + '-pair', `
      <img src="${src(name)}" style="height:640px;border:1px solid #cfd8d3;border-radius:6px">
      <img src="${src(name + '-phone')}" style="height:640px;${PHONE}">`);
  }

  // A row of phone screens, first step on the right (the handout is RTL).
  const row = (steps) => `<div dir="rtl" style="display:flex;gap:36px;align-items:flex-start">${
    steps.map(([f, label]) => `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:14px">
      <img src="${src(f)}" style="height:640px;${PHONE}">
      ${label ? `<figcaption style="font-size:26px;font-weight:600;color:#21322b">${label}</figcaption>` : ''}
    </figure>`).join('')}</div>`;

  await compose('00-quickstart', row([
    ['02-course-selected-phone', '1. בוחרים שאלון'],
    ['06-uid-entered-phone', '2. מזינים מזהה מטופל'],
    ['07-qr-phone', '3. המטופל סורק את הקוד'],
  ]));
  await page.context().close();
}

// ── 1d. QR code to the composer, for the handout ─────────────────────────────
{
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(BASE + '/composer/', 'Byte');
  qr.make();
  const page = await desktop();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">
    <div id="qr" style="display:inline-block;padding:8px">${qr.createSvgTag({ cellSize: 8, margin: 32, scalable: false })}</div>
    </body></html>`);
  await shot(page.locator('#qr svg'), '00-composer-qr');
  await page.context().close();
}

// ── 2. Patient (phone) ───────────────────────────────────────────────────────
{
  const page = await phone();
  await page.goto(`${BASE}/?items=course_up#pid=${UID}`);
  await page.locator('welcome-screen').waitFor({ timeout: 20_000 });
  await settle(page, 800);
  await shot(page, '08-patient-welcome');
  await page.locator('welcome-screen >> button.begin-btn').click();
  await page.locator('item-instructions').waitFor();
  await settle(page);
  await shot(page, '09-patient-instructions');
  await page.locator('item-instructions >> button.continue-btn').click();
  await page.locator('item-select').first().waitFor();
  await settle(page);
  await shot(page, '10-patient-question');

  // Answer everything until the results screen.
  for (let i = 0; i < 40; i++) {
    if (await page.locator('results-screen').isVisible()) break;
    if (await page.locator('item-instructions').isVisible()) {
      await page.locator('item-instructions >> button.continue-btn').click();
    } else if (await page.locator('item-select').isVisible()) {
      await page.locator('item-select >> button.option').nth(1).click();
    }
    await settle(page, 450);
  }
  await page.locator('results-screen').waitFor();
  await settle(page, 1500);
  await page.setViewportSize({ width: 390, height: 760 });   // the results screen clips at 664px (see handout notes)
  await settle(page, 600);
  await shot(page, '11-patient-sent');
  await page.context().close();
}

// ── 2b. The patient's four screens in one row, first on the right, equal widths
if (!ONLY || '08-patient-row'.startsWith(ONLY)) {
  const src = (f) => 'data:image/png;base64,' + readFileSync(OUT + f + '.png').toString('base64');
  const page = await desktop();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">
    <div id="c" dir="rtl" style="display:inline-flex;gap:32px;align-items:flex-start;padding:16px">${
      ['08-patient-welcome', '09-patient-instructions', '10-patient-question', '11-patient-sent']
        .map((f) => `<img src="${src(f)}" style="width:300px;border:8px solid #1d2622;border-radius:30px">`).join('')
    }</div></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await shot(page.locator('#c'), '08-patient-row');
  await page.context().close();
}

// ── 3. The notification email ────────────────────────────────────────────────
{
  const mail = doorbellEmail({ uid: UID, link: BASE + '/aggregate/?uid=…', date: new Date('2026-09-14T09:30:00Z') });
  const page = await desktop();
  await page.setViewportSize({ width: 760, height: 420 });
  await page.setContent(`<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#eef1f4;font-family:Arial,sans-serif">
    <div style="margin:24px;background:#fff;border:1px solid #d5dbe1;border-radius:8px;padding:20px 24px;font-size:15px;line-height:1.6">
      <div style="font-size:19px;font-weight:bold;margin-bottom:6px">${mail.subject}</div>
      <div style="color:#555;font-size:13px;border-bottom:1px solid #e3e7eb;padding-bottom:10px;margin-bottom:6px">
        מאת: מדד · CTR &lt;<bdi>madad@ctrmadad.com</bdi>&gt;</div>
      ${mail.html}
    </div></body></html>`);
  await shot(page, '12-email', { fullPage: true });
  await page.context().close();
}

// ── 4. Patient summary (Aggregate, fetch mode) ───────────────────────────────
{
  const page = await desktop();
  await page.goto(`${BASE}/aggregate/?uid=${UID.replace('-', '')}&exp=4102444800&sig=demo`);
  await page.locator('trajectory-chart').first().waitFor({ timeout: 20_000 });
  await settle(page, 1200);
  await shot(page, '13-summary');

  const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' }).first();
  await phq.scrollIntoViewIfNeeded();
  await settle(page);
  await shot(phq, '14-chart-card');

  await phq.locator('.marker').first().click();
  await page.locator('session-detail').waitFor();
  await settle(page, 700);
  await shot(page, '15-session-detail');
  await page.keyboard.press('Escape');
  await settle(page);

  await phq.locator('[data-view="heatmap"]').click();
  await settle(page, 700);
  await shot(phq, '16-heatmap');

  await phq.locator('[data-view="table"]').click();
  await settle(page, 700);
  await shot(phq, '17-table');
  await page.context().close();
}

// ── 5. Requesting a new link ─────────────────────────────────────────────────
{
  const page = await desktop();
  await mockApi(page, { read: { status: 403, body: { error: 'forbidden' } } });
  await page.goto(`${BASE}/aggregate/?uid=${UID.replace('-', '')}&exp=1&sig=demo`);
  await page.locator('link-form').waitFor({ timeout: 20_000 });
  await settle(page, 800);
  await shot(page, '18-link-expired');

  await page.goto(`${BASE}/aggregate/`);
  await page.locator('link-form').waitFor({ timeout: 20_000 });
  await settle(page, 800);
  await shot(page, '19-request-link');
  await page.locator('link-form input').fill(UID);
  await page.locator('link-form button[type="submit"]').click();
  await settle(page, 800);
  await shot(page, '20-link-sent');
  await page.context().close();
}

await browser.close();
