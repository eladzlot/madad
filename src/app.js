import { loadConfig } from './config/loader.js';
import { createController } from './controller.js';
import { createOrchestrator } from './engine/orchestrator.js';
import './components/item-likert.js';
import './components/item-binary.js';
import './components/item-instructions.js';
import './components/app-shell.js';
import './components/progress-bar.js';
import './components/welcome-screen.js';
import './components/completion-screen.js';
import './components/results-screen.js';

const DEFAULT_CONFIG  = 'prod/standard';
const DEFAULT_BATTERY = 'standard_intake';

async function main() {
  const params    = new URLSearchParams(location.search);
  const configSrc = params.get('config')  ?? DEFAULT_CONFIG;
  const batteryId = params.get('battery') ?? DEFAULT_BATTERY;
  const pid       = params.get('pid')     ?? null;

  const container = document.getElementById('app');

  container.innerHTML = `<div class="content-column" style="direction:rtl">טוען...</div>`;

  let config;
  try {
    config = await loadConfig([configSrc]);
  } catch (err) {
    container.innerHTML = `
      <div class="content-column" style="direction:rtl; color: var(--color-no)">
        <p>שגיאה בטעינת התצורה.</p>
        <pre style="font-size:12px; margin-top:1rem">${err.message}</pre>
      </div>
    `;
    console.error(err);
    return;
  }

  // Find battery title for welcome screen
  const battery = config.batteries.find(b => b.id === batteryId);
  const batteryTitle = battery?.title ?? '';

  // Show welcome screen
  container.innerHTML = '';
  const welcome = document.createElement('welcome-screen');
  welcome.batteryTitle = batteryTitle;
  container.appendChild(welcome);

  // On begin — start session
  welcome.addEventListener('begin', (e) => {
    const session = { name: e.detail.name, pid };
    welcome.remove();

    const controller = createController(container);
    controller.start(config, batteryId, { createOrchestrator, session });
  }, { once: true });
}

main();
