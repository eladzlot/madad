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
  // Browser environment — app source, shared layer, clinician layer, composer
  {
    files: ['src/**/*.js', 'shared/**/*.js', 'clinician/**/*.js', 'composer/src/**/*.js', 'aggregate/src/**/*.js'],
    languageOptions: {
      // __APP_VERSION__ / __LANDING_ORIGIN__ are inlined at build time by
      // Vite/Vitest `define`.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __LANDING_ORIGIN__: 'readonly' },
    },
  },
  // Test files — both browser (happy-dom) and vitest globals
  {
    files: ['src/**/*.test.js', 'shared/**/*.test.js', 'clinician/**/*.test.js', 'aggregate/src/**/*.test.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // ── Cross-import boundary rules (docs/CODE_ORGANIZATION.md §5) ──────────────
  // Patient surface: never imports clinician-facing code.
  {
    files: ['src/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/clinician/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
      }],
    },
  },
  // Clinician surfaces: no patient code, no importing each other.
  {
    files: ['composer/**/*.js', 'aggregate/**/*.js', 'landing/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/../src/**', '../composer/**', '../aggregate/**', '../landing/**'],
      }],
    },
  },
  // clinician/: shared across clinician surfaces; no surface or patient code.
  {
    files: ['clinician/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/src/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
      }],
    },
  },
  // shared/: bottom of the dependency graph — only other shared/ modules.
  {
    files: ['shared/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/src/**', '**/clinician/**', '**/composer/**', '**/aggregate/**', '**/landing/**'],
      }],
    },
  },
  {
    rules: {
      'no-unused-vars': 'error',
    },
  },
];
