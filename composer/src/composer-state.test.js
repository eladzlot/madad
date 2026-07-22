import { describe, it, expect } from 'vitest';
import { buildUrl, pidWarning, matchesQuery, getAppRoot } from './composer-state.js';

// ── buildUrl (pure) ─────────────────────────────────────────────────────────

const ORIGIN = 'http://localhost';

describe('buildUrl', () => {
  it('returns null when nothing is selected', () => {
    expect(buildUrl({ selected: [] }, ORIGIN)).toBeNull();
  });

  it('returns null when called with no selection at all', () => {
    expect(buildUrl({}, ORIGIN)).toBeNull();
    expect(buildUrl(undefined, ORIGIN)).toBeNull();
  });

  it('includes items param with selected IDs', () => {
    expect(buildUrl({ selected: ['phq9'] }, ORIGIN)).toContain('items=phq9');
  });

  it('emits no configs param — item ids are addresses', () => {
    const params = new URL(buildUrl({ selected: ['phq9', 'clinical_intake'] }, ORIGIN)).searchParams;
    expect(params.has('configs')).toBe(false);
    expect(params.get('items')).toBe('phq9,clinical_intake');
  });

  it('includes pid param when pid is set', () => {
    expect(buildUrl({ selected: ['phq9'], pid: 'TRC-001' }, ORIGIN)).toContain('pid=TRC-001');
  });

  it('carries the pid in the URL fragment, not the query string', () => {
    // Keeps the patient identifier client-side: fragments never reach the
    // server/CDN request line or the Referer header. See buildUrl comment.
    const url = new URL(buildUrl({ selected: ['phq9'], pid: 'TRC-001' }, ORIGIN));
    expect(url.searchParams.has('pid')).toBe(false);
    expect(url.searchParams.get('items')).toBe('phq9');
    expect(url.hash).toBe('#pid=TRC-001');
  });

  it('omits pid param when pid is empty', () => {
    expect(buildUrl({ selected: ['phq9'], pid: '' }, ORIGIN)).not.toContain('pid=');
  });

  it('omits pid param when pid is whitespace only', () => {
    expect(buildUrl({ selected: ['phq9'], pid: '   ' }, ORIGIN)).not.toContain('pid=');
  });

  it('preserves selection order in items param', () => {
    const params = new URL(buildUrl({ selected: ['gad7', 'phq9', 'pcl5'] }, ORIGIN)).searchParams;
    expect(params.get('items')).toBe('gad7,phq9,pcl5');
  });

  it('url-encodes pid values', () => {
    expect(buildUrl({ selected: ['phq9'], pid: 'a b' }, ORIGIN)).toContain('pid=a%20b');
  });
});

// ── getAppRoot ──────────────────────────────────────────────────────────────

describe('getAppRoot', () => {
  it('returns "/" when window is undefined (node)', () => {
    // In the node test environment there is no window.
    expect(getAppRoot()).toBe('/');
  });
});

// ── pidWarning ──────────────────────────────────────────────────────────────

describe('pidWarning', () => {
  it('returns null for empty string', () => {
    expect(pidWarning('')).toBeNull();
  });

  it('returns null for valid alphanumeric ID', () => {
    expect(pidWarning('TRC2025001')).toBeNull();
  });

  it('returns null for ID with hyphens and underscores', () => {
    expect(pidWarning('TRC-2025-001')).toBeNull();
    expect(pidWarning('TRC_001')).toBeNull();
  });

  it('returns null for Hebrew characters', () => {
    expect(pidWarning('מטופל123')).toBeNull();
  });

  it('returns a warning string for spaces', () => {
    expect(pidWarning('bad id')).toBeTypeOf('string');
  });

  it('returns a warning string for special characters', () => {
    expect(pidWarning('bad!id')).toBeTypeOf('string');
    expect(pidWarning('id@domain')).toBeTypeOf('string');
  });
});

// ── matchesQuery (re-exported from search.js) ─────────────────────────────────

describe('matchesQuery', () => {
  const item = { id: 'phq9', title: 'PHQ-9', description: 'Patient health questionnaire' };

  it('returns true for empty/nullish query', () => {
    expect(matchesQuery(item, '')).toBe(true);
    expect(matchesQuery(item, null)).toBe(true);
    expect(matchesQuery(item, undefined)).toBe(true);
  });

  it('matches on id, title, description (case-insensitive)', () => {
    expect(matchesQuery(item, 'PHQ9')).toBe(true);
    expect(matchesQuery(item, 'phq-9')).toBe(true);
    expect(matchesQuery(item, 'HEALTH')).toBe(true);
  });

  it('returns false for non-matching query', () => {
    expect(matchesQuery(item, 'xyz_nomatch')).toBe(false);
  });

  it('matches on keywords when present, no throw when absent', () => {
    const withKw = { id: 'pcl5', title: 'PCL-5', description: '', keywords: ['טראומה', 'ptsd'] };
    expect(matchesQuery(withKw, 'טראומה')).toBe(true);
    expect(matchesQuery(withKw, 'PTSD')).toBe(true);
    expect(() => matchesQuery({ id: 'x', title: 'X', description: '' }, 'x')).not.toThrow();
  });
});
