import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.ttf'],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    environmentOptions: {
      happyDOM: { settings: { disableJavaScriptFileLoading: true } },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/app.js', 'src/router.js', 'src/**/*.test.js'],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
      },
    },
  },
});
