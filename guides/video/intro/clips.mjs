// clips.mjs — records the intro video's screen clips, timed to cues.json.
//
// Each scene waits for its cue times (from the narration; placeholders from
// `cues.mjs --estimate` until the recording exists) and acts on them: the
// ID's last character lands on "מוכן", the alert pulse on "התראה", and so on.
// Capture rules are in SPEC.md §7 and guides/lib/capture.mjs.
//
// Usage (repo root, branch remote):
//   npm run build && npx vite preview --port 4173 --strictPort --base=/ &
//   node guides/video/intro/cues.mjs --estimate        # or --from-audio
//   node guides/video/intro/clips.mjs [scene …]        # default: all
// Output: guides/video/intro/raw/clips/<scene>/ (gitignored): PNG frames,
// frames.json, take.json. Scene 08 has no capture (the end card is built in
// the edit).
import { readFileSync } from 'fs';
import { launch, openTake, BASE } from '../../lib/capture.mjs';
import { doorbellEmail } from '../../../server/lib/email.js';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = HERE + 'raw/clips/';
const CUES = JSON.parse(readFileSync(HERE + 'cues.json'));
const SESSIONS = JSON.parse(readFileSync(HERE + '../../therapist/data/sessions.json'));
const SCENARIO = JSON.parse(readFileSync(HERE + '../../therapist/data/scenario.json'));
const UID = SCENARIO.pid;                                   // K7M3-9QR7
const WEEK1 = SCENARIO.sessions[0];                         // 27 Jul 2026 — the session on camera
const SLOW = 4;                                             // SPEC §7: slow-motion capture by default

const API = (sessions) => ({
  'GET /api/v1/uids/': { status: 204 },
  'POST /api/v1/sessions': { status: 204 },
  'GET /api/v1/sessions': { status: 200, body: { uid: UID, sessions } },
  'POST /api/v1/links': { status: 204 },
});
const SUMMARY_URL = `${BASE}/aggregate/?uid=${UID.replace('-', '')}&exp=4102444800&sig=demo`;

// ── Cue lookup ────────────────────────────────────────────────────────────────
const norm = (w) => w.replace(/[^\p{L}\p{N}]/gu, '');
function timing(sceneId) {
  const s = CUES.scenes[sceneId];
  const cue = (name) => {
    if (!(name in s.cues)) throw new Error(`${sceneId}: no cue ${name}`);
    return s.cues[name];
  };
  const words = s.lines.flatMap((l) => l.words);
  // The narration line that starts at or after a cue.
  const line = (fromCue) => s.lines.find((l) => l.start >= cue(fromCue) - 1e-6);
  // First occurrence of `word` at or after `fromCue` (or the scene start).
  // The script gets edited: a missing anchor word warns and falls back to
  // the last word of the cue's line instead of stopping the run.
  const word = (w, fromCue) => {
    const from = fromCue ? cue(fromCue) : 0;
    const hit = words.find((x) => x.start >= from - 1e-6 && norm(x.w) === norm(w));
    if (hit) return hit;
    const fallback = (fromCue ? line(fromCue) : s.lines[0]).words.at(-1);
    console.warn(`  ! ${sceneId}: anchor word "${w}" not in the script after ${fromCue ?? 'start'}; using "${fallback.w}"`);
    return fallback;
  };
  return { cue, word, line, duration: s.duration };
}

// ── Composer helpers ──────────────────────────────────────────────────────────
const catalog = (page) => page.locator('composer-app div.main');
const search = (page) => page.locator('catalog-controls input[type="search"]');
const battery = (page) => page.locator('catalog-card[data-id="course_up"] button.card');
async function composerReady(page) {
  await page.goto(`${BASE}/composer/`);
  await page.locator('clinician-nav .brand').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
}
// Scene 1's end state: searched, battery picked.
async function batteryPicked(page) {
  await search(page).fill('הכשרה');
  await page.waitForTimeout(500);
  await battery(page).click();
  await page.waitForTimeout(400);
}

