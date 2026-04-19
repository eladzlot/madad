import { defineConfig, devices } from '@playwright/test';

// The base path the dist-smoke project tests against. Defaults to the
// production base (/madad/) and overridable via env var to support the CI
// multi-base matrix. Must match the base the dist/ was built with — vite.config.js
// reads the same env var so a single MADAD_BASE controls build + serve + test.
const DIST_BASE = process.env.MADAD_BASE || '/madad/';
const DIST_BASE_URL = `http://localhost:4173${DIST_BASE}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',

  projects: [
    // Dev-server suite — exercises the full patient journey against the
    // unbuilt source via Vite's dev server. Uses the dev-only e2e.json config.
    {
      name: 'chromium',
      testMatch: /^(?!.*\.dist\.test\.js$).*\.e2e\.test\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
      },
    },
    // webkit is excluded from CI — run locally only
    ...(!process.env.CI ? [{
      name: 'mobile-safari',
      testMatch: /^(?!.*\.dist\.test\.js$).*\.e2e\.test\.js$/,
      use: {
        ...devices['iPhone 14'],
        baseURL: 'http://localhost:5173',
      },
    }] : []),

    // Dist smoke suite — runs against the actual built bundle served at the
    // production base path (default /madad/, overridable via MADAD_BASE).
    // Catches bugs that only manifest under non-root deployment: missing
    // asset paths, absolute-URL fetches that bypass Vite's base, CSP
    // violations that only fire in production, etc.
    //
    // This is what catches the class of "works on dev, broken on dist" bugs
    // that unit tests and the dev e2e suite cannot see.
    {
      name: 'dist-smoke',
      testMatch: /\.dist\.test\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DIST_BASE_URL,
      },
    },
  ],

  webServer: [
    {
      command: 'npm run dev -- --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // vite preview serves dist/ at the base it was built with. The --base
      // flag here keeps preview consistent with what the bundle expects when
      // the CI matrix rebuilds at a non-default base.
      command: `npx vite preview --port 4173 --strictPort --base=${DIST_BASE}`,
      url: DIST_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
