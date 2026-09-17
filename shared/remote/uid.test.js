import { describe, it, expect } from 'vitest';
import {
  UID_ALPHABET, UID_PATTERN, normalizeUid, checkSymbol, isValidUid, formatUid,
  generateUid, uidWarning,
} from './uid.js';

// Deterministic byte source for generateUid.
const bytesOf = (...vals) => () => Uint8Array.from(vals);

describe('normalizeUid', () => {
  it('uppercases, strips hyphens and whitespace, folds I/L/O', () => {
    expect(normalizeUid(' ab1i-l0o9 ')).toBe('AB111009');
  });
  it('returns empty string for non-strings', () => {
    expect(normalizeUid(null)).toBe('');
    expect(normalizeUid(42)).toBe('');
  });
});

describe('checkSymbol', () => {
  it('is deterministic and in the alphabet', () => {
    const c = checkSymbol('0000000');
    expect(c).toBe('0');
    expect(UID_ALPHABET).toContain(checkSymbol('ABCDEFG'));
  });
  it('changes on any single-symbol substitution', () => {
    const body = 'M7Q3ZP1';
    const ref = checkSymbol(body);
    for (let i = 0; i < body.length; i++) {
      for (const c of UID_ALPHABET) {
        if (c === body[i]) continue;
        const mutated = body.slice(0, i) + c + body.slice(i + 1);
        expect(checkSymbol(mutated)).not.toBe(ref);
      }
    }
  });
});

describe('isValidUid / formatUid', () => {
  const good = generateUid(bytesOf(1, 2, 3, 4, 5, 6, 7));

  it('accepts a minted uid in any spelling', () => {
    expect(isValidUid(good)).toBe(true);
    expect(isValidUid(good.toLowerCase())).toBe(true);
    expect(isValidUid(good.replace('-', ''))).toBe(true);
    expect(isValidUid(` ${good} `)).toBe(true);
  });

  it('rejects wrong length, foreign characters and a bad check symbol', () => {
    expect(isValidUid('')).toBe(false);
    expect(isValidUid('ABCD-EFG')).toBe(false);
    expect(isValidUid('ABCD-EFGH-1')).toBe(false);
    expect(isValidUid('ABCU-EFGH')).toBe(false);          // U is not in the alphabet
    const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    expect(isValidUid(bad)).toBe(false);
  });

  it('formatUid canonicalises and returns null for invalid input', () => {
    expect(formatUid(good.toLowerCase().replace('-', ''))).toBe(good);
    expect(formatUid('nope')).toBeNull();
    expect(good).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('UID_PATTERN matches the display shape loosely', () => {
    expect(UID_PATTERN.test(good)).toBe(true);
    expect(UID_PATTERN.test(good.replace('-', ''))).toBe(true);
    expect(UID_PATTERN.test('ABCD-EFGI')).toBe(false);   // I excluded from the strict shape
  });
});

describe('generateUid', () => {
  it('uses only the low five bits of each byte', () => {
    expect(generateUid(bytesOf(0, 0, 0, 0, 0, 0, 0))).toBe('0000-0000');
    expect(generateUid(bytesOf(255, 255, 255, 255, 255, 255, 255))).toMatch(/^ZZZZ-ZZZ/);
  });
  it('mints valid uids from the default random source', () => {
    for (let i = 0; i < 50; i++) expect(isValidUid(generateUid())).toBe(true);
  });
});

describe('uidWarning', () => {
  const good = generateUid(bytesOf(9, 8, 7, 6, 5, 4, 3));
  it('is silent for empty and for a valid uid', () => {
    expect(uidWarning('')).toBeNull();
    expect(uidWarning('   ')).toBeNull();
    expect(uidWarning(good)).toBeNull();
  });
  it('distinguishes shape errors from typo errors', () => {
    // Codes, not sentences: the clinician surfaces are translated now, so the
    // wording lives in clinician/i18n and this module stays presentation-free.
    expect(uidWarning('ABC')).toBe('shape');
    const typo = good.slice(0, 2) + (good[2] === 'A' ? 'B' : 'A') + good.slice(3);
    expect(uidWarning(typo)).toBe('checksum');
    expect(uidWarning(good)).toBeNull();
    expect(uidWarning('')).toBeNull();
  });
});
