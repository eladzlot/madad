import { vi, beforeAll, afterAll } from 'vitest';

// Suppress @open-wc/semantic-dom-diff DEP0151 deprecation noise.
// This is a known issue in @open-wc's own dependency tree, not our code.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.code === 'DEP0151') return;
  console.warn(warning);
});

// Suppress console output during test runs.
// Tests that want to assert on console calls should use vi.spyOn locally,
// which takes precedence over these mocks (as the alerts tests already do).
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});
