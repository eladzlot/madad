import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js', 'composer/src/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    environmentOptions: {
      happyDOM: { settings: { disableJavaScriptFileLoading: true } },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'composer/src/**/*.js'],
      exclude: ['src/app.js', 'src/router.js', 'src/**/*.test.js', 'composer/src/**/*.test.js', 'src/config/validate-schema.js', 'composer/src/composer.js', 'composer/src/composer-render.js'],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
      },
    },
  },
});
