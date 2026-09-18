// composer-store.js — the composer's reactive store.
//
// Framework-free (plain factory + subscribe callback), mirroring
// aggregate/src/store.js. <composer-app> owns one store, subscribes once, and
// re-renders on notify; child components stay dumb and receive derived data as
// properties. All mutation goes through the methods here so buildUrl and the
// derivations have a single source of truth.
//
// The catalog is the only data source (see composer-loader.js). Each entry
// carries id, kind, title, description, keywords, the meta taxonomy
// (domains/type/populations/tags/featured) the browse UI filters on, and — v2 —
// `languages` (patient languages it can be sent in) plus `i18n[lang]` with the
// clinician-facing title/description/keywords per translated language.
//
// Two languages live here (docs/I18N_SPEC.md): `uiLang`, the clinician's UI
// language (fixed for the page lifetime — switching reloads), and
// `patientLang`, the language the link will open in. The picker only lists
// entries available in `patientLang` (L-8); titles display in `uiLang`.
//
// `patientLang` FOLLOWS `uiLang` unless the clinician changes it, and that
// change lasts for the page only. It used to persist per browser, which meant a
// choice made once silently outranked the UI language on every later visit: the
// bar said English while the catalog filtered to Hebrew, and on a phone the
// control that explained it lives inside the bottom sheet, out of sight.

import { buildUrl, pidWarning } from './composer-state.js';
import { sortForBrowse, rankForQuery } from './search.js';
import { TABS, ALL_TAB, tabOf } from './taxonomy.js';
import { loadProfile, saveProfile, safeLocalStorage } from './composer-profile.js';
import { t } from '../../clinician/i18n/index.js';
import { DEFAULT_LANG, LANGS, isLang } from '../../shared/i18n/core.js';
import { titleIn, textIn } from './entry-text.js';

export { titleIn, textIn };

