// capture.mjs — shared screen-capture plumbing for the guide and the video.
//
// Everything here follows guides/video/intro/SPEC.md §7, which records what
// the capture spike measured:
//   - Chromium launched with --force-device-scale-factor=3 (without it the
//     screencast delivers CSS-pixel frames); frames are 1170×1992.
//   - The app is loaded under https://ctrmadad.com and routed to a local
//     production preview, so the real domain shows on screen. /api/v1 is
//     mocked. Any request to another host fails the run.
//   - Slow-motion capture: CSS animations run at 1/k speed and every wait in
//     a scene is scaled by k; the edit divides times by k.
//   - Touch ring, finger first: drawn ~250 ms (scene time) before the tap.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';

export const BASE = 'https://ctrmadad.com';
export const LOCAL = process.env.MADAD_LOCAL ?? 'http://localhost:4173';   // `vite preview` of dist/
export const DEVICE = {
  ...devices['iPhone 14'],
  locale: 'he-IL',
  colorScheme: 'light',
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
};

export async function launch() {
  return chromium.launch({ args: [`--force-device-scale-factor=${DEVICE.deviceScaleFactor}`] });
}

/**
 * Route everything under BASE to LOCAL and answer /api/v1 from `api`.
 * `api` maps "METHOD /path-prefix" → spec { status, body? } or a function
 * (request) → spec. Unlisted API calls get 404; any other host aborts and
 * marks the run failed (nothing may leave this machine).
 */
export async function mockBackend(page, api = {}) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.origin !== BASE && url.origin !== LOCAL) {
      console.error(`BLOCKED non-local request: ${url.href}`);
      process.exitCode = 1;
      return route.abort();
    }
    if (url.origin === BASE && !url.pathname.startsWith('/api/')) {
      const res = await route.fetch({ url: LOCAL + url.pathname + url.search });
      return route.fulfill({ response: res });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const key = Object.keys(api).find((k) => {
      const [method, prefix] = k.split(' ');
      return req.method() === method && url.pathname.startsWith(prefix);
    });
    let spec = key ? api[key] : { status: 404 };
    if (typeof spec === 'function') spec = spec(req);
    await route.fulfill({
      status: spec.status,
      headers: { 'Cache-Control': 'no-store', ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      body: spec.body ? JSON.stringify(spec.body) : '',
    });
  });
}

