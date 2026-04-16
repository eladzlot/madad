// composer.js — entry point for the Composer tool.
// Bootstraps the app: loads manifest, loads configs, renders UI.

// Styles bundled by Vite. A separate hashed CSS file is emitted in dist/assets/
// and the build injects a <link> tag into composer/index.html automatically.
import './composer.css';

import { loadManifest, loadAllConfigs } from './composer-loader.js';
import { render, injectStyles, initRoot, escapeHtml } from './composer-render.js';
import { initHandlers } from './composer-handlers.js';

const root = document.getElementById('composer-app');

async function main() {
  initRoot(root);
  initHandlers(render);
  injectStyles();

  root.innerHTML = `<div class="c-loading"><p>טוען...</p></div>`;

  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    root.innerHTML = `<div class="c-error"><p>שגיאה בטעינת הגדרות המחולל.</p><pre style="font-size:12px">${escapeHtml(err.message)}</pre></div>`;
    return;
  }

  await loadAllConfigs(manifest);
  render();
}

main();