export function createStore({ storage = safeLocalStorage(), uiLang = DEFAULT_LANG } = {}) {
  const state = {
    entries:   [],              // all catalog entries (post dev-filter)
    warnings:  [],              // load-time warnings (catalog version, ...)
    tab:       ALL_TAB,
    query:     '',
    filters:   { domain: null, population: null },
    showAll:   false,           // "הצג הכל" — escape the curated recommended view
    selected:  [],              // string[] ids, in selection order
    pid:       '',
    copied:    false,
    // The clinician's personal recommended-profile overlay on top of the
    // catalog's author `featured` defaults. See composer-profile.js.
    profile:   loadProfile(storage),
    uiLang:    isLang(uiLang) ? uiLang : DEFAULT_LANG,
    // Patient language: the UI language until the clinician says otherwise.
    patientLang: isLang(uiLang) ? uiLang : DEFAULT_LANG,
    // Selections dropped by the last patient-language switch, for a notice.
    dropped:   [],
  };

  const persist = () => saveProfile(state.profile, storage);

  // The catalog entries the patient language allows (L-8: hidden entirely).
  const availableIn = (entry, lang = state.patientLang) => (entry.languages ?? [DEFAULT_LANG]).includes(lang);
  const displayEntry = (e) => ({ ...e, title: titleIn(e, state.uiLang), description: textIn(e, state.uiLang, 'description') });

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

  // Entries in a tab, restricted to the patient language. The synthetic 'all'
  // tab spans every category.
  const entriesInTab = (tab) =>
    state.entries.filter(e => availableIn(e) && (tab === ALL_TAB || tabOf(e) === tab));

  // An entry passes the active chip filters (domain AND population, when set).
  function passesFilters(entry, filters = state.filters) {
    if (filters.domain && !(entry.domains ?? []).includes(filters.domain)) return false;
    if (filters.population && !(entry.populations ?? []).includes(filters.population)) return false;
    return true;
  }

  const filtersActive = () => !!(state.filters.domain || state.filters.population);

  // Is the list showing the curated recommended-only view? True only with no
  // query, no chips, and הצג הכל not yet clicked.
  function isCurated() {
    return !state.query.trim() && !filtersActive() && !state.showAll;
  }

  // An entry is pinned when the clinician's overlay resolves it to "in" — the
  // author `featured` default, plus their `added`, minus their `removed`.
  function isPinned(id) {
    const { added, removed } = state.profile;
    if (removed.includes(id)) return false;
    if (added.includes(id)) return true;
    return !!entryById(id)?.featured;
  }

  // Whether the active tab has any pinned entry to curate down to.
  function tabHasPinned() {
    return entriesInTab(state.tab).filter(e => passesFilters(e)).some(e => isPinned(e.id));
  }

  // Curation only *narrows* the list when the tab actually has pinned entries
  // to highlight. A tab with content but nothing pinned (e.g. a worksheet tab
  // the clinician never curated) shows everything instead of an empty view.
  function curationActive() {
    return isCurated() && tabHasPinned();
  }

  // The entries visible in the active tab, after filters, query, and curation.
  // Returned with title/description in the UI language.
  function visibleEntries() {
    let pool = entriesInTab(state.tab).filter(e => passesFilters(e));
    if (state.query.trim()) return rankForQuery(pool, state.query, state.uiLang).map(displayEntry);
    if (curationActive()) pool = pool.filter(e => isPinned(e.id));
    return sortForBrowse(pool, state.uiLang).map(displayEntry);
  }

  // Does the active tab have entries beyond the pinned ones? Drives whether the
  // curated view offers a "הצג הכל" escape hatch.
  function hasBeyondFeatured() {
    const pool = entriesInTab(state.tab).filter(e => passesFilters(e));
    return pool.some(e => !isPinned(e.id));
  }

  // Ids of every catalog entry currently pinned (across all tabs) — the UI uses
  // this to mark cards. Kept catalog-scoped so stale overlay ids never surface.
  const pinnedIds = () => state.entries.filter(e => isPinned(e.id)).map(e => e.id);

  // Has the clinician diverged from the author defaults at all? Drives the
  // "restore recommended" affordance.
  const profileCustomized = () => state.profile.added.length > 0 || state.profile.removed.length > 0;

  // When a query or filters are active, count matches in the *other* category
  // tabs so the list can surface "נמצאו עוד N ב…" cross-tab hints. The 'all' tab
  // already shows everything, so it neither offers nor receives hints.
  function crossTabMatches() {
    if (state.tab === ALL_TAB || (!state.query.trim() && !filtersActive())) return [];
    return availableTabs()
      .filter(t => t !== state.tab && t !== ALL_TAB)
      .map(t => ({
        tab: t,
        count: rankForQuery(entriesInTab(t).filter(e => passesFilters(e)), state.query, state.uiLang).length,
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
    state.selected.map(id => {
      const e = entryById(id);
      return e ? displayEntry(e) : { id, title: id, kind: 'questionnaire' };
    });

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // Populate from a parsed catalog. Dev-source entries are kept only in dev
    // builds (import.meta.env.DEV) — same semantics as the old applyCatalog.
    ingestCatalog(catalog, { catalogVersion, isDev = detectDev() } = {}) {
      if (catalogVersion != null && catalog.catalogVersion !== catalogVersion) {
        state.warnings.push(t('composer.catalogVersion', { version: catalog.catalogVersion ?? '?' }));
      }
      for (const entry of catalog.entries ?? []) {
        if (entry.dev && !isDev) continue;
        state.entries.push({
          ...entry,
          description: entry.description ?? '',
          keywords:    entry.keywords ?? [],
          domains:     entry.domains ?? [],
          populations: entry.populations ?? [],
          languages:   entry.languages ?? [DEFAULT_LANG],
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

    // ── Recommended profile (pins) ──
    // Toggle whether `id` is in the clinician's recommended set, recording only
    // the delta from the author `featured` default so future defaults keep
    // flowing. The four cases self-normalize: dropping an id from both lists
    // first, then re-adding to exactly one only when it diverges from default.
    togglePin(id) {
      const e = entryById(id);
      if (!e) return; // never pin an id the catalog doesn't carry
      const featured = !!e.featured;
      const wasPinned = isPinned(id);
      let added   = state.profile.added.filter(x => x !== id);
      let removed = state.profile.removed.filter(x => x !== id);
      if (wasPinned) {
        if (featured) removed = [...removed, id]; // remove an author default
      } else {
        if (!featured) added = [...added, id];     // add a non-default
      }
      state.profile = { added, removed };
      persist();
      notify();
    },
    isPinned,
    // Drop all divergence and fall back to the author `featured` defaults.
    restoreDefaults() {
      state.profile = { added: [], removed: [] };
      persist();
      notify();
    },

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

    // ── Patient language ──
    // Switching drops selections the new language cannot serve (the picker
    // hides them too) and records them so the cart can say what happened.
    setPatientLang(lang) {
      if (!isLang(lang) || lang === state.patientLang) return;
      state.patientLang = lang;
      const dropped = state.selected.filter(id => { const e = entryById(id); return e && !availableIn(e, lang); });
      state.selected = state.selected.filter(id => !dropped.includes(id));
      state.dropped = dropped;
      state.copied = false;
      notify();
    },
    clearDropped() { if (state.dropped.length) { state.dropped = []; notify(); } },
    // Languages a link can be built in — every LANGS code, so the clinician can
    // see an empty list rather than wonder why a language is missing.
    patientLangs() { return Object.keys(LANGS); },

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
    get uiLang() { return state.uiLang; },
    get patientLang() { return state.patientLang; },
    get dropped() { return state.dropped.slice(); },

    availableTabs,
    availableDomains,
    availablePopulations,
    filtersActive,
    isCurated,
    curationActive,
    visibleEntries,
    hasBeyondFeatured,
    pinnedIds,
    profileCustomized,
    crossTabMatches,
    selectedEntries,
    entryById,

    url() { return buildUrl({ selected: state.selected, pid: state.pid, lang: state.patientLang }); },
    pidWarn() { const c = pidWarning(state.pid); return c ? t(`pid.${c}`) : null; },
    // Load warnings plus a non-blocking PID warning (mirrors the old header).
    warnings() {
      const c = state.pid ? pidWarning(state.pid) : null;
      return c ? [...state.warnings, t(`pid.${c}`)] : state.warnings.slice();
    },
  };
}

function detectDev() {
  return typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
}