// ── Scenes ────────────────────────────────────────────────────────────────────
const SCENE = {
  // 1. The catalogue: a sweep for breadth, then search and pick the battery.
  async '01-composer'(browser) {
    const T = timing('01-composer');
    const take = await openTake(browser, OUT + '01-composer/', { k: SLOW, api: API([]) });
    const { page } = take;
    await composerReady(page);
    await take.start();
    await take.at(T.cue('CATALOG-SWEEP'));
    const sweep = T.line('CATALOG-SWEEP');
    const half = (sweep.end - sweep.start) / 2;
    await take.scroll(catalog(page), 820, half * 1000);
    await take.scroll(catalog(page), 0, half * 900, { absolute: true });
    await take.at(T.cue('SEARCH-BATTERY'));
    await take.tap(search(page), 'tap-search');
    await take.typeTo('הכשרה', T.word('"הכשרה",', 'SEARCH-BATTERY').end, 'search-typed');
    await take.at(T.word('שלכם,', 'SEARCH-BATTERY').start);
    await take.tap(battery(page), 'battery-picked');
    await take.at(T.duration);
    return take.stop();
  },

  // 2. The ID: the drawer opens, the last character lands on "מוכן", the
  // link-ready state appears by itself.
  async '02-id'(browser) {
    const T = timing('02-id');
    const take = await openTake(browser, OUT + '02-id/', { k: SLOW, api: API([]) });
    const { page } = take;
    await composerReady(page);
    await batteryPicked(page);
    await take.start();
    await take.at(T.cue('TYPE-ID'));
    await take.tap(page.locator('mobile-bar .prompt-pid-btn'), 'tap-enter-id');
    await take.wait(450);                                   // the drawer settles
    await take.typeTo(UID, T.word('מוכן.', 'TYPE-ID').start + 0.15, 'id-typed');
    await page.locator('mobile-bar .sheet .qr-btn:not([disabled])').waitFor();
    take.mark('link-ready');
    await take.at(T.duration);
    return take.stop();
  },

  // 3. The QR: tap, the code opens.
  async '03-qr'(browser) {
    const T = timing('03-qr');
    const take = await openTake(browser, OUT + '03-qr/', { k: SLOW, api: API([]) });
    const { page } = take;
    await composerReady(page);
    await batteryPicked(page);
    await page.locator('mobile-bar .prompt-pid-btn').click();
    await page.keyboard.type(UID);
    await page.waitForTimeout(500);
    await take.start();
    await take.at(T.word('QR,', 'OPEN-QR').start - 0.1);
    await take.tap(page.locator('mobile-bar .sheet .qr-btn'), 'tap-qr');
    await page.locator('qr-code dialog[open]').first().waitFor();
    take.mark('qr-open');
    await take.at(T.duration);
    return take.stop();
  },

  // 4. The patient: two real questions on camera, the rest answered off
  // camera (cut), then the results. Recorded at ×1: the app's 150 ms
  // auto-advance is a JS timer, which slow motion would not slow.
  async '04-patient'(browser) {
    const T = timing('04-patient');
    const take = await openTake(browser, OUT + '04-patient/', {
      k: 1, api: API([]), fixedTime: `${WEEK1.date}T09:30:00+03:00`,
    });
    const { page } = take;
    const answers = [
      ...Object.values(WEEK1.instruments.oasis.answers),
      ...Object.values(WEEK1.instruments.phq9.answers),
    ];
    let next = 0;
    const answer = async (name) => {
      const sel = page.locator('item-select');
      const v = answers[next++];
      const i = await sel.evaluate((el, val) => el.item.options.findIndex((o) => o.value === val), v);
      const btn = page.locator('item-select >> button.option').nth(i);
      if (name) await take.tap(btn, name); else await btn.click();
    };
    await page.goto(`${BASE}/?items=course_up#pid=${UID}`);
    await page.locator('welcome-screen').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await take.start();
    await take.at(T.word('התחלה,', 'PATIENT-WELCOME').start);
    await take.tap(page.locator('welcome-screen >> button.begin-btn'), 'tap-begin');
    await page.locator('item-instructions').waitFor();
    await take.at(T.word('לענות.', 'PATIENT-WELCOME').start);
    await take.tap(page.locator('item-instructions >> button.continue-btn'), 'tap-continue');
    await page.locator('item-select').waitFor();
    await take.at(T.word('עונים,', 'PATIENT-QUESTION-1').start);
    await answer('answer-1');
    await take.at(T.word('הבאה.', 'PATIENT-QUESTION-2').start);
    await answer('answer-2');
    await take.wait(350);
    take.cut();                                             // off camera from here
    for (let i = 0; i < 60 && !(await page.locator('results-screen').isVisible()); i++) {
      if (await page.locator('item-instructions').isVisible()) {
        await page.locator('item-instructions >> button.continue-btn').click();
      } else if (await page.locator('item-select').isVisible()) {
        await answer();
      }
      await page.waitForTimeout(260);
    }
    await page.locator('results-screen .status--success').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    take.resume();
    take.mark('results');
    if (next !== answers.length) throw new Error(`answered ${next} of ${answers.length}`);
    await take.at(T.duration);
    return take.stop();
  },

  // 5. The email: a generic phone mail view (no real mail app's look) with
  // the real doorbellEmail() content. Ping, open, pulse the ID, tap the link.
  async '05-email'(browser) {
    const T = timing('05-email');
    const take = await openTake(browser, OUT + '05-email/', { k: SLOW, api: API([]) });
    const { page } = take;
    const mail = doorbellEmail({ uid: UID, link: SUMMARY_URL, date: new Date(`${WEEK1.date}T09:40:00+03:00`) });
    await page.setContent(mailApp(mail));
    await page.waitForTimeout(500);
    await take.start();
    await take.at(T.cue('EMAIL-PING'));
    await page.evaluate(() => document.body.classList.add('arrived'));
    take.mark('ping');
    await take.at(T.word('אימייל', 'EMAIL-ARRIVES').start);
    await take.tap(page.locator('.row:not(.old)'), 'open-mail');
    await page.evaluate(() => document.body.classList.add('reading'));
    await take.at(T.word('המזהה', 'EMAIL-ARRIVES').start);
    await take.pulse(page.locator('.message bdi').first(), 'pulse-uid', 6);
    await take.at(T.word('הקישור', 'EMAIL-OPEN').start);
    await take.tap(page.locator('.message a'), 'tap-link');
    await take.at(T.duration);
    return take.stop();
  },

  // 6. Week 1 in the summary: scroll to PHQ-9, pulse the alert ring on
  // "התראה", tap the point, the detail panel.
  async '06-summary'(browser) {
    const T = timing('06-summary');
    const take = await openTake(browser, OUT + '06-summary/', { k: SLOW, api: API(SESSIONS.slice(0, 1)) });
    const { page } = take;
    await page.goto(SUMMARY_URL);
    await page.locator('trajectory-chart').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' }).first();
    await take.start();
    await take.at(T.cue('PHQ-CARD'));
    const top = await phq.evaluate((el) => el.getBoundingClientRect().top);
    await take.scroll(page.locator('html'), top - 90, 900);
    await take.at(T.word('התראה', 'PHQ-ALERT').start);
    await take.pulse(phq.locator('.marker').first(), 'pulse-alert', 16);
    await take.at(T.cue('SESSION-DETAIL') + 0.3);
    await take.tap(phq.locator('.marker').first(), 'tap-point');
    await page.locator('session-detail').waitFor();
    take.mark('detail-open');
    await take.at(T.duration);
    return take.stop();
  },

  // 7. The weeks: the same summary with 2…8 sessions, one short still-ish
  // take each; the edit dissolves them over the scene. Static, so ×1.
  async '07-weeks'(browser) {
    const results = [];
    for (let n = 2; n <= SESSIONS.length; n++) {
      const take = await openTake(browser, `${OUT}07-weeks/n${n}/`, { k: 1, api: API(SESSIONS.slice(0, n)) });
      const { page } = take;
      await page.goto(SUMMARY_URL);
      const phq = page.locator('trajectory-chart').filter({ hasText: 'PHQ-9' }).first();
      await phq.waitFor({ timeout: 20_000 });
      await phq.evaluate((el) => scrollTo(0, scrollY + el.getBoundingClientRect().top - 90));
      await page.waitForTimeout(600);
      await take.start();
      await take.wait(900);
      results.push(await take.stop());
    }
    return { dir: OUT + '07-weeks/', frames: results.reduce((a, r) => a + r.frames, 0), events: [] };
  },
};

