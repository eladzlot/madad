// App entry point.
// Reads URL params, loads config, hands off to controller.

import { loadConfig } from './config/loader.js';
import { createController } from './controller.js';
import { createOrchestrator } from './engine/orchestrator.js';
import './components/item-likert.js';
import './components/item-instructions.js';
import './components/app-shell.js';
import './components/progress-bar.js';

const DEFAULT_CONFIG  = 'prod/standard';
const DEFAULT_BATTERY = 'standard_intake';

async function main() {
  const params    = new URLSearchParams(location.search);
  const configSrc = params.get('config')  ?? DEFAULT_CONFIG;
  const batteryId = params.get('battery') ?? DEFAULT_BATTERY;

  const container = document.getElementById('app');

  // Show loading state
  container.innerHTML = `<div class="content-column" style="direction:rtl">טוען...</div>`;

  try {
    const config = await loadConfig([configSrc]);
    container.innerHTML = '';
    const controller = createController(container);
    controller.start(config, batteryId, { createOrchestrator });
  } catch (err) {
    container.innerHTML = `
      <div class="content-column" style="direction:rtl; color: var(--color-no)">
        <p>שגיאה בטעינת התצורה.</p>
        <pre style="font-size:12px; margin-top:1rem">${err.message}</pre>
      </div>
    `;
    console.error(err);
  }
}

main();
