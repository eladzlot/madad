/**
 * tests/e2e/dist-smoke.dist.test.js
 *
 * Runs the production bundle served at the production base (/madad/).
 * Complements the chromium dev suite — catches the class of bugs that only
 * manifest under non-root deployment. In scope:
 *
 *   • Absolute-URL fetches that bypass Vite's `base` (e.g. the short-name
 *     config resolver returning /configs/prod/standard.json instead of
 *     /madad/configs/prod/standard.json — this is exactly the bug that
 *     shipped to production and the reason this test file exists).
 *   • Chunks, assets, fonts, or favicons referenced with absolute paths.
 *   • CSP violations (the <meta> CSP is only injected in prod builds).
 *   • Manifest / dependency graph failures specific to the production config
 *     set (dev-only configs are excluded from the build).
 *
 * Not in scope: full patient journeys, PDF generation, clinical content.
 * Those belong in the dev-server suite where they can use the synthetic
 * e2e.json config without coupling to real instrument content.
 *
 * If this file fails after a change to shipping configs, the fix is usually
 * in the config, not in this test. The only behavioural expectations here
 * are "the page loads" and "nothing 404s" — both are deployment invariants.
 */

import { test, expect } from '@playwright/test';
import { watchForBadResponses, watchForConsoleErrors } from './dist-helpers.js';

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('dist smoke — production bundle at production base', () => {
  test('patient page loads shipping config without 404s or errors', async ({ page, baseURL }) => {
    // baseURL is http://localhost:4173/madad/ (set in playwright.config.js).
    // Trim the trailing slash for the origin prefix used by the watcher.
    const origin = new URL(baseURL).origin;
    const badResponses = watchForBadResponses(page, origin);
    const consoleErrors = watchForConsoleErrors(page);

    // phq9 + standard.json — ships in every production build. The configs=
    // param uses a short name, which is the exact code path that triggered
    // the production-only "לא ניתן לטעון את השאלון" bug: the loader expanded
    // the short name to /configs/prod/standard.json (absolute, root-relative)
    // instead of /madad/configs/prod/standard.json.
    await page.goto('?items=phq9&configs=standard&pid=DISTSMOKE');

    // Welcome screen is the patient-visible signal that loadConfig succeeded.
    // It's a custom element whose internal layout may change, so we match on
    // the tag only — structural assertions belong in the dev suite.
    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });

    // The exact error text a patient would see if loadConfig throws. The
    // container is rendered into light DOM by app.js showError(), using
    // textContent — so a plain text locator works.
    const errorText = 'לא ניתן לטעון את השאלון';
    await expect(page.getByText(errorText)).toHaveCount(0);

    // Network layer: any same-origin 4xx/5xx means a path bug. This is the
    // general guard — catches this bug, future config path bugs, missing
    // chunks, absolute-path fonts, bad favicon refs, etc.
    expect(badResponses, 'Same-origin resources must all return 2xx/3xx').toEqual([]);

    // Console layer: CSP violations and uncaught runtime errors. The CSP is
    // injected only in prod builds (see vite.config.js cspPlugin), so this
    // assertion can only run here.
    //
    // Filter: some environments emit benign DevTools warnings at error level
    // (e.g. favicon hints when preview serves without a tab). Keep the match
    // strict — only block things that look like real CSP refusals or script
    // errors. Update the allowlist if a legitimate benign error appears.
    const realErrors = consoleErrors.filter(e =>
      !/favicon/i.test(e)
    );
    expect(realErrors, 'No CSP violations or runtime errors on page load').toEqual([]);
  });

  test('composer page loads manifest and all production configs without 404s', async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const badResponses = watchForBadResponses(page, origin);
    const consoleErrors = watchForConsoleErrors(page);

    await page.goto('composer/');

    // The composer bootstraps by fetching the manifest, then every config it
    // lists. composer-loader.js builds those URLs from getAppRoot() and joins
    // each manifest entry's relative URL — a code path entirely separate from
    // the patient app's loadConfig short-name expansion. A path bug could live
    // here independently of the one that produced "לא ניתן לטעון" in the
    // patient app, so this test must do more than the patient test does.
    //
    // <clinician-nav> renders only after the manifest fetch resolves and
    // composer-render.js runs. If its brand appears, JS executed without
    // erroring out and the DOM was populated — that's a real bootstrap
    // signal, not just "the HTML loaded".
    await expect(page.locator('clinician-nav .brand')).toContainText('מדד', { timeout: 10_000 });

    // The error path: composer.js writes a .c-error block into #composer-app
    // when manifest/config loading throws (see composer.js line 25). Assert
    // it's absent — covers both manifest 404s and per-config schema failures.
    await expect(page.locator('.c-error')).toHaveCount(0);

    // Wait for the manifest + all config fetches to complete before asserting
    // on the network record.
    await page.waitForLoadState('networkidle');

    expect(badResponses, 'Same-origin resources must all return 2xx/3xx').toEqual([]);

    const realErrors = consoleErrors.filter(e => !/favicon/i.test(e));
    expect(realErrors, 'No CSP violations or runtime errors on composer load').toEqual([]);
  });

  test('aggregate page loads and accepts an upload without 404s or errors', async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const badResponses = watchForBadResponses(page, origin);
    const consoleErrors = watchForConsoleErrors(page);

    await page.goto('aggregate/');

    // The upload zone rendering means the Lit entry module executed — the
    // signal that all chunks (aggregate + shared lit-element) resolved under
    // the deploy base.
    await expect(page.locator('upload-list')).toBeVisible({ timeout: 10_000 });

    // Exercise the parse path with an inline non-Madad PDF: the per-file
    // warning proves parse-pdf.js ran in the production bundle (its
    // DecompressionStream path is exactly the kind of thing a CSP or
    // bundling regression could silently break).
    await page.locator('upload-list input[type="file"]').setInputFiles({
      name: 'other.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF'),
    });
    await expect(page.locator('upload-list li.failed')).toContainText('לא דוח מדד');

    expect(badResponses, 'Same-origin resources must all return 2xx/3xx').toEqual([]);

    const realErrors = consoleErrors.filter(e => !/favicon/i.test(e));
    expect(realErrors, 'No CSP violations or runtime errors on aggregate load').toEqual([]);
  });

  test('patient page loads via the legacy full-path configs= form', async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const badResponses = watchForBadResponses(page, origin);
    const consoleErrors = watchForConsoleErrors(page);

    // The patient test above uses the short-name form (configs=standard). This
    // one exercises the LEGACY full-path form (configs=configs/prod/standard.json)
    // — a separate branch in the loader's resolveSource(). The base-path bug that
    // produced "לא ניתן לטעון" affected both branches, so both need a gate. This
    // used to be covered by clicking the landing demo CTA; now that landing is a
    // separate origin (its own artifact/domain), the coverage lives here on the
    // app side where the branch actually runs. The landing artifact's own smoke
    // test (landing-smoke.dist.test.js) verifies the CTA link is well-formed.
    await page.goto('?items=phq9&configs=configs/prod/standard.json&pid=DISTSMOKE');

    await expect(page.locator('welcome-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('לא ניתן לטעון את השאלון')).toHaveCount(0);

    expect(badResponses, 'Same-origin resources must all return 2xx/3xx').toEqual([]);

    const realErrors = consoleErrors.filter(e => !/favicon/i.test(e));
    expect(realErrors, 'No CSP violations or runtime errors on legacy-form load').toEqual([]);
  });
});
