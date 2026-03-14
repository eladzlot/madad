import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  // Node environment — scripts and test setup files
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'tests/setup*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Browser environment — app source and composer
  {
    files: ['src/**/*.js', 'composer/src/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Test files — both browser (happy-dom) and vitest globals
  {
    files: ['src/**/*.test.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    rules: {
      'no-unused-vars': 'error',
    },
  },
];
