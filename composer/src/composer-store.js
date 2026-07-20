// composer-store.js — the composer's reactive store.
//
// Framework-free (plain factory + subscribe callback), mirroring
// aggregate/src/store.js. <composer-app> owns one store, subscribes once, and
// re-renders on notify; child components stay dumb and receive derived data as
// properties. All mutation goes through the methods here so buildUrl and the
// derivations have a single source of truth.
//
// The catalog is the only data source (see composer-loader.js). Each entry
// carries id, kind, title, description, keywords, and the meta taxonomy
// (domains/type/populations/tags/featured) the browse UI filters on.

import { buildUrl, pidWarning } from './composer-state.js';
import { sortForBrowse, rankForQuery, matchesQuery } from './search.js';
import { TABS, ALL_TAB, tabOf } from './taxonomy.js';

export function createStore() {
  const state = {
    entries:   [],              // all catalog entries (post dev-filter)
    warnings:  [],              // load-time warnings (catalog version, ...)
    tab:       ALL_TAB,
    query:     '',
    filters:   { domain: null, population: null },
    showAll:   false,           // "הצג הכל" — escape the curated featured view
    selected:  [],              // string[] ids, in selection order
    pid:       '',
    copied:    false,
  };

  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };

  // ── Derivations ─────────────────────────────────────────────────────────────

  // Tabs offered in the segmented control. 'all' always leads; questionnaires is
  // always shown; batteries and worksheets appear only when non-empty (plan:
  // hide worksheets while empty).
  function availableTabs() {
    const real = TABS.filter(t => t === 'questionnaires' || state.entries.some(e => tabOf(e) === t));
    return [ALL_TAB, ...real];
  }

  // Entries in a tab. The synthetic 'all' tab spans every category.
  const entriesInTab = (tab) =>
    tab === ALL_TAB ? state.entries.slice() : state.entries.filter(e => tabOf(e) === tab);

  // An entry passes the active chip filters (domain AND population, when set).
  function passesFilters(entry, filters = state.filters) {
    if (filters.domain && !(entry.domains ?? []).includes(filters.domain)) return false;
    if (filters.population && !(entry.populations ?? []).includes(filters.population)) return false;
    return true;
  }

  const filtersActive = () => !!(state.filters.domain || state.filters.population);

  // Is the list showing the curated featured-only view? True only with no
  // query, no chips, and הצג הכל not yet clicked.
  function isCurated() {
    return !state.query.trim() && !filtersActive() && !state.showAll;
  }

  // The entries visible in the active tab, after filters, query, and curation.
  function visibleEntries() {
    let pool = entriesInTab(state.tab).filter(e => passesFilters(e));
    if (state.query.trim()) return rankForQuery(pool, state.query);
    if (isCurated()) pool = pool.filter(e => e.featured);
    return sortForBrowse(pool);
  }

  // Does the active tab have entries beyond the featured ones? Drives whether
  // the curated view offers a "הצג הכל" escape hatch.
  function hasBeyondFeatured() {
    const pool = entriesInTab(state.tab).filter(e => passesFilters(e));
    return pool.some(e => !e.featured);
  }

  // When a query or filters are active, count matches in the *other* category
  // tabs so the list can surface "נמצאו עוד N ב…" cross-tab hints. The 'all' tab
  // already shows everything, so it neither offers nor receives hints.
  function crossTabMatches() {
    if (state.tab === ALL_TAB || (!state.query.trim() && !filtersActive())) return [];
    return availableTabs()
      .filter(t => t !== state.tab && t !== ALL_TAB)
      .map(t => ({
        tab: t,
        count: entriesInTab(t).filter(e => passesFilters(e) && matchesQuery(e, state.query)).length,
      }))
      .filter(x => x.count > 0);
  }

  // Filter-chip options for the active tab: only values that appear on some
  // entry in the tab (so chips never offer an empty result).
  function availableDomains() {
    const set = new Set();
    for (const e of entriesInTab(state.tab)) for (const d of e.domains ?? []) set.add(d);
    return [...set];
  }
  function availablePopulations() {
    const set = new Set();
    for (const e of entriesInTab(state.tab)) for (const p of e.populations ?? []) set.add(p);
    return [...set];
  }

  const entryById = (id) => state.entries.find(e => e.id === id) ?? null;
  const selectedEntries = () =>
    state.selected.map(id => entryById(id) ?? { id, title: id, kind: 'questionnaire' });

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // Populate from a parsed catalog. Dev-source entries are kept only in dev
    // builds (import.meta.env.DEV) — same semantics as the old applyCatalog.
    ingestCatalog(catalog, { catalogVersion, isDev = detectDev() } = {}) {
      if (catalogVersion != null && catalog.catalogVersion !== catalogVersion) {
        state.warnings.push(
          `גרסת קטלוג לא תואמת (${catalog.catalogVersion ?? '?'}) — ייתכן שהתצוגה חלקית. רעננו את הדף.`
        );
      }
      for (const entry of catalog.entries ?? []) {
        if (entry.dev && !isDev) continue;
        state.entries.push({
          ...entry,
          description: entry.description ?? '',
          keywords:    entry.keywords ?? [],
          domains:     entry.domains ?? [],
          populations: entry.populations ?? [],
        });
      }
      notify();
    },

    // ── Browse controls ──
    setTab(tab) {
      if (tab === state.tab) return;
      state.tab = tab;
      state.showAll = false; // curation is per-tab
      notify();
    },
    setQuery(q) { state.query = q; notify(); },
    clearQuery() { state.query = ''; notify(); },
    toggleFilter(kind, value) {
      state.filters = { ...state.filters, [kind]: state.filters[kind] === value ? null : value };
      notify();
    },
    clearFilters() { state.filters = { domain: null, population: null }; notify(); },
    showEverything() { state.showAll = true; notify(); },

    // ── Selection ──
    toggle(id) {
      state.selected = state.selected.includes(id)
        ? state.selected.filter(s => s !== id)
        : [...state.selected, id];
      notify();
    },
    isSelected(id) { return state.selected.includes(id); },
    // Reorder: move the item at `from` to index `to` (drag or keyboard).
    reorder(from, to) {
      if (from === to || from < 0 || to < 0 ||
          from >= state.selected.length || to >= state.selected.length) return;
      const next = [...state.selected];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      state.selected = next;
      notify();
    },
    setPid(value) { state.pid = value; notify(); },
    setCopied(v) { state.copied = v; notify(); },

    reset() {
      state.selected = [];
      state.pid = '';
      state.query = '';
      state.filters = { domain: null, population: null };
      state.showAll = false;
      state.copied = false;
      notify();
    },

    // ── Readers / derivations ──
    get tab() { return state.tab; },
    get query() { return state.query; },
    get filters() { return { ...state.filters }; },
    get selected() { return state.selected.slice(); },
    get pid() { return state.pid; },
    get copied() { return state.copied; },
    get entries() { return state.entries.slice(); },

    availableTabs,
    availableDomains,
    availablePopulations,
    filtersActive,
    isCurated,
    visibleEntries,
    hasBeyondFeatured,
    crossTabMatches,
    selectedEntries,
    entryById,

    url() { return buildUrl({ selected: state.selected, pid: state.pid }); },
    pidWarn() { return pidWarning(state.pid); },
    // Load warnings plus a non-blocking PID warning (mirrors the old header).
    warnings() {
      const w = state.pid ? pidWarning(state.pid) : null;
      return w ? [...state.warnings, w] : state.warnings.slice();
    },
  };
}

function detectDev() {
  return typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
}
