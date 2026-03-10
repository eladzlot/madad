import { vi, beforeAll, afterAll } from 'vitest';

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
