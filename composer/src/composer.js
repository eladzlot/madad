// composer.js — composition root for the Composer tool (/composer/).
//
// Wiring only: load the generated catalog index, seed one reactive store, and
// mount <composer-app>. The store owns all state; the components render it.
// Excluded from unit coverage (like aggregate.js) — the e2e suite exercises the
// boot path end to end.

// Styles bundled by Vite. A separate hashed CSS file is emitted in dist/assets/
// and the build injects a <link> into composer/index.html automatically.
import './composer.css';

import { adoptClinicianStyles } from '../../clinician/styles/clinician-styles.js';
import { loadCatalog, CATALOG_VERSION } from './composer-loader.js';
import { createStore } from './composer-store.js';
import './components/composer-app.js';

adoptClinicianStyles();

const root = document.getElementById('composer-app');

async function main() {
  root.innerHTML = '<div class="c-loading"><p>טוען…</p></div>';

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    root.textContent = '';
    const el = document.createElement('div');
    el.className = 'c-error';
    el.innerHTML = '<p>שגיאה בטעינת הגדרות המחולל.</p>';
    const pre = document.createElement('pre');
    pre.style.fontSize = '12px';
    pre.textContent = err.message;
    el.appendChild(pre);
    root.appendChild(el);
    return;
  }

  const store = createStore();
  store.ingestCatalog(catalog, { catalogVersion: CATALOG_VERSION });

  const app = document.createElement('composer-app');
  app.store = store;
  root.textContent = '';
  root.appendChild(app);
}

main();
