import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
  it('strips Hebrew niqqud / cantillation marks', () => {
    // דִּכָּאוֹן (pointed) → bare letters, with the final nun folded to medial
    expect(normalize('דִּכָּאוֹן')).toBe('דכאונ');
  });
  it('folds Hebrew final forms to medial', () => {
    expect(normalize('שלום')).toBe('שלומ');
    expect(normalize('ארץ')).toBe('ארצ');
  });
});

describe('matchesQuery', () => {
  const item = mk({ id: 'phq9', title: 'דיכאון PHQ-9', description: 'health', keywords: ['mood'] });

  it('empty query matches everything', () => {
    expect(matchesQuery(item, '')).toBe(true);
    expect(matchesQuery(item, null)).toBe(true);
  });
  it('matches across id/title/description/keywords', () => {
    expect(matchesQuery(item, 'phq')).toBe(true);
    expect(matchesQuery(item, 'דיכאון')).toBe(true);
    expect(matchesQuery(item, 'HEALTH')).toBe(true);
    expect(matchesQuery(item, 'mood')).toBe(true);
  });
  it('tolerates a single-character Hebrew typo', () => {
    expect(matchesQuery(item, 'דכאון')).toBe(true); // dropped yod
  });
  it('unrelated query returns false', () => {
    expect(matchesQuery(item, 'xyz_nomatch')).toBe(false);
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
  it('empty query falls back to browse order', () => {
    const entries = [
      mk({ id: 'b', title: 'ב', featured: false }),
      mk({ id: 'f', title: 'ת', featured: true }),
    ];
    expect(rankForQuery(entries, '').map(e => e.id)).toEqual(['f', 'b']);
  });
  it('filters out non-matches', () => {
    const entries = [mk({ id: 'phq9', title: 'דיכאון' })];
    expect(rankForQuery(entries, 'xyz_nomatch')).toEqual([]);
  });
  it('breaks near-equal relevance ties by featured, then title', () => {
    // Two identical-relevance title matches; the featured one leads.
    const entries = [
      mk({ id: 'plain', title: 'שאלון דיכאון ב', featured: false }),
      mk({ id: 'star', title: 'שאלון דיכאון א', featured: true }),
    ];
    expect(rankForQuery(entries, 'דיכאון')[0].id).toBe('star');
  });
});

// ── Committed acceptance suite: real queries against the live catalog. ────────
// These lock the search's clinical behavior; they must not regress. Run against
// the generated catalog so they track real content.
describe('acceptance (live catalog)', () => {
  const catalog = JSON.parse(
    readFileSync(new URL('../../public/composer/catalog.json', import.meta.url)),
  );
  const entries = catalog.entries.filter(e => !e.dev);
  const rankIds = (q) => rankForQuery(entries, q).map(e => e.id);

  it('"דכאון" (typo) surfaces phq9 in the top 3', () => {
    expect(rankIds('דכאון').slice(0, 3)).toContain('phq9');
  });
  it('"phq" ranks phq9 first', () => {
    expect(rankIds('phq')[0]).toBe('phq9');
  });
  it('"חרדה" surfaces gad7 and oasis in the top results', () => {
    const top = rankIds('חרדה').slice(0, 6);
    expect(top).toContain('gad7');
    expect(top).toContain('oasis');
  });
  it('"טראומ" surfaces the trauma instruments', () => {
    const top = rankIds('טראומ').slice(0, 6);
    expect(top).toContain('pcl5');
    expect(top).toContain('trauma_eval');
    expect(top).toContain('pc_ptsd5');
  });
  it('"pcl" ranks pcl5 first', () => {
    expect(rankIds('pcl')[0]).toBe('pcl5');
  });
});
