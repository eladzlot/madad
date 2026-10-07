# Response to the October 2026 security scans of ctrmadad.com

Two scans covered the Madad remote trial (ctrmadad.com):

- **Faze Security**: automated penetration test of the live site, 2026-10-06. 4 findings: 1 Medium, 1 Low, 2 Informative.
- **Checkmarx 9.7.7 (MOH SAST)**: static scan of the source (scan 1020487, project 510), 2026-10-06. 20 results, all "To Verify": 1 High, 6 Medium, 13 Low.

Every finding below was checked against the source and against live responses from the site.

**Summary.** No finding exposes patient data or gives access to anything that isn't already public.
- **Fixed:** three hygiene items (F1, F2 and F4). One static-analysis path (SSRF) was hardened as well, although it was not exploitable.
- **Not exploitable:** all remaining Checkmarx results. The reason for each is given below, so they can be marked "Not Exploitable".

## Background: what the system does and does not hold

- **The site:** it is static HTML/JS served by Cloudflare Pages. Clinical questionnaires run entirely in the patient's browser.
- **The API (`/api/v1/*`):** it accepts a submission keyed by a pseudonymous study ID (uid), and it serves those submissions back through HMAC-signed, time-limited therapist links.
- **What is never stored:** names, free text, or any account or password.
- **What the database holds:** the therapist email registry (uid → therapist email).
- **The data:** it lives in a Cloudflare D1 database pinned to the EU jurisdiction.
- **Headers on every response:**
  - a Content-Security-Policy (`script-src 'self'; connect-src 'self'; frame-ancestors 'none'; …`)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - HSTS (`max-age=63072000; includeSubDomains; preload`)
  - since this fix, a Permissions-Policy

## Faze Security findings

| # | Finding | Status | Explanation |
|---|---|---|---|
| 1 | Wildcard Origin (Medium) | **Fixed** | Cloudflare Pages adds `Access-Control-Allow-Origin: *` to static files by default. It was never sent on the API: `/api/v1/*` returns no CORS headers, and credentialed cross-origin reads were never allowed. A hostile page could therefore read only public JS/HTML. The default header is now removed (`! Access-Control-Allow-Origin` in `public/_headers`). |
| 2 | Permissions-Policy not implemented (Low) | **Fixed** | Added. It denies camera, microphone, geolocation, payment, USB, serial, HID, MIDI, motion sensors, display capture and Topics. Clipboard and Web Share stay allowed because the app uses them. |
| 3 | Content Type not specified (Informative) | **Not applicable** | `/composer` is a bodiless `308` redirect to `/composer/`. The target page sends `Content-Type: text/html; charset=utf-8`, and `nosniff` is set on every response. |
| 4 | Possible Secret Key (Informative) | **Not a secret. Script removed.** | `de00f9de…` is the public site token of Cloudflare Web Analytics. Cloudflare's edge inserts it into HTML pages, and it is public by design. Our CSP (`script-src 'self'`) already blocked the injected script, so it never ran. Web Analytics injection is now turned off for the zone. It appeared under `.js` URLs because unknown paths fall back to the HTML page. |

## Checkmarx findings

