import { describe, it, expect } from 'vitest';
import { loadProfile, saveProfile, normalizeProfile, PROFILE_KEY } from './composer-profile.js';

// A minimal in-memory Storage stand-in so tests never touch real localStorage.
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

describe('normalizeProfile', () => {
  it('keeps only string ids in added/removed', () => {
    expect(normalizeProfile({ added: ['a', 1, null, 'b'], removed: ['c', {}] }))
      .toEqual({ added: ['a', 'b'], removed: ['c'] });
  });

  it('collapses garbage shapes to an empty overlay', () => {
    expect(normalizeProfile(null)).toEqual({ added: [], removed: [] });
    expect(normalizeProfile('nope')).toEqual({ added: [], removed: [] });
    expect(normalizeProfile({ added: 'x' })).toEqual({ added: [], removed: [] });
  });
});

describe('loadProfile', () => {
  it('returns an empty overlay when nothing is stored', () => {
    expect(loadProfile(memStorage())).toEqual({ added: [], removed: [] });
  });

  it('reads and normalizes a stored overlay', () => {
    const s = memStorage({ [PROFILE_KEY]: JSON.stringify({ v: 1, added: ['phq9'], removed: ['bdi'] }) });
    expect(loadProfile(s)).toEqual({ added: ['phq9'], removed: ['bdi'] });
  });

  it('returns empty overlay on corrupt JSON (never throws)', () => {
    const s = memStorage({ [PROFILE_KEY]: '{not json' });
    expect(loadProfile(s)).toEqual({ added: [], removed: [] });
  });

  it('returns empty overlay when storage is unavailable', () => {
    expect(loadProfile(null)).toEqual({ added: [], removed: [] });
  });

  it('does not throw when getItem itself throws', () => {
    const hostile = { getItem: () => { throw new Error('blocked'); } };
    expect(loadProfile(hostile)).toEqual({ added: [], removed: [] });
  });
});

describe('saveProfile', () => {
  it('writes a versioned overlay round-trippable by loadProfile', () => {
    const s = memStorage();
    saveProfile({ added: ['a'], removed: ['b'] }, s);
    expect(JSON.parse(s._dump()[PROFILE_KEY])).toEqual({ v: 1, added: ['a'], removed: ['b'] });
    expect(loadProfile(s)).toEqual({ added: ['a'], removed: ['b'] });
  });

  it('is a no-op (no throw) when storage is unavailable', () => {
    expect(() => saveProfile({ added: [], removed: [] }, null)).not.toThrow();
  });

  it('swallows quota/disabled-storage errors from setItem', () => {
    const hostile = { setItem: () => { throw new Error('quota'); } };
    expect(() => saveProfile({ added: ['a'], removed: [] }, hostile)).not.toThrow();
  });
});
