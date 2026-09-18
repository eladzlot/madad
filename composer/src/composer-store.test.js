import { describe, it, expect, vi } from 'vitest';
import { generateUid } from '../../shared/remote/uid.js';
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

  it('a tab with no featured entries shows all of them in the default view', () => {
    // Worksheets carry no `featured` flag — curation must not empty the tab.
    const store = seeded([
      entry('cpt_abc', { type: 'worksheet' }),
      entry('cpt_exploring', { type: 'worksheet' }),
    ]);
    store.setTab('worksheets');
    expect(store.isCurated()).toBe(true);       // no query/chips/showAll
    expect(store.curationActive()).toBe(false); // but nothing to curate down to
    expect(store.visibleEntries().map(e => e.id).sort()).toEqual(['cpt_abc', 'cpt_exploring']);
  });

  it('curationActive is true only when the tab has a featured entry', () => {
    const store = seeded([
      entry('phq9', { featured: true }),
      entry('cpt_abc', { type: 'worksheet' }),
    ]);
    store.setTab('questionnaires');
    expect(store.curationActive()).toBe(true);  // phq9 is featured
    store.setTab('worksheets');
    expect(store.curationActive()).toBe(false); // worksheet tab has no featured
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
  // Remote deployment: the pid is a minted uid (shared/remote/uid.js) and the
  // link is withheld until it is valid.
  const UID = generateUid(() => Uint8Array.from([1, 2, 3, 4, 5, 6, 7]));

  it('url reflects selection and the canonical uid', () => {
    const store = seeded([entry('phq9')]);
    store.toggle('phq9');
    store.setPid(UID.toLowerCase().replace('-', ''));
    const url = new URL(store.url(), 'http://localhost');
    expect(url.searchParams.get('items')).toBe('phq9');
    // pid rides in the fragment now (kept out of server/CDN logs) — see buildUrl.
    expect(url.hash).toBe(`#pid=${UID}`);
    expect(store.uidValid()).toBe(true);
  });

  it('url is null with no selection', () => {
    const store = seeded([entry('phq9')]);
    store.setPid(UID);
    expect(store.url()).toBeNull();
  });

  it('url is null while the uid is missing or invalid', () => {
    const store = seeded([entry('phq9')]);
    store.toggle('phq9');
    expect(store.url()).toBeNull();
    store.setPid('TRC-1');
    expect(store.url()).toBeNull();
    expect(store.uidValid()).toBe(false);
  });

  it('an invalid uid yields a field message, not a banner warning', () => {
    const store = seeded([entry('phq9')]);
    expect(store.pidWarn()).toBeNull();
    store.setPid('bad id');
    expect(store.pidWarn()).toContain('XXXX-XXXX');
    expect(store.warnings()).toEqual([]);
    store.setPid('CMPS-001K');                      // right shape, wrong check symbol
    expect(store.pidWarn()).toContain('טעות הקלדה');
    store.setPid('CMPS-001J');
    expect(store.pidWarn()).toBeNull();
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

  it('reset does not touch the persistent recommended profile', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi')]);
    store.togglePin('phq9'); // unpin an author default
    store.togglePin('bdi');  // pin a non-default
    store.reset();
    expect(store.isPinned('phq9')).toBe(false);
    expect(store.isPinned('bdi')).toBe(true);
  });
});

// ── recommended profile (pins) ────────────────────────────────────────────────

// Isolated in-memory Storage so pin tests never share real localStorage.
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function pinned(entries, { storage = memStorage() } = {}) {
  const store = createStore({ storage });
  store.ingestCatalog(catalog(entries), { catalogVersion: CATALOG_VERSION, isDev: true });
  return { store, storage };
}

describe('recommended profile / pins', () => {
  it('author-featured entries are pinned by default', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi')]);
    expect(store.isPinned('phq9')).toBe(true);
    expect(store.isPinned('bdi')).toBe(false);
    expect(store.profileCustomized()).toBe(false);
  });

  it('unpinning an author default removes it from the curated view', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi', { featured: true })]);
    store.togglePin('phq9');
    expect(store.isPinned('phq9')).toBe(false);
    expect(store.pinnedIds()).toEqual(['bdi']);
    expect(store.visibleEntries().map(e => e.id)).toEqual(['bdi']); // curated to pins
  });

  it('pinning a non-default adds it to the curated view', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi')]);
    store.togglePin('bdi');
    expect(store.isPinned('bdi')).toBe(true);
    expect(store.pinnedIds().sort()).toEqual(['bdi', 'phq9']);
  });

  it('re-pinning an unpinned default clears the delta (self-normalizes)', () => {
    const { store, storage } = pinned([entry('phq9', { featured: true })]);
    store.togglePin('phq9'); // remove
    store.togglePin('phq9'); // add back
    expect(store.isPinned('phq9')).toBe(true);
    expect(store.profileCustomized()).toBe(false);
    // overlay is empty again → nothing meaningful persisted
    expect(JSON.parse(storage.getItem('madad.composer.profile.v1'))).toEqual({ v: 1, added: [], removed: [] });
  });

  it('unpinning a freshly pinned non-default clears the delta', () => {
    const { store } = pinned([entry('bdi')]);
    store.togglePin('bdi'); // add
    store.togglePin('bdi'); // remove
    expect(store.isPinned('bdi')).toBe(false);
    expect(store.profileCustomized()).toBe(false);
  });

  it('ignores pinning an id the catalog does not carry', () => {
    const { store } = pinned([entry('phq9', { featured: true })]);
    store.togglePin('ghost');
    expect(store.profileCustomized()).toBe(false);
    expect(store.pinnedIds()).toEqual(['phq9']);
  });

  it('persists the overlay and reloads it into a fresh store', () => {
    const storage = memStorage();
    const a = pinned([entry('phq9', { featured: true }), entry('bdi')], { storage }).store;
    a.togglePin('phq9'); // remove default
    a.togglePin('bdi');  // add non-default

    const b = pinned([entry('phq9', { featured: true }), entry('bdi')], { storage }).store;
    expect(b.isPinned('phq9')).toBe(false);
    expect(b.isPinned('bdi')).toBe(true);
  });

  it('a newly-featured instrument still appears for a customized clinician (overlay, not snapshot)', () => {
    const storage = memStorage();
    // Clinician customizes: pins an extra questionnaire.
    pinned([entry('phq9', { featured: true }), entry('bdi')], { storage }).store.togglePin('bdi');
    // Author later ships a new featured instrument; clinician reloads.
    const b = pinned([
      entry('phq9', { featured: true }),
      entry('bdi'),
      entry('gad7', { featured: true }), // new default
    ], { storage }).store;
    expect(b.isPinned('gad7')).toBe(true); // reaches the customized clinician
  });

  it('restoreDefaults drops all divergence back to author featured', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi')]);
    store.togglePin('phq9'); store.togglePin('bdi');
    expect(store.profileCustomized()).toBe(true);
    store.restoreDefaults();
    expect(store.profileCustomized()).toBe(false);
    expect(store.pinnedIds()).toEqual(['phq9']);
  });

  it('curation falls back to showing everything when the clinician unpins all', () => {
    const { store } = pinned([entry('phq9', { featured: true }), entry('bdi')]);
    store.togglePin('phq9'); // now nothing is pinned in this tab
    expect(store.curationActive()).toBe(false);
    expect(store.visibleEntries().map(e => e.id).sort()).toEqual(['bdi', 'phq9']);
  });
});

