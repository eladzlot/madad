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

// Touch indicator (SPEC §7), drawn in the page so the screencast captures
// it exactly where the finger lands. Finger first: __touchRing() shows the
// ring ~250 ms (scene time) *before* the tap; __touchPress() dips it as the
// tap lands, then it fades. Colour-neutral (translucent dark fill, white
// edge) so it reads on the green buttons, the dark rail and white cards; a
// mint ring vanished on the mint button and cut into its letters. Its motion
// is CSS, so slow-motion capture slows it too; the removal timer is scaled
// by hand (timers are not slowed).
const TOUCH_RING = (k) => {
  let dot = null;
  window.__touchRing = (x, y) => {
    dot?.remove();
    dot = document.createElement('div');
    dot.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;width:46px;height:46px;
      margin:-23px 0 0 -23px;border-radius:50%;left:${x}px;top:${y}px;
      background:rgba(22,34,50,.22);border:2.5px solid rgba(255,255,255,.95);
      box-shadow:0 0 0 1px rgba(22,34,50,.35), 0 2px 8px rgba(22,34,50,.25);
      transform:scale(.7);opacity:0;transition:transform .14s ease-out, opacity .14s ease-out;`;
    document.documentElement.append(dot);
    requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.transform = 'scale(1)'; dot.style.opacity = '1'; }));
  };
  window.__touchPress = () => {
    const d = dot; dot = null;
    if (!d) return;
    d.style.transition = 'transform .12s ease-in, opacity .35s ease-out .18s';
    d.style.transform = 'scale(.82)'; d.style.opacity = '0';
    setTimeout(() => d.remove(), 800 * k);
  };
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

// k = slow-motion factor. The page's CSS animations and transitions run at
// 1/k speed (CDP Animation.setPlaybackRate) and every wait of ours is scaled
// by k, so the scene plays k times slower in real time and is captured with
// ~k times the frames. The edit divides all times by k. JS timers inside the
// app are NOT slowed — fine for the Composer and the Aggregate, to be checked
// for the patient app (150 ms auto-advance).
async function open(scene, k, sessions) {
  const dir = `${OUT}${scene}-x${k}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext(DEVICE);
  const page = await ctx.newPage();
  await mockApi(page, sessions);
  await page.addInitScript(TOUCH_RING, k);
  if (k !== 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / k });
  }
  // Events use seconds since epoch, like the screencast's metadata.timestamp,
  // so they line up with frames.
  const events = [];
  const mark = (name) => events.push({ name, t: Date.now() / 1000 });
  const wait = (ms) => page.waitForTimeout(ms * k);
  const tap = async (locator, name) => {
    const b = await locator.boundingBox();
    await page.evaluate(([x, y]) => window.__touchRing(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
    await wait(250);                       // finger first
    mark(name);
    await page.evaluate(() => window.__touchPress());
    await locator.tap();
  };
  let stopCast = null;
  const start = async () => { stopCast = await screencast(page, dir, 'png'); mark('start'); };
  const stop = async () => {
    mark('end');
    const frames = await stopCast();
    await ctx.close();
    writeFileSync(dir + 'frames.json', JSON.stringify(frames));
    writeFileSync(dir + 'events.json', JSON.stringify({ k, events }, null, 1));
    return { scene, k, frameCount: frames.length };
  };
  return { page, start, stop, mark, wait, tap, k };
}

// Frames captured inside an event window, and the largest gap, in scene time.
function density(dir, from, to) {
  const frames = JSON.parse(readFileSync(dir + 'frames.json')).sort((a, b) => a.t - b.t);
  const { k, events } = JSON.parse(readFileSync(dir + 'events.json'));
  const ev = Object.fromEntries(events.map(e => [e.name, e.t]));
  const a = ev[from[0]] + from[1] * k, b = ev[to[0]] + to[1] * k;
  const inWin = frames.filter(f => f.t >= a && f.t <= b).map(f => f.t);
  const gaps = inWin.slice(1).map((t, i) => (t - inWin[i]) / k * 1000);
  return { frames: inWin.length, maxGapMs: Math.round(Math.max(0, ...gaps)) };
}

// Scene 2: battery already picked; tap "הזן מזהה", type the ID, hold on the
// ready-link state.
async function sceneId(k) {
  const s = await open('02-id', k, SESSIONS);
  const { page } = s;
  await page.goto(`${LOCAL}/composer/`);
  await page.locator('clinician-nav .brand').waitFor({ timeout: 20_000 });
  await page.locator('catalog-card[data-id="course_up"] button.card').click();
  await page.waitForTimeout(600);
  await s.start();
  await s.wait(700);
  await s.tap(page.locator('mobile-bar .prompt-pid-btn'), 'tap-enter-id');
  await s.wait(700);
  s.mark('type-start');
  await page.keyboard.type(UID, { delay: 140 * k });
  s.mark('id-typed');
  await s.wait(2200);
  return s.stop();
}

// Scene 6 (week 1): one session in the summary; scroll to PHQ-9, tap the
// alert point, show the detail.
async function sceneSummary(k) {
  const s = await open('06-summary', k, SESSIONS.slice(0, 1));
  const { page } = s;
  await page.goto(`${LOCAL}/aggregate/?uid=${UID.replace('-', '')}&exp=4102444800&sig=demo`);
  await page.locator('trajectory-chart').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await s.start();
  await s.wait(800);
  const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' }).first();
  s.mark('scroll-phq');
  // A human-paced scroll: eased and rAF-driven over 900 ms (scene time), in
  // the page (wheel events round-trip too slowly to drive smooth motion).
  await phq.evaluate((el, ms) => new Promise((done) => {
    const from = scrollY, to = scrollY + el.getBoundingClientRect().top - 120, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      scrollTo(0, from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), 900 * k);
  s.mark('scrolled');
  await s.wait(1800);
  await s.tap(phq.locator('.marker').first(), 'tap-point');
  await s.wait(2500);
  return s.stop();
}

const K = (process.argv[2] ?? '1,4').split(',').map(Number);
for (const k of K) {
  await sceneId(k);
  await sceneSummary(k);
  const id = density(`${OUT}02-id-x${k}/`, ['tap-enter-id', 0], ['tap-enter-id', 0.35]);
  const sd = density(`${OUT}06-summary-x${k}/`, ['tap-point', 0], ['tap-point', 0.35]);
  console.log(`k=${k}  drawer open: ${id.frames} frames, max gap ${id.maxGapMs} ms   panel open: ${sd.frames} frames, max gap ${sd.maxGapMs} ms   (scene time)`);
}
await browser.close();
