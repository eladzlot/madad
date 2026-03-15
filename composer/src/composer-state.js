// composer-state.js
// Shared mutable state, URL builder, search matcher, and PID validator.
// All other composer modules import from here — nothing else holds state.

// Relative URL — resolves correctly at any base path deployment.
export const MANIFEST_URL = 'configs.json';
export const PID_PATTERN  = /^[a-zA-Z0-9\u0590-\u05FF_-]*$/;

export const state = {
  batteries:      [],       // [{ id, title, description, sourceUrl }]
  questionnaires: [],       // [{ id, title, description, sourceUrl }]
  sourceByItem:   new Map(),// id → sourceUrl
  selected:       [],       // string[] in selection order
  pid:            '',
  query:          '',
  currentUrl:     null,     // kept in sync on every render/partial
  warnings:       [],       // string[] — load-time warnings only
};

// ── URL generation ────────────────────────────────────────────────────────────

export function buildUrl(base = getAppRoot()) {
  if (state.selected.length === 0) return null;

  const neededSources = new Set(
    state.selected.map(id => state.sourceByItem.get(id)).filter(Boolean)
  );

  const parts = [
    `configs=${[...neededSources].join(',')}`,
    `items=${state.selected.join(',')}`,
  ];
  if (state.pid.trim()) parts.push(`pid=${encodeURIComponent(state.pid.trim())}`);

  return `${base}?${parts.join('&')}`;
}

// Returns the app root URL (the page serving index.html).
// Derived from the composer's own URL by stripping /composer/...
// e.g. http://localhost:5173/composer/ → http://localhost:5173/
//      https://eladzlot.github.io/madad/composer/ → https://eladzlot.github.io/madad/
export function getAppRoot() {
  if (typeof window === 'undefined') return '/';
  return window.location.href.replace(/\/composer(\/.*)?$/, '/');
}

// ── PID validation ────────────────────────────────────────────────────────────

export function pidWarning(pid) {
  if (!pid) return null;
  if (!PID_PATTERN.test(pid)) {
    return 'המזהה מכיל תווים לא מומלצים. השתמש באותיות, ספרות, מקף או קו תחתון.';
  }
  return null;
}

// ── Search ────────────────────────────────────────────────────────────────────

export function matchesQuery(item, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    item.id.toLowerCase().includes(q) ||
    item.title.toLowerCase().includes(q) ||
    (item.description != null && item.description.toLowerCase().includes(q)) ||
    (item.keywords != null && item.keywords.some(k => k.toLowerCase().includes(q)))
  );
}
