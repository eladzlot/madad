import { defineConfig } from 'vite';
import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { cspPlugin, crossOriginLinksPlugin } from './vite.shared.js';

// Builds the landing (marketing) surface on its own, because it deploys to a
// different domain root (ezmadad.com) than the app (app.ezmadad.com). `root:
// 'landing'` makes landing/index.html the artifact's root index.html rather
// than dist-landing/landing/index.html. See docs/CLOUDFLARE_MIGRATION.md Stage 4.

const abs = (p) => fileURLToPath(new URL(p, import.meta.url));

// Copies the two runtime assets landing needs at its artifact root but that Vite
// doesn't manage: the @font-face fonts (referenced base-absolute as /fonts/…)
// and the OG image (an absolute-URL <meta>, so Vite never sees it). publicDir is
// off, so the app-only public/ payload (configs, composer, og-image-app) stays
// out of the marketing artifact.
function landingAssetsPlugin() {
  return {
    name: 'landing-assets',
    closeBundle() {
      cpSync(abs('public/fonts'), abs('dist-landing/fonts'), { recursive: true });
      cpSync(abs('public/og-image.png'), abs('dist-landing/og-image.png'));
      // Security response headers — publicDir is off, so public/_headers is not
      // copied automatically. Landing shares the app's policy (see the file).
      cpSync(abs('public/_headers'), abs('dist-landing/_headers'));
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: 'landing',
  base: '/',          // landing owns its domain root — no base matrix applies
  publicDir: false,   // curated assets only, via landingAssetsPlugin
  build: {
    outDir: abs('dist-landing'),
    emptyOutDir: true, // outDir is outside root; Vite requires this to clean it
  },
  plugins: [
    crossOriginLinksPlugin(),
    landingAssetsPlugin(),
    ...(mode !== 'development' ? [cspPlugin()] : []),
  ],
}));
