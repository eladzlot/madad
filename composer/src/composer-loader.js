// composer-loader.js — fetches the generated catalog index.
//
// The catalog (public/composer/catalog.json, generated from the config files by
// scripts/build-catalog.mjs) is the composer's only data source — the composer
// never downloads full configs. Each entry carries what the picker needs: id,
// title, description, keywords, taxonomy meta, item count, time estimate.
//
// Ingestion (populating the store, dev-filtering, version-skew warning) lives in
// composer-store.js. This module is just the network seam.
//
// Regenerate after editing configs: `npm run build:catalog`.

import { CATALOG_URL } from './composer-state.js';
import { CATALOG_VERSION } from '../../shared/catalog/build-catalog.js';

export { CATALOG_VERSION, CATALOG_URL };

export async function loadCatalog() {
  // cache: 'no-cache' — the catalog is a mutable, unhashed file; revalidate with
  // the server so a fresh bundle never pairs with a stale catalog. Same
  // reasoning as the config fetch in shared/config/loader.js.
  const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`שגיאה בטעינת קטלוג השאלונים: HTTP ${res.status}`);
  return res.json();
}
