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

// ── Loading screen ────────────────────────────────────────────────────────────

export function showLoading(container) {
  container.innerHTML = `
    <div class="boot-screen" role="status" aria-label="טוען שאלון">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="16"
          fill="none" stroke="var(--color-border)" stroke-width="3"/>
        <circle cx="20" cy="20" r="16"
          fill="none" stroke="var(--color-primary)" stroke-width="3"
          stroke-linecap="round" stroke-dasharray="28 72"
          transform-origin="20 20">
          <animateTransform attributeName="transform" type="rotate"
            from="0" to="360" dur="0.9s" repeatCount="indefinite"/>
        </circle>
      </svg>
      <p class="boot-screen__message">טוען שאלון…</p>
    </div>
  `;
}

// ── Error screen ──────────────────────────────────────────────────────────────

export function showError(container, message, detail = '', { retryable = false } = {}) {
  const hintText = detail || 'אנא פנה למטפל שלך לקבלת קישור חדש.';
  const retryBtn = retryable
    ? `<button class="boot-screen__retry" data-action="retry">נסה שוב</button>`
    : '';

  container.innerHTML = `
    <div class="boot-screen" role="alert">
      <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"
        fill="none" stroke="var(--color-no)" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p class="boot-screen__title">${message}</p>
      <p class="boot-screen__hint">${hintText}</p>
      ${retryBtn}
    </div>
  `;

  if (retryable) {
    container.querySelector('[data-action="retry"]')
      .addEventListener('click', () => location.reload());
  }
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

  showLoading(container);

  // Load config(s)
  let config;
  try {
    config = await loadConfig(configSources);
  } catch (err) {
    const detail = err.timedOut
      ? 'הבקשה ארכה זמן רב מדי. בדוק את חיבור האינטרנט ונסה שנית.'
      : 'בדוק את חיבור האינטרנט ונסה שנית, או פנה למטפל לקבלת קישור חדש.';
    showError(
      container,
      'לא ניתן לטעון את השאלון.',
      detail,
      { retryable: true },
    );
    console.error(err);
    return;
  }

  // Resolve items to a sequence
  let sequence;
  try {
    sequence = resolveItems(itemTokens, config);
  } catch (err) {
    showError(
      container,
      'הקישור שגוי או פג תוקף.',
      'אנא פנה למטפל שלך לקבלת קישור חדש.',
    );
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

if (document.getElementById('app')) {
  main();
}
