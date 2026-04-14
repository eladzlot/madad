// composer-loader.js
// Fetches the manifest and loads all listed configs.
// Failures are partial — warns and continues rather than halting.

import { loadConfig } from '/src/config/loader.js';
import { state, MANIFEST_URL, getAppRoot } from './composer-state.js';

// The base path for internal production configs (without leading slash).
// Short names in generated patient URLs are derived by stripping this prefix
// and the .json suffix. External URLs are stored as-is.
// Single source of truth — update here if the folder structure ever changes.
export const INTERNAL_CONFIG_PREFIX = 'configs/prod/';

// Convert a stored sourceUrl to the token that goes in the patient URL.
// Internal paths like 'configs/prod/standard.json' become 'standard'.
// External URLs (https://...) and non-standard paths are returned unchanged.
function toShortName(sourceUrl) {
  if (sourceUrl.startsWith(INTERNAL_CONFIG_PREFIX) && sourceUrl.endsWith('.json')) {
    return sourceUrl.slice(INTERNAL_CONFIG_PREFIX.length, -'.json'.length);
  }
  return sourceUrl;
}

export async function loadManifest() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`שגיאה בטעינת המניפסט: HTTP ${res.status}`);
  return res.json();
}

export async function loadAllConfigs(manifest) {
  // The manifest uses root-relative paths like /configs/prod/standard.json.
  // To fetch correctly at any base path (/, /madad/, etc.) we resolve them
  // against the app root URL.
  //
  // For sourceUrl (used in generated patient URLs) we store the path without
  // the leading slash — e.g. configs/prod/standard.json — so the patient app
  // resolves it relative to its own page URL, which always works regardless
  // of base path.
  const appRoot = (typeof window !== 'undefined') ? getAppRoot() : '/';

  // Configs marked dev:true are only loaded in development (import.meta.env.DEV).
  // In production builds they are skipped entirely — not loaded, not shown.
  const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
  const activeConfigs = manifest.configs.filter(entry => !entry.dev || IS_DEV);

  const results = await Promise.allSettled(
    activeConfigs.map(entry => {
      // Build absolute fetch URL: appRoot (e.g. http://localhost:4173/madad/)
      // + path without leading slash (e.g. configs/prod/standard.json)
      const pathNoSlash = entry.url.startsWith('/') ? entry.url.slice(1) : entry.url;
      const fetchUrl = appRoot + pathNoSlash;
      // sourceUrl stored without leading slash — resolves correctly from any page
      const sourceUrl = pathNoSlash;

      return loadConfig([fetchUrl])
        .then(config => ({ entry: { ...entry, url: sourceUrl }, config }))
        .catch(err => { err.url = fetchUrl; return Promise.reject(err); });
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      const err = result.reason;
      const url = err?.url ?? '(לא ידוע)';
      console.error('[composer-loader] failed to load config:', url, err);
      // Surface validation details so the author can act on them
      const detail = err?.validationErrors
        ? err.validationErrors.slice(0, 2).map(e => `${e.instancePath || '/'}: ${e.message}`).join('; ')
        : err?.message ?? '';
      state.warnings.push(`לא ניתן לטעון: ${url}${detail ? ` — ${detail}` : ''}`);
      continue;
    }

    const { entry, config } = result.value;

    // Convert the internal path to a short name for use in patient URLs.
    // entry.url is e.g. 'configs/prod/standard.json' → shortName is 'standard'.
    // External URLs are stored as-is.
    const shortName = toShortName(entry.url);

    for (const b of config.batteries) {
      state.batteries.push({ id: b.id, title: b.title, description: b.description ?? '', keywords: b.keywords ?? [], sourceUrl: shortName, hidden: !!entry.hidden });
      state.sourceByItem.set(b.id, shortName);
    }
    for (const q of config.questionnaires) {
      state.questionnaires.push({ id: q.id, title: q.title, description: q.description ?? '', keywords: q.keywords ?? [], sourceUrl: shortName, hidden: !!entry.hidden });
      state.sourceByItem.set(q.id, shortName);
    }

    // Record declared dependencies so buildUrl can include them automatically.
    // Both the key (this config's short name) and the values (dependency short names)
    // must be in short-name form so buildUrl's sourceByItem lookups match correctly.
    const deps = (config.dependencies ?? []).map(dep => {
      const noSlash = dep.startsWith('/') ? dep.slice(1) : dep;
      return toShortName(noSlash);
    });
    if (deps.length) {
      state.dependenciesBySource.set(shortName, deps);
    }
  }
}
