// app.js — entry point.
//
// URL model:
//   ?configs=<src>,<src>&items=<id>,<id>&pid=<pid>
//
//   configs  — comma-separated config sources (slugs or URLs).
//              Default: 'prod/standard' when omitted.
//   items    — comma-separated ordered list of questionnaire IDs or battery IDs.
//              Required. Error shown if absent.
//   pid      — optional patient identifier.
//
// Resolution:
//   Each token in `items` is resolved as:
//     1. Battery ID (expands its sequence, preserving control flow)
//     2. Questionnaire ID (wrapped as { questionnaireId: token })
//   Ambiguous tokens (exist in both maps, or conflicted across configs) throw
//   an ItemResolutionError, which is shown as a pre-welcome error screen.

import { loadConfig } from './config/loader.js';
import { resolveItems } from './resolve-items.js';
import { createController } from './controller.js';
import { createOrchestrator } from './engine/orchestrator.js';
import { createRouter } from './router.js';
import { preloadPdf } from './pdf/report.js';
import './components/item-select.js';
import './components/item-binary.js';
import './components/item-instructions.js';
import './components/item-text.js';
import './components/item-slider.js';
import './components/item-multiselect.js';
import './components/app-shell.js';
import './components/progress-bar.js';
import './components/welcome-screen.js';
import './components/completion-screen.js';
import './components/results-screen.js';

const DEFAULT_CONFIG = 'prod/standard';

// ── Error screen ──────────────────────────────────────────────────────────────

function showError(container, message, detail = '') {
  const wrap = document.createElement('div');
  wrap.className = 'content-column';
  wrap.style.cssText = 'direction:rtl; color: var(--color-no)';

  const msg = document.createElement('p');
  msg.textContent = message;
  wrap.appendChild(msg);

  if (detail) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'font-size:12px; margin-top:1rem; white-space:pre-wrap';
    pre.textContent = detail;
    wrap.appendChild(pre);
  }

  container.innerHTML = '';
  container.appendChild(wrap);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const params = new URLSearchParams(location.search);

  const configsParam = params.get('configs');
  const itemsParam   = params.get('items');
  const pidRaw = params.get('pid') ?? null;
  // Validate PID: alphanumeric, Hebrew chars, hyphen, underscore, max 64 chars.
  // Reject silently (treat as absent) to avoid leaking crafted values into error messages.
  const PID_PATTERN = /^[a-zA-Z0-9\u0590-\u05FF_-]{1,64}$/;
  const pid = pidRaw && PID_PATTERN.test(pidRaw) ? pidRaw : null;

  const configSources = configsParam
    ? configsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [DEFAULT_CONFIG];

  const container = document.getElementById('app');

  // `items` is required — show error before welcome screen if missing
  if (!itemsParam) {
    showError(container, 'לא נבחרו שאלונים.', 'יש לפתוח את הקישור שקיבלת מהמטפל.');
    return;
  }

  const itemTokens = itemsParam.split(',').map(s => s.trim()).filter(Boolean);

  if (itemTokens.length === 0) {
    showError(container, 'לא נבחרו שאלונים.', 'יש לפתוח את הקישור שקיבלת מהמטפל.');
    return;
  }

  container.innerHTML = `<div class="content-column" style="direction:rtl">טוען...</div>`;

  // Load config(s)
  let config;
  try {
    config = await loadConfig(configSources);
  } catch (err) {
    showError(container, 'שגיאה בטעינת התצורה.', err.message);
    console.error(err);
    return;
  }

  // Resolve items to a sequence
  let sequence;
  try {
    sequence = resolveItems(itemTokens, config);
  } catch (err) {
    showError(container, 'שגיאה בבניית מפגש השאלונים.', err.message);
    console.error(err);
    return;
  }

  // Preload PDF in background
  preloadPdf();

  const router = createRouter();
  router.replace('welcome');

  container.innerHTML = '';
  const welcome = document.createElement('welcome-screen');
  welcome.batteryTitle = '';
  container.appendChild(welcome);

  welcome.addEventListener('begin', (e) => {
    const session = { name: e.detail.name, pid };
    welcome.remove();

    const controller = createController(container, router);
    controller.start(config, { sequence }, { createOrchestrator, session });
  }, { once: true });
}

main();
