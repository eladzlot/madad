// composer-loader.js
// Fetches the manifest and loads all listed configs.
// Failures are partial — warns and continues rather than halting.

import { loadConfig } from '/src/config/loader.js';
import { state, MANIFEST_URL } from './composer-state.js';

export async function loadManifest() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`שגיאה בטעינת המניפסט: HTTP ${res.status}`);
  return res.json();
}

export async function loadAllConfigs(manifest) {
  const results = await Promise.allSettled(
    manifest.configs.map(entry =>
      loadConfig([entry.url]).then(config => ({ entry, config }))
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      const url = result.reason?.url ?? '(לא ידוע)';
      state.warnings.push(`לא ניתן לטעון: ${url}`);
      continue;
    }

    const { entry, config } = result.value;

    for (const b of config.batteries) {
      state.batteries.push({ id: b.id, title: b.title, description: b.description ?? '', sourceUrl: entry.url });
      state.sourceByItem.set(b.id, entry.url);
    }
    for (const q of config.questionnaires) {
      state.questionnaires.push({ id: q.id, title: q.title, description: q.description ?? '', sourceUrl: entry.url });
      state.sourceByItem.set(q.id, entry.url);
    }
  }
}
