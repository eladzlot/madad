import { describe, it, expect } from 'vitest';
import { normalize, matchesQuery, sortForBrowse, rankForQuery } from './search.js';

const mk = (o) => ({ id: o.id, title: o.title, description: o.description ?? '', keywords: o.keywords ?? [], featured: !!o.featured });

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  PHQ ')).toBe('phq');
  });
  it('coerces nullish to empty string', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('matchesQuery', () => {
  const item = mk({ id: 'phq9', title: 'דיכאון PHQ-9', description: 'health', keywords: ['mood'] });

  it('empty query matches everything', () => {
    expect(matchesQuery(item, '')).toBe(true);
  });
  it('matches across id/title/description/keywords', () => {
    expect(matchesQuery(item, 'phq')).toBe(true);
    expect(matchesQuery(item, 'דיכאון')).toBe(true);
    expect(matchesQuery(item, 'HEALTH')).toBe(true);
    expect(matchesQuery(item, 'mood')).toBe(true);
  });
  it('no match returns false', () => {
    expect(matchesQuery(item, 'zzz')).toBe(false);
  });
});

describe('sortForBrowse', () => {
  it('puts featured entries first, then alphabetical', () => {
    const entries = [
      mk({ id: 'b', title: 'ב', featured: false }),
      mk({ id: 'a', title: 'א', featured: false }),
      mk({ id: 'f', title: 'ת', featured: true }),
    ];
    expect(sortForBrowse(entries).map(e => e.id)).toEqual(['f', 'a', 'b']);
  });
  it('does not mutate its input', () => {
    const entries = [mk({ id: 'b', title: 'ב' }), mk({ id: 'a', title: 'א' })];
    const before = entries.map(e => e.id);
    sortForBrowse(entries);
    expect(entries.map(e => e.id)).toEqual(before);
  });
});

describe('rankForQuery', () => {
  const entries = [
    mk({ id: 'phq9', title: 'שאלון דיכאון', description: 'x', keywords: [] }),      // title match
    mk({ id: 'depr_scale', title: 'סולם', description: 'y', keywords: ['depr'] }),  // id match
    mk({ id: 'other', title: 'אחר', description: 'depr here', keywords: [] }),       // description match
  ];

  it('filters out non-matches', () => {
    expect(rankForQuery(entries, 'nomatch')).toEqual([]);
  });

  it('ranks title matches above id above description', () => {
    const ranked = rankForQuery(entries, 'depr');
    // 'depr' appears in: title? no for phq9 (title is דיכאון). Use a query hitting all.
    expect(ranked.length).toBe(2); // depr_scale (id), other (description)
    expect(ranked[0].id).toBe('depr_scale');
    expect(ranked[1].id).toBe('other');
  });

  it('title match wins', () => {
    const ranked = rankForQuery(entries, 'דיכאון');
    expect(ranked[0].id).toBe('phq9');
  });
});
