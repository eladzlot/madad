import { describe, it, expect } from 'vitest';
import { isSafePattern, unsafePatternReason, MAX_PATTERN_LENGTH } from './safe-pattern.js';

describe('safe-pattern', () => {
  it.each([
    ['^[0-9]{3}-[0-9]{4}$', 'a literal phone shape'],
    ['^\\d+$', 'digits'],
    ['^[א-ת ]+$', 'Hebrew letters'],
    ['', 'the empty pattern'],
  ])('accepts %s (%s)', (pattern) => {
    expect(isSafePattern(pattern)).toBe(true);
    expect(unsafePatternReason(pattern)).toBeNull();
  });

  // Each of these freezes the tab on a crafted input: JS cannot time out or
  // abort a running match, so refusing the shape up front is the only defence.
  it.each([
    ['nested quantifier',    '^(a+)+$'],
    ['nested star-plus',     '^(a*)+$'],
    ['adjacent groups',      '^(a)+(b)+$'],
    ['quantified alternation', '^(a|a)+$'],
    ['overlapping branches', '^(a|ab)*$'],
  ])('rejects %s (%s)', (_label, pattern) => {
    expect(isSafePattern(pattern)).toBe(false);
    expect(unsafePatternReason(pattern)).toEqual(expect.any(String));
  });

  it('rejects a pattern longer than the cap', () => {
    expect(isSafePattern('a'.repeat(MAX_PATTERN_LENGTH + 1))).toBe(false);
  });

  it('rejects a malformed regex rather than letting it throw at use', () => {
    expect(isSafePattern('(')).toBe(false);
    expect(unsafePatternReason('(')).toMatch(/not a valid regular expression/);
  });

  it('rejects a non-string', () => {
    expect(isSafePattern(undefined)).toBe(false);
    expect(isSafePattern(/a/)).toBe(false);
  });

  // The guard's whole purpose: the rejected shapes stay cheap because they are
  // never run. This pins that the classic case is caught rather than executed —
  // the same expression against 30 characters runs for over a minute.
  it('refuses the catastrophic case in constant time', () => {
    const started = Date.now();
    expect(isSafePattern('^(a|a)+$')).toBe(false);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
