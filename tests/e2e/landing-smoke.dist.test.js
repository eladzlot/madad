/**
 * tests/e2e/landing-smoke.dist.test.js
 *
 * Smoke test for the landing artifact (dist-landing/), served at its own domain
 * root — a separate origin from the app (see vite.landing.config.js). Runs in
 * the `landing-smoke` Playwright project against the dist-landing preview at
 * http://localhost:4174/.
 *
 * Landing is a static page: HTML + inline CSS + fonts, no module-loaded JS, no
 * fetched configs. The invariants that matter under a real deploy:
 *
 *   • It renders (hero headline present — no JS required).
 *   • Its own assets load without 404 — the base-absolute font path (/fonts/…)
 *     and the hashed favicon (/assets/…). This is the gate for the Stage 3/4
 *     "landing at a domain root" work: if the font or favicon path were wrong,
 *     it would 404 here.
 *   • No CSP violations (the <meta> CSP is injected only in prod builds).
 *   • The app-bound CTA link is present and well-formed.
 *
 * NOT in scope: clicking the CTA through to the patient app. That link now
 * points at a different origin (app.ezmadad.com in prod, or a root-absolute
 * same-origin path when APP_ORIGIN is unset in local/CI builds), so the
 * click-through is not a landing-artifact concern. The patient side of that
 * flow — the items-only URL form — is covered in dist-smoke.dist.test.js.
 */

import { test, expect } from '@playwright/test';
import { watchForBadResponses, watchForConsoleErrors } from './dist-helpers.js';

test.describe('landing smoke — marketing artifact at its domain root', () => {
  test('landing renders with its fonts and favicon, no 404s or CSP errors', async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const badResponses = watchForBadResponses(page, origin);
    const consoleErrors = watchForConsoleErrors(page);

    await page.goto('/');

    // Hero headline — the server-rendered signal that the page loaded.
    await expect(page.locator('.hero-headline').first()).toBeVisible({ timeout: 10_000 });

    // The demo CTA points at the patient app with the items-only form.
    // Assert only that it exists and is well-formed — its origin varies by build
    // (absolute app origin in prod, root-absolute when APP_ORIGIN is unset).
    const demoLink = page.locator('a[href*="items=phq9"]').first();
    await expect(demoLink).toBeVisible();

    // Fonts + favicon must resolve. Wait for the network to settle so a late
    // font 404 is caught.
    await page.waitForLoadState('networkidle');

    expect(badResponses, 'Same-origin resources (fonts, favicon) must all return 2xx/3xx').toEqual([]);

    const realErrors = consoleErrors.filter(e => !/favicon/i.test(e));
    expect(realErrors, 'No CSP violations or runtime errors on landing load').toEqual([]);
  });
});
