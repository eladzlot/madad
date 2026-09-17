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
import { bootLang, t } from '../../clinician/i18n/index.js';
import { loadCatalog, CATALOG_VERSION } from './composer-loader.js';
import { createStore } from './composer-store.js';

adoptClinicianStyles();

const root = document.getElementById('composer-app');

async function main() {
  // Language first: everything below, including the loading and error
  // screens, renders through t(). Components are imported after the strings
  // are in place so no template ever renders with the wrong table.
  const uiLang = await bootLang({ titleKey: 'composer.title' });
  await import('./components/composer-app.js');

  root.textContent = '';
  const loading = document.createElement('div');
  loading.className = 'c-loading';
  const loadingP = document.createElement('p');
  loadingP.textContent = t('composer.loading');
  loading.appendChild(loadingP);
  root.appendChild(loading);

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    root.textContent = '';
    const el = document.createElement('div');
    el.className = 'c-error';
    const p = document.createElement('p');
    p.textContent = t('composer.loadError');
    el.appendChild(p);
    const pre = document.createElement('pre');
    pre.style.fontSize = '12px';
    pre.textContent = err.message;
    el.appendChild(pre);
    root.appendChild(el);
    return;
  }

  const store = createStore({ uiLang });
  store.ingestCatalog(catalog, { catalogVersion: CATALOG_VERSION });

  const app = document.createElement('composer-app');
  app.store = store;
  root.textContent = '';
  root.appendChild(app);
}

main();
