import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
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
