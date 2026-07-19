// composer-loader.js
// Fetches the generated catalog index and populates composer state.
//
// The catalog (public/composer/catalog.json, generated from the config files
// by scripts/build-catalog.mjs) is the composer's only data source — the
// composer never downloads full configs. Each entry carries what the picker
// needs (id, title, description, keywords, taxonomy meta, item count, time
// estimate) plus a `source` token: the exact value that goes into the
// `configs=` parameter of generated patient URLs.
//
// Cross-config dependencies are not the composer's concern: the patient app's
// loadConfig auto-fetches each config's declared "dependencies" at runtime
// (BFS walk in shared/config/loader.js), so generated URLs list only the
// selected items' sources.
//
// Regenerate after editing configs: `npm run build:catalog`.

import { state, CATALOG_URL } from './composer-state.js';
import { CATALOG_VERSION } from '../../shared/catalog/build-catalog.js';

export { CATALOG_VERSION };

export async function loadCatalog() {
  // cache: 'no-cache' — the catalog is a mutable, unhashed file; revalidate
  // with the server so a fresh bundle never pairs with a stale catalog.
  // Same reasoning as the config fetch in shared/config/loader.js.
  const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`שגיאה בטעינת קטלוג השאלונים: HTTP ${res.status}`);
  return res.json();
}

// applyCatalog populates state from a parsed catalog. Pure state population —
// no fetching — so tests can drive it with literal catalog objects.
export function applyCatalog(catalog) {
  // Entries from dev sources are only shown in development (import.meta.env.DEV).
  // In production builds they are skipped entirely — same semantics as the
  // manifest-era dev flag.
  const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

  if (catalog.catalogVersion !== CATALOG_VERSION) {
    state.warnings.push(
      `גרסת קטלוג לא תואמת (${catalog.catalogVersion ?? '?'}) — ייתכן שהתצוגה חלקית. רעננו את הדף.`
    );
  }

  for (const entry of catalog.entries ?? []) {
    if (entry.dev && !IS_DEV) continue;
    const item = {
      ...entry,
      description: entry.description ?? '',
      keywords: entry.keywords ?? [],
      // sourceUrl and hidden are the fields the current render layer reads;
      // hidden configs are already excluded at catalog build time.
      sourceUrl: entry.source,
      hidden: false,
    };
    if (entry.kind === 'battery') {
      state.batteries.push(item);
    } else {
      state.questionnaires.push(item);
    }
    state.sourceByItem.set(entry.id, entry.source);
  }
}
