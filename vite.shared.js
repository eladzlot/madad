// Vite plugins shared by the app build (vite.config.js) and the landing build
// (vite.landing.config.js). The two surfaces build separately because they
// deploy to different domains — app.ezmadad.com and ezmadad.com — but the CSP
// policy and the landing URL rewrites must stay identical, so they live here as
// one source of truth. See docs/CLOUDFLARE_MIGRATION.md.

// Injects a Content-Security-Policy <meta> tag into every built HTML page.
// Not applied in dev — Vite's HMR client needs inline scripts / ws: connections
// that this policy would block.
export function cspPlugin() {
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",  // Lit uses adoptedStyleSheets
    "font-src 'self' blob:",              // pdfmake loads fonts via blob: URLs
    "worker-src blob:",                   // pdfmake may use blob: workers
    "connect-src 'self'",                 // config fetches are same-origin by default
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  return {
    name: 'inject-csp',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  };
}

// Landing-page URL rewrites (only landing/index.html carries the markers),
// applied in every mode so the dev server never serves a raw token. Both
// configs include it: the app config so `npm run dev` still serves a working
// /landing/, the landing config for the real build.
//
//  1. App-bound links carry an `__APP_ORIGIN__` token, replaced with the app's
//     origin (process.env.APP_ORIGIN). Empty ⇒ '' ⇒ root-absolute same-origin
//     links (`/composer/`) — the sensible fallback for local builds and dev;
//     production sets it to https://app.ezmadad.com. Landing now lives at a
//     domain root, so the earlier relative `..` fallback would point above
//     root — hence '' rather than '..'.
//
//  2. The @font-face `url('../fonts/…')` lives in an inline <style>, which Vite
//     does NOT rewrite. `../fonts/` only resolves while landing sits below root
//     (/landing/, as under the dev server); it breaks at a domain root.
//     Rewriting to the base-absolute `${base}fonts/` is depth-independent.
export function crossOriginLinksPlugin() {
  const appRef = process.env.APP_ORIGIN || '';
  let base = '/';
  return {
    name: 'cross-origin-links',
    configResolved(config) { base = config.base; }, // always ends with '/'
    transformIndexHtml(html) {
      return html
        .replaceAll('__APP_ORIGIN__', appRef)
        .replaceAll('../fonts/', `${base}fonts/`);
    },
  };
}
