import { describe, it, expect, beforeEach } from 'vitest';
import { state, buildUrl, pidWarning, matchesQuery } from './composer-state.js';

// Reset state before each test
beforeEach(() => {
  state.batteries             = [];
  state.questionnaires        = [];
  state.sourceByItem          = new Map();
  state.dependenciesBySource  = new Map();
  state.selected              = [];
  state.pid                   = '';
  state.query                 = '';
  state.currentUrl            = null;
  state.warnings              = [];
});

// ── buildUrl ──────────────────────────────────────────────────────────────────

const ORIGIN = 'http://localhost';

describe('buildUrl', () => {
  it('returns null when nothing is selected', () => {
    expect(buildUrl(ORIGIN)).toBeNull();
  });

  it('returns null when selected is empty array', () => {
    state.selected = [];
    expect(buildUrl(ORIGIN)).toBeNull();
  });

  it('includes items param with selected IDs', () => {
    state.selected = ['phq9'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    expect(buildUrl(ORIGIN)).toContain('items=phq9');
  });

  it('includes configs param with required source URLs', () => {
    state.selected = ['phq9'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    const url = buildUrl(ORIGIN);
    expect(url).toContain('configs=');
    expect(url).toContain('/configs/a.json');
  });

  it('includes pid param when pid is set', () => {
    state.selected = ['phq9'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    state.pid = 'TRC-001';
    expect(buildUrl(ORIGIN)).toContain('pid=TRC-001');
  });

  it('omits pid param when pid is empty', () => {
    state.selected = ['phq9'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    state.pid = '';
    expect(buildUrl(ORIGIN)).not.toContain('pid=');
  });

  it('omits pid param when pid is whitespace only', () => {
    state.selected = ['phq9'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    state.pid = '   ';
    expect(buildUrl(ORIGIN)).not.toContain('pid=');
  });

  it('preserves selection order in items param', () => {
    state.selected = ['gad7', 'phq9', 'pcl5'];
    state.sourceByItem.set('gad7',  '/configs/a.json');
    state.sourceByItem.set('phq9',  '/configs/a.json');
    state.sourceByItem.set('pcl5',  '/configs/a.json');
    const params = new URL(buildUrl(ORIGIN)).searchParams;
    expect(params.get('items')).toBe('gad7,phq9,pcl5');
  });

  it('deduplicates configs param when multiple items share a source', () => {
    state.selected = ['phq9', 'gad7'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    state.sourceByItem.set('gad7', '/configs/a.json');
    const configs = new URL(buildUrl(ORIGIN)).searchParams.get('configs').split(',');
    expect(configs).toHaveLength(1);
    expect(configs[0]).toBe('/configs/a.json');
  });

  it('includes multiple config sources when items come from different files', () => {
    state.selected = ['phq9', 'lsas'];
    state.sourceByItem.set('phq9', '/configs/a.json');
    state.sourceByItem.set('lsas', '/configs/b.json');
    const configs = new URL(buildUrl(ORIGIN)).searchParams.get('configs').split(',');
    expect(configs).toHaveLength(2);
    expect(configs).toContain('/configs/a.json');
    expect(configs).toContain('/configs/b.json');
  });

  it('includes transitive questionnaire sources when a battery references another config', () => {
    // battery lives in intake.json but references questionnaires from standard.json
    state.selected = ['clinical_intake'];
    state.sourceByItem.set('clinical_intake', 'configs/prod/intake.json');
    state.dependenciesBySource.set(
      'configs/prod/intake.json',
      ['configs/prod/standard.json']
    );
    const configs = new URL(buildUrl(ORIGIN)).searchParams.get('configs').split(',');
    expect(configs).toContain('configs/prod/intake.json');
    expect(configs).toContain('configs/prod/standard.json');
  });
});

// ── pidWarning ────────────────────────────────────────────────────────────────

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

// ── matchesQuery ──────────────────────────────────────────────────────────────

describe('matchesQuery', () => {
  const item = { id: 'phq9', title: 'PHQ-9', description: 'Patient health questionnaire' };

  it('returns true for empty query', () => {
    expect(matchesQuery(item, '')).toBe(true);
  });

  it('returns true for null/undefined query', () => {
    expect(matchesQuery(item, null)).toBe(true);
    expect(matchesQuery(item, undefined)).toBe(true);
  });

  it('matches on id (case-insensitive)', () => {
    expect(matchesQuery(item, 'phq9')).toBe(true);
    expect(matchesQuery(item, 'PHQ9')).toBe(true);
    expect(matchesQuery(item, 'phq')).toBe(true);
  });

  it('matches on title (case-insensitive)', () => {
    expect(matchesQuery(item, 'phq-9')).toBe(true);
    expect(matchesQuery(item, 'PHQ')).toBe(true);
  });

  it('matches on description (case-insensitive)', () => {
    expect(matchesQuery(item, 'health')).toBe(true);
    expect(matchesQuery(item, 'PATIENT')).toBe(true);
  });

  it('returns false for non-matching query', () => {
    expect(matchesQuery(item, 'lsas')).toBe(false);
    expect(matchesQuery(item, 'xyz_nomatch')).toBe(false);
  });

  it('handles item with no description', () => {
    const noDesc = { id: 'phq9', title: 'PHQ-9', description: '' };
    expect(matchesQuery(noDesc, 'health')).toBe(false);
    expect(matchesQuery(noDesc, 'phq9')).toBe(true);
  });

  it('trims whitespace from query', () => {
    expect(matchesQuery(item, '  phq9  ')).toBe(true);
  });

  it('matches on keywords when present', () => {
    const withKeywords = { id: 'pcl5', title: 'PCL-5', description: '', keywords: ['טראומה', 'ptsd'] };
    expect(matchesQuery(withKeywords, 'טראומה')).toBe(true);
    expect(matchesQuery(withKeywords, 'PTSD')).toBe(true);
    expect(matchesQuery(withKeywords, 'nomatch')).toBe(false);
  });

  it('does not throw when keywords is absent', () => {
    const noKeywords = { id: 'x', title: 'X', description: '' };
    expect(() => matchesQuery(noKeywords, 'x')).not.toThrow();
  });
});
