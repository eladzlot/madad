import { defineConfig } from 'vite';

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

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/madad/',
  build: {
    chunkSizeWarningLimit: 1100, // pdf-vendor (pdfmake) is lazy-loaded; real budget enforced by scripts/check-size.mjs
    rollupOptions: {
      input: {
        main:     'index.html',
        composer: 'composer/index.html',
        landing:  'landing/index.html',
      },
      output: {
        manualChunks: {
          'pdf-vendor': ['pdfmake', 'bidi-js'],
        },
      },
    },
  },
  assetsInclude: ['**/*.ttf'],
  plugins: mode !== 'development' ? [cspPlugin()] : [],
}));
