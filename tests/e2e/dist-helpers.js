/**
 * tests/e2e/dist-helpers.js
 *
 * Shared watchers for the dist-smoke suites (app at :4173, landing at :4174).
 * Both surfaces assert the same deployment invariants — "nothing 404s" and "no
 * CSP violations or runtime errors" — so the watchers live here as one source
 * of truth.
 */

// Attaches to a page and records every same-origin response with status ≥ 400,
// plus outright request failures. Cross-origin responses are ignored — browser
// extensions, analytics from other pages, cross-origin navigations, etc.
export function watchForBadResponses(page, origin) {
  const failures = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(origin)) return;
    if (res.status() >= 400) failures.push(`${res.status()} ${url}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.startsWith(origin)) return;
    failures.push(`FAILED ${url} (${req.failure()?.errorText ?? 'unknown'})`);
  });
  return failures;
}

// Console-error watcher — CSP violations surface here as "Refused to …".
export function watchForConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}