// A generic phone mail client: inbox row that arrives, then the message.
function mailApp(mail) {
  const font = `${BASE}/fonts/NotoSansHebrew`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @font-face { font-family: 'Noto Sans Hebrew'; src: url(${font}-Regular.ttf); font-weight: 400; }
  @font-face { font-family: 'Noto Sans Hebrew'; src: url(${font}-Bold.ttf); font-weight: 600; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Noto Sans Hebrew', sans-serif; background: #f4f6f5; color: #162232; overflow: hidden; }
  header { height: 56px; display: flex; align-items: center; padding: 0 18px; font-size: 20px; font-weight: 600;
           background: #fff; border-bottom: 1px solid #e2e7e4; }
  .inbox { padding: 8px 0; }
  .row { display: flex; gap: 12px; padding: 14px 18px; background: #fff; border-bottom: 1px solid #edf0ee;
         transform: translateY(-110%); opacity: 0; transition: transform .45s cubic-bezier(.2,.8,.2,1), opacity .3s; }
  .arrived .row { transform: none; opacity: 1; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; background: #5aa053; color: #fff; display: grid;
            place-items: center; font-weight: 600; flex: none; }
  .from { font-weight: 600; font-size: 15px; }
  .subject { font-size: 14px; margin-top: 2px; }
  .snippet { font-size: 13px; color: #6b7c75; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 290px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #2f7fd6; align-self: center; margin-inline-start: auto; }
  .old { opacity: .55; }
  .message { position: fixed; inset: 0; background: #fff; transform: translateX(-100%);
             transition: transform .35s cubic-bezier(.2,.8,.2,1); padding: 0 20px; overflow: hidden; }
  .reading .message { transform: none; }
  .message h1 { font-size: 19px; margin: 22px 0 6px; }
  .message .meta { font-size: 13px; color: #6b7c75; border-bottom: 1px solid #e2e7e4; padding-bottom: 12px; margin-bottom: 8px; }
  .message p { font-size: 15px; line-height: 1.6; margin: 10px 0; }
  .message a { color: #1d6fc2; font-weight: 600; }
  bdi { font-weight: 600; }
</style></head><body>
<header>דואר נכנס</header>
<div class="inbox">
  <div class="row"><div class="avatar">מ</div><div><div class="from">מדד · CTR</div>
    <div class="subject">${mail.subject}</div><div class="snippet">לצפייה בסיכום המטופל</div></div><div class="dot"></div></div>
  <div class="row old" style="transform:none;opacity:.55"><div class="avatar" style="background:#9aa8a1">ר</div><div>
    <div class="from">רכזת ההכשרה</div><div class="subject">מפגש ההדרכה הבא</div><div class="snippet">תזכורת: המפגש ביום שלישי</div></div></div>
</div>
<div class="message"><h1>${mail.subject}</h1><div class="meta">מאת: מדד · CTR</div>${mail.html}</div>
<script>document.querySelector('.message a').addEventListener('click', (e) => e.preventDefault());</script>
</body></html>`;
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const scenes = wanted.length ? wanted : Object.keys(SCENE);
if (CUES.source === 'estimate') console.log('cues.json: placeholder timings (estimate), not the narration');
const browser = await launch();
try {
  for (const id of scenes) {
    if (!SCENE[id]) throw new Error(`unknown scene ${id}; known: ${Object.keys(SCENE).join(' ')}`);
    const r = await SCENE[id](browser);
    console.log(`✓ ${id}  ${r.frames} frames  ${r.events.map((e) => `${e.name}@${e.t}`).join(' ')}`);
  }
} finally {
  await browser.close();
}