// ── languages (docs/I18N_SPEC.md §9) ──────────────────────────────────────────

describe('patient language', () => {
  const he = (id, o = {}) => entry(id, { ...o });                                      // Hebrew-only
  const both = (id, title) => ({ ...entry(id, { featured: true }), languages: ['he', 'en'], i18n: { en: { title, description: 'Desc', keywords: ['EN'] } } });

  it('defaults the patient language to the UI language and lists all LANGS', () => {
    expect(seeded([he('a')]).patientLang).toBe('he');
    const store = createStore({ uiLang: 'en' });
    store.ingestCatalog(catalog([he('a')]), { catalogVersion: CATALOG_VERSION, isDev: true });
    expect(store.patientLang).toBe('en');
    expect(store.patientLangs()).toEqual(['he', 'en']);
  });

  it('hides entries the patient language cannot serve (L-8)', () => {
    const store = seeded([he('wsas', { featured: true }), both('phq9', 'PHQ-9')]);
    store.showEverything();
    expect(store.visibleEntries().map(e => e.id).sort()).toEqual(['phq9', 'wsas']);
    store.setPatientLang('en');
    expect(store.visibleEntries().map(e => e.id)).toEqual(['phq9']);
    expect(store.availableTabs()).toEqual(['all', 'questionnaires']);
  });

  it('switching drops unavailable selections, records them, and stamps lang= on the URL', () => {
    const store = seeded([he('wsas'), both('phq9', 'PHQ-9')]);
    store.toggle('wsas'); store.toggle('phq9');
    store.setPatientLang('en');
    expect(store.selected).toEqual(['phq9']);
    expect(store.dropped).toEqual(['wsas']);
    // The trial withholds the link until the uid validates (REMOTE_SPEC §3).
    store.setPid('CMPS-001J');
    expect(store.url()).toContain('lang=en');
    store.clearDropped();
    expect(store.dropped).toEqual([]);
    store.setPatientLang('he');
    expect(store.url()).not.toContain('lang=');
  });

  it('does NOT outlive the page — a fresh store follows the UI language again', () => {
    // It used to persist per browser, so one explicit choice silently outranked
    // the UI language on every later visit: the bar said English while the
    // catalog filtered to Hebrew, with nothing on screen reconciling the two.
    const mem = new Map();
    const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const a = createStore({ storage });
    a.ingestCatalog(catalog([both('phq9', 'PHQ-9')]), { catalogVersion: CATALOG_VERSION, isDev: true });
    a.setPatientLang('en');
    expect(a.patientLang).toBe('en');          // holds for this page
    const b = createStore({ storage, uiLang: 'he' });
    expect(b.patientLang).toBe('he');          // and only for this page
    const c = createStore({ storage, uiLang: 'en' });
    expect(c.patientLang).toBe('en');
  });

  it('ignores unknown languages', () => {
    const store = seeded([both('phq9', 'PHQ-9')]);
    store.setPatientLang('xx');
    expect(store.patientLang).toBe('he');
  });
});