| Query | Sev. | Location | Status | Explanation |
|---|---|---|---|---|
| SSRF | High | `server/lib/runtime.js` 14→22 | **Hardened; not exploitable** | The "request" is `env.ASSETS.fetch`, which reads a static file from this same deployment. It makes no network call, and no host can be chosen. The `id` was already restricted to `^[a-z0-9_]+$`. The URL is now built from a constant base instead of the request's origin, which removes the flagged data flow. |
| Unchecked Input For Loop Condition ×4 | Medium | `scripts/validate-configs.mjs`, `shared/config/*`, `src/app.js` → `shared/config/loader.js` | Not exploitable | Paths 1 and 3 are build-time developer scripts that read files from the repository. They never run on the server or for users. Paths 2 and 4 are the browser config loader. Its walk is bounded by a visited set and an allow-list of origins, so a crafted URL can at most slow the visitor's own tab. |
| Missing HSTS Header | Medium | `aggregate/src/remote/fetch-sessions.js` 34 | Not exploitable | HSTS is sent on every response at the HTTP layer (`max-age=63072000; includeSubDomains; preload`). The flagged line is a client-side `fetch` and cannot set response headers. |
| ReDoS From Regex Injection | Medium | `shared/safe-pattern.test.js` 47 | Not exploitable | `^(a|a)+$` is a unit-test fixture. It proves that our ReDoS guard (`shared/safe-pattern.js`) *rejects* catastrophic patterns. The flagged code is the mitigation itself. |
| Secret Leak in Error Messages ×4 | Low | `src/resolve-items.js`, `composer/src/composer-loader.js` | Not exploitable | The "token" is a public questionnaire ID taken from the URL (e.g. `phq9`), not a credential. In the composer case the message contains an HTTP status code. |
| Privacy Violation in Logs ×3 | Low | `server/lib/runtime.js` 38 | Not exploitable | `onEmailFailure` receives only `{ uid, reason }` (`server/lib/handlers.js` 57): the pseudonymous study ID and a status code. Email addresses are never passed to it or logged. |
| PCI Data Exposure in Logs | Low | `server/lib/runtime.js` 38 | Not exploitable | Same call as above. The Cloudflare account ID is not passed to the logger, and the system handles no payment data. |
| Use of Insufficiently Random Values ×2 | Low | `aggregate/src/parse-pdf.test.js` 160, `src/engine/sequence-runner.js` 128 | Not exploitable | The first is random garbage bytes in a unit test. The second randomizes questionnaire *display order*. Neither is a secret, an identifier or a token. Therapist links are signed with HMAC-SHA-256 and a server-side secret. |
| Privacy Violation in Error Messages | Low | `scripts/remote/mint-uids.mjs` 40 | Accepted | An offline administrator script that prints a malformed email back to the operator's own terminal while importing the registry. It is not deployed. |
| Potential Clickjacking on Legacy Browsers | Low | `aggregate/index.html` | Mitigated | Every path is served with `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. Frame-busting scripts only matter for browsers that support neither (pre-2013). |

## Email authentication

The trial sends two kinds of notification email from `madad@ctrmadad.com` through Cloudflare Email Service. Neither contains clinical content or an instrument name. On a production test on 2026-10-07:

- **SPF: pass.** Cloudflare's sending IP is authorised for the bounce domain `cf-bounce.ctrmadad.com`, aligned with the From domain.
- **DMARC: pass**, through the aligned SPF result. The published policy is `p=reject`.
- **DKIM:**
  - Messages are signed with `d=ctrmadad.com` (selector `cf-bounce`), aligned with From. The header signature verified against the published key.
  - The body-hash check could not be confirmed. The test inbox (a disposable mail.tm address) returns a re-encoded body, and Cloudflare's own second signature (`d=cloudflare-smtp.org`) failed the same check in the same way. That points to the test inbox, not to signing.
  - DMARC passes on SPF regardless. A check through an inbox that records `Authentication-Results` would close this.

## Verification after the fixes

Run against production on 2026-10-07, after the deploy:

- **CORS:** no `Access-Control-Allow-Origin` on any path (pages, static assets, API, `OPTIONS` preflight), even when a foreign `Origin` is sent.
- **Permissions-Policy:** present on every response. CSP, `X-Frame-Options`, `Referrer-Policy` and HSTS are unchanged.
- **Analytics script:** the Cloudflare Web Analytics script is no longer present in any page.
- **Full patient-to-clinician round trip:** completed in production with a test ID. The submission was accepted, the hardened config lookup passed, and the clinician link opened the results. The stored record is byte-identical to what the browser sent.

To repeat the header checks:

```bash
curl -sI -H "Origin: https://attacker.com" https://ctrmadad.com/          # no access-control-allow-origin; permissions-policy present
curl -sI -H "Origin: https://attacker.com" https://ctrmadad.com/composer/ # same
curl -s  -A "Mozilla/5.0" https://ctrmadad.com/composer/ | grep -c cloudflareinsights   # 0
```

A Faze re-scan is requested to update the "Fixed" column.