// ── Touch ring ────────────────────────────────────────────────────────────────
// Colour-neutral (translucent dark disc, white edge) so it reads on green
// buttons, the dark rail and white cards. CSS motion, so slow-motion capture
// slows it too; the removal timer is scaled by hand (timers are not slowed).
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
  // A one-off attention pulse around an element's box (the alert ring, the
  // uid in the email). Green, restrained, never covering the target.
  window.__pulse = (x, y, r) => {
    const p = document.createElement('div');
    p.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;left:${x}px;top:${y}px;
      width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px;border-radius:50%;
      border:3px solid #77b770;opacity:.95;transform:scale(1);
      transition:transform .7s cubic-bezier(.2,.8,.2,1), opacity .7s ease-out;`;
    document.documentElement.append(p);
    requestAnimationFrame(() => requestAnimationFrame(() => { p.style.transform = 'scale(1.9)'; p.style.opacity = '0'; }));
    setTimeout(() => p.remove(), 1000 * k);
  };
};

// ── Screencast ────────────────────────────────────────────────────────────────
async function screencast(page, dir) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let pending = Promise.resolve();
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const i = frames.length;
    frames.push({ t: metadata.timestamp, file: `${String(i).padStart(5, '0')}.png` });
    pending = pending.then(() => writeFileSync(dir + frames[i].file, Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const { width, height } = DEVICE.viewport;
  const s = DEVICE.deviceScaleFactor;
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: width * s, maxHeight: height * s, everyNthFrame: 1 });
  return async () => {
    await cdp.send('Page.stopScreencast');
    await pending;
    return frames.sort((a, b) => a.t - b.t);
  };
}

/**
 * A recorded take. Scene time runs from start(); real time = scene time × k
 * while nothing is cut. `cut()`…`resume()` marks footage the edit drops (the
 * patient answering off camera): scene time stands still across it.
 *
 * Written to `dir`: numbered PNG frames, frames.json (capture timestamps),
 * take.json ({ k, t0, cuts, events } — events in scene seconds).
 */
export async function openTake(browser, dir, { k = 4, api = {}, fixedTime = null, locale = null } = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext(locale ? { ...DEVICE, locale } : DEVICE);
  const page = await ctx.newPage();
  await mockBackend(page, api);
  if (fixedTime) await page.clock.setFixedTime(new Date(fixedTime));
  await page.addInitScript(TOUCH_RING, k);
  if (k !== 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / k });
  }

  const now = () => Date.now() / 1000;
  let t0 = null, stopCast = null;
  const cuts = [];            // [{ from, to }] real seconds
  let cutFrom = null;
  const events = [];
  // Scene time: real time since start, minus cut spans, divided by k.
  const sceneTime = (t = now()) => {
    let real = t - t0;
    for (const c of cuts) real -= Math.max(0, Math.min(t, c.to) - c.from);
    if (cutFrom != null) real -= t - cutFrom;
    return real / k;
  };

  const take = {
    page, k,
    async start() {
      // Pages made with setContent() never ran the init script.
      if (!(await page.evaluate(() => typeof window.__touchRing === 'function'))) await page.evaluate(TOUCH_RING, k);
      stopCast = await screencast(page, dir); t0 = now(); this.mark('start');
    },
    mark(name) { events.push({ name, t: +sceneTime().toFixed(3) }); },
    /** Wait until scene time reaches `sec` (no-op if already past). */
    async at(sec) {
      const ms = (sec - sceneTime()) * k * 1000;
      if (ms > 0) await page.waitForTimeout(ms);
    },
    wait(msScene) { return page.waitForTimeout(msScene * k); },
    /** Finger first: ring at the target, 250 ms (scene), press, tap. */
    async tap(locator, name) {
      const b = await locator.boundingBox();
      if (!b) throw new Error(`tap target not visible: ${name}`);
      await page.evaluate(([x, y]) => window.__touchRing(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      await this.wait(250);
      this.mark(name);
      await page.evaluate(() => window.__touchPress());
      await locator.tap();
    },
    /** Type so the last character lands at scene time `endSec`. */
    async typeTo(text, endSec, name) {
      const chars = [...text];
      const span = Math.max(0.3, endSec - sceneTime());
      const step = span / chars.length;
      for (const [i, ch] of chars.entries()) {
        await this.at(endSec - span + step * (i + 1));
        this.mark('key');                    // one per keystroke, for the typing sound
        await page.keyboard.type(ch);
      }
      this.mark(name);
    },
    /** Eased, rAF-driven scroll of an element (or the page) over msScene. */
    async scroll(target, deltaOrTo, msScene, { absolute = false } = {}) {
      await target.evaluate((el, [d, ms, abs]) => new Promise((done) => {
        const box = el === document.documentElement ? window : el;
        const get = () => (box === window ? scrollY : el.scrollTop);
        const set = (v) => (box === window ? scrollTo(0, v) : (el.scrollTop = v));
        const from = get(), to = abs ? d : from + d, t0 = performance.now();
        // performance.now(), not the rAF timestamp: slow-motion capture slows
        // the rAF clock too, which made a ×4 scroll run 16× long.
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          set(from + (to - from) * e);
          if (p < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      }), [deltaOrTo, msScene * k, absolute]);
    },
    /** A pulse around a locator's box, sized to enclose it. */
    async pulse(locator, name, pad = 10) {
      const b = await locator.boundingBox();
      await page.evaluate(([x, y, r]) => window.__pulse(x, y, r),
        [b.x + b.width / 2, b.y + b.height / 2, Math.max(b.width, b.height) / 2 + pad]);
      this.mark(name);
    },
    cut() { cutFrom = now(); this.mark('cut'); },
    resume() { cuts.push({ from: cutFrom, to: now() }); cutFrom = null; this.mark('resume'); },
    async stop() {
      this.mark('end');
      const frames = await stopCast();
      await ctx.close();
      writeFileSync(dir + 'frames.json', JSON.stringify(frames));
      writeFileSync(dir + 'take.json', JSON.stringify({ k, t0, cuts, events }, null, 1));
      return { dir, frames: frames.length, events };
    },
  };
  return take;
}
