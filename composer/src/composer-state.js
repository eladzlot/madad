// composer-state.js
// Shared mutable state, URL builder, search matcher, and PID validator.
// All other composer modules import from here — nothing else holds state.

export const MANIFEST_URL = '/composer/configs.json';
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

export function buildUrl(origin = window.location.origin) {
  if (state.selected.length === 0) return null;

  const neededSources = new Set(
    state.selected.map(id => state.sourceByItem.get(id)).filter(Boolean)
  );

  const parts = [
    `configs=${[...neededSources].join(',')}`,
    `items=${state.selected.join(',')}`,
  ];
  if (state.pid.trim()) parts.push(`pid=${encodeURIComponent(state.pid.trim())}`);

  return `${origin}/?${parts.join('&')}`;
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
    (item.description != null && item.description.toLowerCase().includes(q))
  );
}
