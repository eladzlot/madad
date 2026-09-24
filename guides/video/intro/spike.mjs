// Capture spike (SPEC.md §13 step 1) — throwaway, not the real clips.mjs.
//
// Records two scenes on the phone (iPhone 14, he-IL) against the local dev
// server with the API mocked, as CDP screencast frames, PNG and JPEG, so the
// capture choice rests on numbers rather than guesses.
//
// Findings so far:
//   - Without --force-device-scale-factor the screencast (and recordVideo)
//     deliver CSS-pixel frames, 390×664, even with an emulated scale of 3.
//     With the flag, frames are 1170×1992.
//   - Under continuous motion the screencast sustains ~32 fps at scale 3 and
//     ~57 fps at scale 2. Frames arrive only when something changes.
//   - The clinician surfaces had no open animations (drawer, QR dialog,
//     session panel); they were added to the app on 2026-09-24 (a548e44), so
//     the video shows the app's own motion. The touch ring is injected here.
//
// Usage (repo root, dev server on :5173 on branch remote):
//   node guides/video/intro/spike.mjs
// Output: guides/video/intro/raw/spike/<scene>-<method>/ (gitignored)
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';

const LOCAL = 'http://localhost:5173';
const OUT = new URL('./raw/spike/', import.meta.url).pathname;
const UID = 'K7M3-9QR7';
const SESSIONS = JSON.parse(readFileSync(new URL('../../therapist/data/sessions.json', import.meta.url)));
const DEVICE = { ...devices['iPhone 14'], locale: 'he-IL', colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block' };
const W = DEVICE.viewport.width * DEVICE.deviceScaleFactor;
const H = DEVICE.viewport.height * DEVICE.deviceScaleFactor;

const browser = await chromium.launch({ args: [`--force-device-scale-factor=${DEVICE.deviceScaleFactor}`] });

async function mockApi(page, sessions) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== LOCAL) {                       // route guard: nothing leaves localhost
      console.error(`BLOCKED non-local request: ${url}`);
      process.exitCode = 1;
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const m = route.request().method();
    let spec = { status: 404 };
    if (m === 'GET' && url.pathname.startsWith('/api/v1/uids/')) spec = { status: 204 };
    else if (m === 'POST' && url.pathname === '/api/v1/sessions') spec = { status: 204 };
    else if (m === 'GET' && url.pathname === '/api/v1/sessions') spec = { status: 200, body: { uid: UID, sessions } };
    await route.fulfill({
      status: spec.status,
      headers: { 'Cache-Control': 'no-store', ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      body: spec.body ? JSON.stringify(spec.body) : '',
    });
  });
}

// Touch indicator (SPEC §7): a mint ring at every touch, fading out. Drawn in
// the page so the screencast captures it exactly where the finger lands.
const TOUCH_RIPPLE = () => {
  const style = `position:fixed;z-index:2147483647;pointer-events:none;width:44px;height:44px;
    margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #77b770;background:#77b77040;
    transition:transform .45s ease-out, opacity .45s ease-out;`;
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const dot = document.createElement('div');
    dot.style.cssText = style + `left:${e.clientX}px;top:${e.clientY}px;transform:scale(.6);opacity:1`;
    document.documentElement.append(dot);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      dot.style.transform = 'scale(1.4)'; dot.style.opacity = '0';
    }));
    setTimeout(() => dot.remove(), 600);
  }, true);
};

async function screencast(page, dir, format) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let pending = Promise.resolve();
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const i = frames.length;
    frames.push({ t: metadata.timestamp, file: `${String(i).padStart(5, '0')}.${format === 'png' ? 'png' : 'jpg'}` });
    pending = pending.then(() => writeFileSync(dir + frames[i].file, Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format, quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return async () => {
    await cdp.send('Page.stopScreencast');
    await pending;
    return frames;
  };
}

async function open(scene, method, sessions) {
  const dir = `${OUT}${scene}-${method}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext(DEVICE);
  const page = await ctx.newPage();
  await mockApi(page, sessions);
  await page.addInitScript(TOUCH_RIPPLE);
  // Events use seconds since epoch, like the screencast's metadata.timestamp,
  // so they line up with frames.
  const events = [];
  const mark = (name) => events.push({ name, t: Date.now() / 1000 });
  let stopCast = null;
  const start = async () => { stopCast = await screencast(page, dir, method); mark('start'); };
  const stop = async () => {
    mark('end');
    const frames = await stopCast();
    await ctx.close();
    const span = frames.at(-1).t - frames[0].t;
    const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t);
    writeFileSync(dir + 'frames.json', JSON.stringify(frames));
    writeFileSync(dir + 'events.json', JSON.stringify(events, null, 1));
    return { scene, method, frameCount: frames.length, fps: +(frames.length / span).toFixed(1), maxGapMs: Math.round(Math.max(...gaps) * 1000) };
  };
  return { page, start, stop, mark };
}

// Scene 2: battery already picked; tap "הזן מזהה", type the ID, hold on the
// ready-link state.
async function sceneId(method) {
  const s = await open('02-id', method, SESSIONS);
  const { page } = s;
  await page.goto(`${LOCAL}/composer/`);
  await page.locator('clinician-nav .brand').waitFor({ timeout: 20_000 });
  await page.locator('catalog-card[data-id="course_up"] button.card').click();
  await page.waitForTimeout(600);
  await s.start();
  await page.waitForTimeout(700);
  s.mark('tap-enter-id');
  await page.locator('mobile-bar .prompt-pid-btn').tap();
  await page.waitForTimeout(600);
  s.mark('type-start');
  await page.keyboard.type(UID, { delay: 140 });
  s.mark('id-typed');
  await page.waitForTimeout(2200);
  return s.stop();
}

// Scene 6 (week 1): one session in the summary; scroll to PHQ-9, tap the
// alert point, show the detail.
async function sceneSummary(method) {
  const s = await open('06-summary', method, SESSIONS.slice(0, 1));
  const { page } = s;
  await page.goto(`${LOCAL}/aggregate/?uid=${UID.replace('-', '')}&exp=4102444800&sig=demo`);
  await page.locator('trajectory-chart').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await s.start();
  await page.waitForTimeout(800);
  const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' }).first();
  s.mark('scroll-phq');
  // A human-paced scroll: eased and rAF-driven over 900 ms, in the page
  // (wheel events round-trip too slowly to drive smooth motion).
  await phq.evaluate((el) => new Promise((done) => {
    const from = scrollY, to = scrollY + el.getBoundingClientRect().top - 120, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      scrollTo(0, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }));
  s.mark('scrolled');
  await page.waitForTimeout(1800);
  s.mark('tap-point');
  await phq.locator('.marker').first().tap();
  await page.waitForTimeout(2500);
  return s.stop();
}

const results = [];
for (const method of ['png']) {
  results.push(await sceneId(method));
  results.push(await sceneSummary(method));
}
await browser.close();
writeFileSync(OUT + 'summary.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(r.scene, r.method, r.frameCount, 'frames', r.fps, 'fps', 'maxGap', r.maxGapMs, 'ms');
