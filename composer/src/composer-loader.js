// composer-loader.js
// Fetches the manifest and loads all listed configs.
// Failures are partial — warns and continues rather than halting.

import { loadConfig } from '/src/config/loader.js';
import { state, MANIFEST_URL, getAppRoot } from './composer-state.js';

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

    for (const b of config.batteries) {
      state.batteries.push({ id: b.id, title: b.title, description: b.description ?? '', keywords: b.keywords ?? [], sourceUrl: entry.url, hidden: !!entry.hidden });
      state.sourceByItem.set(b.id, entry.url);
    }
    for (const q of config.questionnaires) {
      state.questionnaires.push({ id: q.id, title: q.title, description: q.description ?? '', keywords: q.keywords ?? [], sourceUrl: entry.url, hidden: !!entry.hidden });
      state.sourceByItem.set(q.id, entry.url);
    }

    // Record declared dependencies so buildUrl can include them automatically
    const deps = (config.dependencies ?? []).map(dep =>
      dep.startsWith('/') ? dep.slice(1) : dep
    );
    if (deps.length) {
      state.dependenciesBySource.set(entry.url, deps);
    }
  }
}
