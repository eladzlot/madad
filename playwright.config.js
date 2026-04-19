import { defineConfig, devices } from '@playwright/test';

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
    // production base path (/madad/). Catches bugs that only manifest under
    // non-root deployment: missing asset paths, absolute-URL fetches that
    // bypass Vite's base, CSP violations that only fire in production, etc.
    //
    // This is what catches the class of "works on dev, broken on dist" bugs
    // that unit tests and the dev e2e suite cannot see.
    {
      name: 'dist-smoke',
      testMatch: /\.dist\.test\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173/madad/',
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
      // vite preview serves dist/ at the production base (/madad/).
      // This must run after `npm run build` — the CI workflow enforces this
      // ordering; locally, run `npm run build` before invoking the dist suite.
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/madad/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