describe('UI language', () => {
  const both = (id, title) => ({ ...entry(id, { featured: true, title: `עברית ${id}` }), languages: ['he', 'en'], i18n: { en: { title, description: 'Desc', keywords: ['EN'] } } });

  it('shows titles in the UI language, falling back to Hebrew', () => {
    const store = createStore({ uiLang: 'en' });
    store.ingestCatalog(catalog([both('phq9', 'PHQ-9 English'), entry('wsas', { featured: true, title: 'תפקוד' })]),
      { catalogVersion: CATALOG_VERSION, isDev: true });
    store.setPatientLang('he');
    const titles = Object.fromEntries(store.visibleEntries().map(e => [e.id, e.title]));
    expect(titles).toEqual({ phq9: 'PHQ-9 English', wsas: 'תפקוד' });
    store.toggle('phq9');
    expect(store.selectedEntries()[0].title).toBe('PHQ-9 English');
    expect(store.entries.find(e => e.id === 'phq9').title).toBe('עברית phq9');   // raw entries untouched
  });

  it('search finds an entry by its other-language title', () => {
    const store = createStore({ uiLang: 'en' });
    store.ingestCatalog(catalog([both('phq9', 'Patient Health Questionnaire'), entry('gad7', { title: 'חרדה' })]),
      { catalogVersion: CATALOG_VERSION, isDev: true });
    store.setPatientLang('he');
    store.setQuery('עברית');
    expect(store.visibleEntries().map(e => e.id)).toEqual(['phq9']);
    store.setQuery('Patient Health');
    expect(store.visibleEntries().map(e => e.id)).toEqual(['phq9']);
  });
});
