import { describe, it, expect } from 'vitest';
import { loadRecentUids, rememberUid, forgetUid, STORAGE_KEY, MAX_REMEMBERED } from './uid-memory.js';
import { generateUid } from './uid.js';

function memStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}
// Distinct for every n < 1024 (only the low five bits of each byte are used).
const mint = (n) => generateUid(() => Uint8Array.from([n % 32, Math.floor(n / 32) % 32, 1, 2, 3, 4, 5]));

describe('uid memory', () => {
  it('starts empty and survives missing or corrupt storage', () => {
    expect(loadRecentUids(memStorage())).toEqual([]);
    expect(loadRecentUids(null)).toEqual([]);
    expect(loadRecentUids(memStorage({ [STORAGE_KEY]: '{not json' }))).toEqual([]);
    expect(loadRecentUids(memStorage({ [STORAGE_KEY]: '["junk", 5]' }))).toEqual([]);
  });

  it('remembers canonical spellings, most recent first, without duplicates', () => {
    const s = memStorage();
    const a = mint(1), b = mint(2);
    rememberUid(a.toLowerCase().replace('-', ''), s);
    rememberUid(b, s);
    expect(loadRecentUids(s)).toEqual([b, a]);
    rememberUid(a, s);
    expect(loadRecentUids(s)).toEqual([a, b]);
  });

  it('ignores invalid uids and caps the list', () => {
    const s = memStorage();
    expect(rememberUid('nope', s)).toEqual([]);
    for (let i = 0; i < MAX_REMEMBERED + 5; i++) rememberUid(mint(i), s);
    expect(loadRecentUids(s)).toHaveLength(MAX_REMEMBERED);
  });

  it('forgets a uid', () => {
    const s = memStorage();
    const a = mint(7);
    rememberUid(a, s);
    expect(forgetUid(a, s)).toEqual([]);
  });
});
