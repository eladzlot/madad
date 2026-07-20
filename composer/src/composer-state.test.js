import { describe, it, expect, beforeEach } from 'vitest';
import { state, buildUrl, pidWarning, matchesQuery } from './composer-state.js';

// Reset state before each test
beforeEach(() => {
  state.batteries             = [];
  state.questionnaires        = [];
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
    expect(buildUrl(ORIGIN)).toContain('items=phq9');
  });

  it('emits no configs param — item ids are addresses, the patient app derives config files from tokens', () => {
    state.selected = ['phq9', 'clinical_intake'];
    const params = new URL(buildUrl(ORIGIN)).searchParams;
    expect(params.has('configs')).toBe(false);
    expect(params.get('items')).toBe('phq9,clinical_intake');
  });

  it('includes pid param when pid is set', () => {
    state.selected = ['phq9'];
    state.pid = 'TRC-001';
    expect(buildUrl(ORIGIN)).toContain('pid=TRC-001');
  });

  it('omits pid param when pid is empty', () => {
    state.selected = ['phq9'];
    state.pid = '';
    expect(buildUrl(ORIGIN)).not.toContain('pid=');
  });

  it('omits pid param when pid is whitespace only', () => {
    state.selected = ['phq9'];
    state.pid = '   ';
    expect(buildUrl(ORIGIN)).not.toContain('pid=');
  });

  it('preserves selection order in items param', () => {
    state.selected = ['gad7', 'phq9', 'pcl5'];
    const params = new URL(buildUrl(ORIGIN)).searchParams;
    expect(params.get('items')).toBe('gad7,phq9,pcl5');
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
