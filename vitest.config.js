import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js', 'shared/**/*.test.js', 'clinician/**/*.test.js', 'composer/src/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    environmentOptions: {
      happyDOM: { settings: { disableJavaScriptFileLoading: true } },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'shared/**/*.js', 'clinician/**/*.js', 'composer/src/**/*.js'],
      exclude: ['src/app.js', 'src/router.js', 'src/**/*.test.js', 'shared/**/*.test.js', 'clinician/**/*.test.js', 'composer/src/**/*.test.js', 'shared/config/validate-schema.js', 'composer/src/composer.js', 'composer/src/composer-render.js'],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
      },
    },
  },
});
