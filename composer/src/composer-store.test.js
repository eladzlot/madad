import { describe, it, expect, vi } from 'vitest';
import { createStore } from './composer-store.js';
import { CATALOG_VERSION } from '../../shared/catalog/build-catalog.js';

function entry(id, o = {}) {
  return {
    id,
    kind: o.kind ?? 'questionnaire',
    title: o.title ?? id,
    description: o.description ?? '',
    keywords: o.keywords ?? [],
    itemCount: 9,
    estMinutes: 1,
    hasConditional: false,
    domains: o.domains ?? ['depression'],
    type: o.type ?? 'severity',
    populations: o.populations ?? ['adult'],
    tags: [],
    featured: o.featured ?? false,
    ...(o.dev ? { dev: true } : {}),
  };
}

function catalog(entries) {
  return { catalogVersion: CATALOG_VERSION, entries };
}

function seeded(entries, opts) {
  const store = createStore();
  store.ingestCatalog(catalog(entries), { catalogVersion: CATALOG_VERSION, isDev: true, ...opts });
  return store;
}

// ── ingestCatalog ─────────────────────────────────────────────────────────────

describe('ingestCatalog', () => {
  it('populates entries and notifies subscribers', () => {
    const store = createStore();
    const spy = vi.fn();
    store.subscribe(spy);
    store.ingestCatalog(catalog([entry('phq9')]), { catalogVersion: CATALOG_VERSION });
    expect(store.entries.map(e => e.id)).toEqual(['phq9']);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('skips dev entries when not in dev mode', () => {
    const store = createStore();
    store.ingestCatalog(catalog([entry('phq9'), entry('phq9_test', { dev: true })]),
      { catalogVersion: CATALOG_VERSION, isDev: false });
    expect(store.entries.map(e => e.id)).toEqual(['phq9']);
  });

  it('keeps dev entries in dev mode', () => {
    const store = seeded([entry('phq9'), entry('phq9_test', { dev: true })]);
    expect(store.entries.map(e => e.id)).toEqual(['phq9', 'phq9_test']);
  });

  it('warns on catalog version mismatch but still ingests', () => {
    const store = createStore();
    store.ingestCatalog({ ...catalog([entry('phq9')]), catalogVersion: CATALOG_VERSION + 1 },
      { catalogVersion: CATALOG_VERSION });
    expect(store.warnings()).toHaveLength(1);
    expect(store.entries).toHaveLength(1);
  });
});

// ── tab derivation ────────────────────────────────────────────────────────────

describe('tabs', () => {
  it('always leads with an "all" tab; questionnaires always present', () => {
    const store = seeded([
      entry('phq9'),
      entry('bat', { kind: 'battery' }),
      entry('log', { type: 'worksheet' }),
    ]);
    expect(store.availableTabs()).toEqual(['all', 'questionnaires', 'batteries', 'worksheets']);
    expect(store.tab).toBe('all'); // default landing
  });

  it('hides worksheets tab when empty; keeps all + questionnaires', () => {
    const store = seeded([entry('phq9'), entry('bat', { kind: 'battery' })]);
    expect(store.availableTabs()).toEqual(['all', 'questionnaires', 'batteries']);
  });

  it('the all tab spans every category', () => {
    const store = seeded([entry('phq9'), entry('bat', { kind: 'battery' }), entry('log', { type: 'worksheet' })]);
    store.showEverything(); // escape the curated featured-only default
    expect(store.visibleEntries().map(e => e.id).sort()).toEqual(['bat', 'log', 'phq9']);
  });

  it('setTab switches the active tab and resets showAll', () => {
    const store = seeded([entry('phq9'), entry('bat', { kind: 'battery' })]);
    store.showEverything();
    store.setTab('batteries');
    expect(store.tab).toBe('batteries');
    expect(store.isCurated()).toBe(true); // showAll reset
  });
});

// ── curated view + visibleEntries ─────────────────────────────────────────────

describe('visibleEntries / curation', () => {
  it('curated view shows only featured entries of the active tab', () => {
    const store = seeded([
      entry('phq9', { featured: true }),
      entry('bdi', { featured: false }),
    ]);
    expect(store.isCurated()).toBe(true);
    expect(store.visibleEntries().map(e => e.id)).toEqual(['phq9']);
    expect(store.hasBeyondFeatured()).toBe(true);
  });

  it('showEverything reveals non-featured entries', () => {
    const store = seeded([
      entry('phq9', { featured: true, title: 'ב' }),
      entry('bdi', { featured: false, title: 'א' }),
    ]);
    store.showEverything();
    expect(store.isCurated()).toBe(false);
    expect(store.visibleEntries().map(e => e.id)).toEqual(['phq9', 'bdi']); // featured first
  });

  it('a query switches to full-catalog results within the tab', () => {
    const store = seeded([
      entry('phq9', { featured: true, title: 'דיכאון' }),
      entry('bdi', { featured: false, title: 'בק דיכאון', keywords: [] }),
    ]);
    store.setQuery('דיכאון');
    expect(store.isCurated()).toBe(false);
    expect(store.visibleEntries().map(e => e.id).sort()).toEqual(['bdi', 'phq9']);
  });

  it('a filter chip switches out of curation and narrows the pool', () => {
    const store = seeded([
      entry('phq9', { featured: true, domains: ['depression'] }),
      entry('gad7', { featured: true, domains: ['anxiety'] }),
    ]);
    store.toggleFilter('domain', 'anxiety');
    expect(store.filtersActive()).toBe(true);
    expect(store.visibleEntries().map(e => e.id)).toEqual(['gad7']);
  });

  it('toggling the same filter value clears it', () => {
    const store = seeded([entry('phq9')]);
    store.toggleFilter('domain', 'depression');
    expect(store.filters.domain).toBe('depression');
    store.toggleFilter('domain', 'depression');
    expect(store.filters.domain).toBeNull();
  });
});

// ── filter-chip options ───────────────────────────────────────────────────────

describe('available filter options', () => {
  it('lists only domains/populations present in the active tab', () => {
    const store = seeded([
      entry('phq9', { domains: ['depression'], populations: ['adult'] }),
      entry('scared', { domains: ['anxiety'], populations: ['child'] }),
    ]);
    expect(store.availableDomains().sort()).toEqual(['anxiety', 'depression']);
    expect(store.availablePopulations().sort()).toEqual(['adult', 'child']);
  });
});

// ── cross-tab hints ───────────────────────────────────────────────────────────

describe('crossTabMatches', () => {
  it('returns nothing when no query/filter is active', () => {
    const store = seeded([entry('phq9'), entry('bat', { kind: 'battery' })]);
    store.setTab('questionnaires');
    expect(store.crossTabMatches()).toEqual([]);
  });

  it('counts matches in other tabs for the active query', () => {
    const store = seeded([
      entry('phq9', { title: 'דיכאון' }),
      entry('depr_bat', { kind: 'battery', title: 'סוללת דיכאון' }),
    ]);
    store.setTab('questionnaires');
    store.setQuery('דיכאון');
    expect(store.crossTabMatches()).toEqual([{ tab: 'batteries', count: 1 }]);
  });

  it('the all tab never offers cross-tab hints (it already shows everything)', () => {
    const store = seeded([
      entry('phq9', { title: 'דיכאון' }),
      entry('depr_bat', { kind: 'battery', title: 'סוללת דיכאון' }),
    ]);
    expect(store.tab).toBe('all');
    store.setQuery('דיכאון');
    expect(store.crossTabMatches()).toEqual([]);
  });
});

// ── selection + reorder ───────────────────────────────────────────────────────

describe('selection', () => {
  it('toggle adds then removes, preserving order', () => {
    const store = seeded([entry('a'), entry('b'), entry('c')]);
    store.toggle('a'); store.toggle('b'); store.toggle('c');
    expect(store.selected).toEqual(['a', 'b', 'c']);
    store.toggle('b');
    expect(store.selected).toEqual(['a', 'c']);
  });

  it('reorder moves an item to a new index', () => {
    const store = seeded([entry('a'), entry('b'), entry('c')]);
    store.toggle('a'); store.toggle('b'); store.toggle('c');
    store.reorder(0, 2);
    expect(store.selected).toEqual(['b', 'c', 'a']);
  });

  it('reorder ignores out-of-range indices', () => {
    const store = seeded([entry('a'), entry('b')]);
    store.toggle('a'); store.toggle('b');
    store.reorder(0, 5);
    expect(store.selected).toEqual(['a', 'b']);
  });

  it('selectedEntries resolves ids to entries in order', () => {
    const store = seeded([entry('a', { title: 'AA' }), entry('b', { title: 'BB' })]);
    store.toggle('b'); store.toggle('a');
    expect(store.selectedEntries().map(e => e.title)).toEqual(['BB', 'AA']);
  });
});

// ── url + warnings + reset ────────────────────────────────────────────────────

describe('url / warnings / reset', () => {
  it('url reflects selection and pid', () => {
    const store = seeded([entry('phq9')]);
    store.toggle('phq9');
    store.setPid('TRC-1');
    const url = new URL(store.url(), 'http://localhost');
    expect(url.searchParams.get('items')).toBe('phq9');
    expect(url.searchParams.get('pid')).toBe('TRC-1');
  });

  it('url is null with no selection', () => {
    const store = seeded([entry('phq9')]);
    expect(store.url()).toBeNull();
  });

  it('warnings include a non-blocking pid warning', () => {
    const store = seeded([entry('phq9')]);
    store.setPid('bad id');
    expect(store.warnings().some(w => typeof w === 'string')).toBe(true);
    expect(store.warnings().length).toBe(1);
  });

  it('reset clears selection, pid, query, filters and curation', () => {
    const store = seeded([entry('phq9', { featured: true }), entry('bdi')]);
    store.toggle('phq9'); store.setPid('x'); store.setQuery('q');
    store.toggleFilter('domain', 'depression'); store.showEverything();
    store.reset();
    expect(store.selected).toEqual([]);
    expect(store.pid).toBe('');
    expect(store.query).toBe('');
    expect(store.filtersActive()).toBe(false);
    expect(store.isCurated()).toBe(true);
  });
});
