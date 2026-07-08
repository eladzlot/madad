import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Injects a Content-Security-Policy <meta> tag into every HTML page at build time.
// Not applied in dev mode — Vite's HMR client requires inline scripts and ws: connections
// that would be blocked by this policy during development.
function cspPlugin() {
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

// Rewrites the landing page's app-bound links — marked with the `__APP_ORIGIN__`
// token in landing/index.html — to the app's origin when APP_ORIGIN is set (used
// once landing and the app live on separate domains). Empty ⇒ '..', which
// reproduces the original relative links: base-path-agnostic and correct on any
// single-origin deploy (dev, GitHub Pages at /madad/). Unlike cspPlugin this
// runs in every mode, so the dev server never serves the raw token.
function crossOriginLinksPlugin() {
  const appRef = process.env.APP_ORIGIN || '..';
  return {
    name: 'cross-origin-links',
    transformIndexHtml(html) {
      return html.replaceAll('__APP_ORIGIN__', appRef);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Base path for all built assets and runtime URLs.
  //   • dev:        '/'         — Vite dev server always serves at root
  //   • prod:       '/'         — Cloudflare Pages serves at the domain root
  //                              (ezmadad.com / app.ezmadad.com). Was '/madad/'
  //                              under GitHub Pages; flipped in migration Stage 2.
  //   • CI matrix:  process.env.MADAD_BASE — lets the dist-smoke job rebuild
  //                 under '/', '/some/deep/path/', etc., to verify nothing in
  //                 the bundle has hardcoded a base assumption. Must start and
  //                 end with '/'.
  base: mode === 'development'
    ? '/'
    : (process.env.MADAD_BASE || '/'),
  define: {
    // Recorded in the PDF's embedded data.json envelope (forensic only).
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Landing origin for the clinician-nav brand link. Empty ⇒ the relative
    // '../landing/' fallback (single-origin / GitHub Pages behaviour). Set to
    // e.g. 'https://ezmadad.com' once landing lives on its own domain.
    __LANDING_ORIGIN__: JSON.stringify(process.env.LANDING_ORIGIN || ''),
  },
  build: {
    chunkSizeWarningLimit: 1100, // pdf-vendor (pdfmake) is lazy-loaded; real budget enforced by scripts/check-size.mjs
    rollupOptions: {
      input: {
        main:      'index.html',
        composer:  'composer/index.html',
        aggregate: 'aggregate/index.html',
        landing:   'landing/index.html',
      },
      output: {
        manualChunks: {
          'pdf-vendor': ['pdfmake', 'bidi-js'],
        },
      },
    },
  },
  assetsInclude: ['**/*.ttf'],
  plugins: [
    crossOriginLinksPlugin(),
    ...(mode !== 'development' ? [cspPlugin()] : []),
  ],
}));
