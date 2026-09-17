/**
 * tests/e2e/a11y.e2e.test.js
 *
 * Automated accessibility regression net. axe-core was a devDependency with no
 * caller for a long time; when it was first actually run against the app it
 * found six real failures, so this file exists to stop them coming back.
 *
 * What it covers:
 *   • axe-core, WCAG 2.0/2.1/2.2 level A + AA, on every distinct screen:
 *     the welcome screen, all seven item types, the results screen, and the
 *     three clinician surfaces. Lit renders into shadow DOM and axe pierces
 *     open shadow roots, so the item components really are inspected.
 *   • Both colour schemes. The dark palette is a separate token block and has
 *     historically been the one nobody looks at.
 *   • Reflow (WCAG 1.4.10) at 320px, which is what a 1280px window looks like
 *     at 400% zoom. The app is RTL, so overflow runs off the LEFT edge —
 *     comparing scrollWidth to clientWidth catches it in either direction.
 *
 * What it does NOT cover, and what still needs a human:
 *   axe checks roughly a third of WCAG. It cannot tell you whether the Hebrew
 *   reads sensibly in a screen reader, whether focus order makes sense, or
 *   whether an error message is actually understandable. Those need NVDA or
 *   VoiceOver and a person. A clean run here is a floor, not a pass.
 *
 * If this fails on a colour change, the fix is almost always in the tokens
 * (shared/styles/tokens.css) rather than in the component: see the two forms
 * of the brand colour documented there.
 */

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AXE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/axe-core/axe.min.js'
);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ITEMS =
  'item-select,item-binary,item-multiselect,item-slider,item-text,item-rated-text,item-instructions';
const PATIENT = '/?items=all_types_battery#pid=E2E0-0017';

// The built pages carry a <meta> CSP that would block an injected script tag;
// the audit needs to inject axe, so it runs with the policy bypassed.
//
// reducedMotion matters for correctness, not just speed: without it axe can
// sample a colour mid-transition and report a contrast figure for a blend
// that exists for 120ms and is nobody's actual experience. The app zeroes
// --transition-* under prefers-reduced-motion, so this pins every colour to
// its resting value — and exercises the reduced-motion path while it is there.
test.use({ bypassCSP: true, reducedMotion: 'reduce' });

// axe reads computed colour. Sampling an element that is still fading in
// yields a blend of the foreground and whatever is behind it — a figure that
// exists for 220ms and is nobody's actual experience. Settle first.
async function settle(page) {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((a) => a.playState === 'running');
    await Promise.race([
      Promise.allSettled(running.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 1000)),
    ]);
  });
}

async function violations(page) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(
    async (tags) =>
      await window.axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        resultTypes: ['violations'],
      }),
    TAGS
  );
  // Report the rule and the first failing node, so a red CI run is actionable
  // without re-running the audit locally.
  return res.violations.map(
    (v) =>
      `${v.id} (${v.nodes.length}): ${v.nodes[0]?.failureSummary?.split('\n').slice(0, 2).join(' | ')}`
  );
}

async function walkPatientFlow(page, check) {
  await page.goto(PATIENT);
  await page.locator('welcome-screen').waitFor();
  await check('welcome');

  await page.evaluate(() =>
    document.querySelector('welcome-screen').shadowRoot.querySelector('.begin-btn').click()
  );

  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const kind = await page.evaluate(
      (sel) => document.querySelector('app-shell')?.querySelector(sel)?.tagName.toLowerCase() ?? null,
      ITEMS
    );
    if (!kind) break;
    if (!seen.has(kind)) {
      await check(kind);
      seen.add(kind);
    }
    // A range input only enables its submit after a real interaction.
    const isSlider = await page.evaluate(
      (sel) => !!document.querySelector('app-shell').querySelector(sel).shadowRoot
        .querySelector('input[type=range]'),
      ITEMS
    );
    if (isSlider) {
      await page.evaluate(
        (sel) => document.querySelector('app-shell').querySelector(sel).shadowRoot
          .querySelector('input[type=range]').focus(),
        ITEMS
      );
      await page.keyboard.press('ArrowRight');
    }
    const moved = await page.evaluate((sel) => {
      const root = document.querySelector('app-shell').querySelector(sel).shadowRoot;
      const field = root.querySelector('textarea,input[type=text]');
      if (field && !field.value) {
        field.value = 'טקסט בדיקה';
        field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      const enabled = [...root.querySelectorAll('button')].filter((b) => !b.disabled);
      const target = enabled.find((b) => /המשך|הבא|סיום|שלח|Continue|Next|Finish|Send/.test(b.textContent || '')) ?? enabled[0];
      if (!target) return false;
      target.click();
      return true;
    }, ITEMS);
    if (!moved) break;
    await page.waitForTimeout(350);
  }

  // Every item type must actually have been reached — a walk that silently
  // stops after the first screen would otherwise report a clean sweep.
  expect(seen.size, `item types reached: ${[...seen].join(', ')}`).toBe(7);

  await page.locator('results-screen').waitFor();
  await check('results');
}

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test('patient journey has no WCAG A/AA violations', async ({ page }) => {
      const found = {};
      await walkPatientFlow(page, async (label) => {
        const v = await violations(page);
        if (v.length) found[label] = v;
      });
      expect(found).toEqual({});
    });

    test('clinician surfaces have no WCAG A/AA violations', async ({ page }) => {
      const found = {};
      for (const surface of ['/composer/', '/aggregate/', '/help/']) {
        await page.goto(surface);
        await page.waitForLoadState('networkidle');
        const v = await violations(page);
        if (v.length) found[surface] = v;
      }
      expect(found).toEqual({});
    });
  });
}

test('every surface reflows at 320px without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1024 });
  const overflowing = {};
  for (const [label, url] of [
    ['patient', PATIENT],
    ['composer', '/composer/'],
    ['aggregate', '/aggregate/'],
    ['help', '/help/'],
  ]) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
    if (overflow > 1) overflowing[label] = `${overflow}px`;
  }
  expect(overflowing).toEqual({});
});
