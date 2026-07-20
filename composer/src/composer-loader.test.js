import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state, CATALOG_URL } from './composer-state.js';

// Reset state before each test
beforeEach(() => {
  state.batteries       = [];
  state.questionnaires  = [];
  state.selected        = [];
  state.warnings        = [];
  mockFetch.mockReset();
});

// We need to mock fetch before importing loader functions
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { loadCatalog, applyCatalog, CATALOG_VERSION } = await import('./composer-loader.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function entry(id, overrides = {}) {
  return {
    id,
    kind: 'questionnaire',
    title: `שאלון ${id}`,
    description: '',
    keywords: [],
    itemCount: 9,
    estMinutes: 1,
    hasConditional: false,
    domains: ['depression'],
    type: 'severity',
    populations: ['adult'],
    tags: [],
    featured: false,
    ...overrides,
  };
}

function catalog(entries = []) {
  return { catalogVersion: CATALOG_VERSION, entries };
}

// ── loadCatalog ───────────────────────────────────────────────────────────────

describe('loadCatalog', () => {
  it('fetches CATALOG_URL and returns parsed JSON', async () => {
    const cat = catalog([entry('phq9')]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => cat });
    const result = await loadCatalog();
    expect(mockFetch.mock.calls[0][0]).toBe(CATALOG_URL);
    expect(result).toEqual(cat);
  });

  it('revalidates the catalog with cache: no-cache (mutable, unhashed file)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog() });
    await loadCatalog();
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' });
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(loadCatalog()).rejects.toThrow('404');
  });
});

// ── applyCatalog ──────────────────────────────────────────────────────────────

describe('applyCatalog', () => {
  it('populates state.questionnaires from catalog entries', () => {
    applyCatalog(catalog([entry('phq9')]));
    expect(state.questionnaires).toHaveLength(1);
    expect(state.questionnaires[0].id).toBe('phq9');
  });

  it('routes battery entries to state.batteries', () => {
    applyCatalog(catalog([entry('intake_bat', { kind: 'battery' }), entry('phq9')]));
    expect(state.batteries.map(b => b.id)).toEqual(['intake_bat']);
    expect(state.questionnaires.map(q => q.id)).toEqual(['phq9']);
  });

  it('marks entries as not hidden (render-layer contract)', () => {
    applyCatalog(catalog([entry('phq9')]));
    expect(state.questionnaires[0].hidden).toBe(false);
  });

  it('carries meta fields through for the browse UI', () => {
    applyCatalog(catalog([entry('phq9', { domains: ['depression'], featured: true, estMinutes: 2 })]));
    expect(state.questionnaires[0]).toMatchObject({
      domains: ['depression'], featured: true, estMinutes: 2, itemCount: 9,
    });
  });

  it('includes dev entries when running in dev mode (Vitest sets DEV=true)', () => {
    applyCatalog(catalog([entry('phq9'), entry('phq9_test', { dev: true })]));
    expect(state.questionnaires.map(q => q.id)).toEqual(['phq9', 'phq9_test']);
  });

  it('warns on catalog version mismatch but still applies entries', () => {
    applyCatalog({ ...catalog([entry('phq9')]), catalogVersion: CATALOG_VERSION + 1 });
    expect(state.warnings).toHaveLength(1);
    expect(state.questionnaires).toHaveLength(1);
  });

  it('applies cleanly with no warnings on a current-version catalog', () => {
    applyCatalog(catalog([entry('phq9')]));
    expect(state.warnings).toHaveLength(0);
  });
});

// ── URL generation integration ────────────────────────────────────────────────

describe('buildUrl integration', () => {
  it('generates an items-only URL from a selection', async () => {
    applyCatalog(catalog([
      entry('clinical_intake', { kind: 'battery' }),
      entry('phq9'),
    ]));

    const { buildUrl } = await import('./composer-state.js');
    state.selected = ['clinical_intake', 'phq9'];
    const url = new URL(buildUrl('http://localhost'));
    expect(url.searchParams.get('items')).toBe('clinical_intake,phq9');
    expect(url.searchParams.has('configs')).toBe(false);
  });
});
