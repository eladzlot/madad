import { describe, it, expect } from 'vitest';
import { PID_PATTERN, sanitizePid, pidWarning } from './pid.js';

describe('PID_PATTERN', () => {
  it('accepts ASCII letters, digits, hyphen, underscore', () => {
    expect(PID_PATTERN.test('TRC-2025_000123')).toBe(true);
  });

  it('accepts Hebrew letters', () => {
    expect(PID_PATTERN.test('מטופל-1')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(PID_PATTERN.test('')).toBe(false);
  });

  it('rejects strings over 64 characters', () => {
    expect(PID_PATTERN.test('a'.repeat(65))).toBe(false);
  });

  it('accepts strings of exactly 64 characters', () => {
    expect(PID_PATTERN.test('a'.repeat(64))).toBe(true);
  });

  it('rejects spaces', () => {
    expect(PID_PATTERN.test('foo bar')).toBe(false);
  });

  it('rejects punctuation other than hyphen and underscore', () => {
    expect(PID_PATTERN.test('foo.bar')).toBe(false);
    expect(PID_PATTERN.test('foo@bar')).toBe(false);
    expect(PID_PATTERN.test('<script>')).toBe(false);
  });
});

describe('sanitizePid', () => {
  it('returns null for null input', () => {
    expect(sanitizePid(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(sanitizePid(undefined)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(sanitizePid('')).toBe(null);
  });

  it('returns the value when valid', () => {
    expect(sanitizePid('TRC-2025-000123')).toBe('TRC-2025-000123');
  });

  it('returns null for over-length input (silent rejection)', () => {
    expect(sanitizePid('a'.repeat(65))).toBe(null);
  });

  it('returns null for invalid characters (silent rejection)', () => {
    expect(sanitizePid('foo<script>')).toBe(null);
  });
});

describe('pidWarning', () => {
  it('returns null for empty input', () => {
    expect(pidWarning('')).toBe(null);
    expect(pidWarning(null)).toBe(null);
    expect(pidWarning(undefined)).toBe(null);
  });

  it('returns null for valid PIDs', () => {
    expect(pidWarning('TRC-2025-000123')).toBe(null);
    expect(pidWarning('מטופל_1')).toBe(null);
  });

  it('returns a length-specific message for over-length PIDs', () => {
    const msg = pidWarning('a'.repeat(65));
    expect(msg).toMatch(/64/);
  });

  it('returns a character-specific message for invalid characters', () => {
    const msg = pidWarning('foo bar');
    expect(msg).toMatch(/אותיות|תווים/);
  });

  // Regression: composer used to allow over-length PIDs without warning, while
  // the patient app silently dropped them. The shared helper must now warn in
  // both cases.
  it('warns about over-length PIDs (composer-vs-app consistency)', () => {
    expect(pidWarning('a'.repeat(100))).not.toBe(null);
  });
});
