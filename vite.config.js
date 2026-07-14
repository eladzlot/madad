import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { cspPlugin, crossOriginLinksPlugin } from './vite.shared.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// This config builds the app surfaces (patient / composer / aggregate) to dist/,
// deployed to app.ezmadad.com. The landing surface builds separately to
// dist-landing/ — see vite.landing.config.js. crossOriginLinksPlugin stays here
// so `npm run dev` still serves a working /landing/ (dev serves any HTML on
// disk, regardless of build inputs).
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
        // landing/ builds separately → dist-landing/ (vite.landing.config.js).
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
