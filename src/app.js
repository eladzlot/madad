// app.js — entry point.
//
// URL model:
//   ?items=<id>,<id>&pid=<pid>
//
//   items    — comma-separated ordered list of questionnaire IDs or battery IDs.
//              Required. Error shown if absent.
//   pid      — optional patient identifier.
//
// Item IDs are addresses: every questionnaire/battery lives in its own config
// file at configs/prod/<id>.json, so the config sources ARE the item tokens.
// Battery files declare `dependencies` on the questionnaire files they
// reference; loadConfig auto-fetches those (BFS walk).
//
// A legacy `configs=` parameter (bundle-era URLs named config files explicitly,
// e.g. configs=standard,intake) is deliberately IGNORED: the files it named no
// longer exist, but such URLs' item tokens resolve on their own. Do not fetch
// what it lists.
//
// Resolution:
//   Each token in `items` is resolved as:
//     1. Battery ID (expands its sequence, preserving control flow)
//     2. Questionnaire ID (wrapped as { questionnaireId: token })
//   Ambiguous tokens (exist in both maps, or conflicted across configs) throw
//   an ItemResolutionError, which is shown as a pre-welcome error screen.

import { loadConfig, ConfigFetchError } from '../shared/config/loader.js';
import { resolveItems } from './resolve-items.js';
import { createController } from './controller.js';
import { createOrchestrator } from './engine/orchestrator.js';
import { createRouter } from './router.js';
import { preloadPdf } from './pdf/report.js';
import { sanitizePid } from '../shared/pid.js';
import './components/item-select.js';
import './components/item-binary.js';
import './components/item-instructions.js';
import './components/item-text.js';
import './components/item-slider.js';
import './components/item-multiselect.js';
import './components/app-shell.js';
import './components/progress-bar.js';
import './components/welcome-screen.js';
import './components/results-screen.js';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

// Static error icon, built with DOM APIs (no HTML string) so nothing in this
// function ever routes a caller-supplied string through an HTML parser.
function errorIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: '48', height: '48', viewBox: '0 0 24 24', 'aria-hidden': 'true',
    fill: 'none', stroke: 'var(--color-no)', 'stroke-width': '1.5',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  })) svg.setAttribute(k, v);

  const shape = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  svg.append(
    shape('circle', { cx: '12', cy: '12', r: '10' }),
    shape('line',   { x1: '12', y1: '8',  x2: '12',    y2: '12' }),
    shape('line',   { x1: '12', y1: '16', x2: '12.01', y2: '16' }),
  );
  return svg;
}

export function showError(container, message, detail = '', { retryable = false } = {}) {
  const hintText = detail || 'אנא פנה למטפל שלך לקבלת קישור חדש.';

  // Built entirely with DOM APIs. `message` and `detail` reach the page only
  // via textContent, so crafted URL parameters can never inject markup even if
  // a future caller forwards user input here.
  const wrap = document.createElement('div');
  wrap.className = 'boot-screen';
  wrap.setAttribute('role', 'alert');
  wrap.appendChild(errorIcon());

  const title = document.createElement('p');
  title.className = 'boot-screen__title';
  title.textContent = message;
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'boot-screen__hint';
  hint.textContent = hintText;
  wrap.appendChild(hint);

  if (retryable) {
    const btn = document.createElement('button');
    btn.className = 'boot-screen__retry';
    btn.dataset.action = 'retry';
    btn.textContent = 'נסה שוב';
    btn.addEventListener('click', () => location.reload());
    wrap.appendChild(btn);
  }

  container.innerHTML = '';
  container.appendChild(wrap);
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Reads the patient identifier, preferring the URL fragment (`#pid=…`, the form
// the composer now generates — keeps the pid out of the request line, and thus
// out of server/CDN logs and the Referer header) and falling back to the query
// string (`?pid=…`) so links generated before the switch keep working.
export function readPid(loc = location) {
  const hash = loc.hash?.startsWith('#') ? loc.hash.slice(1) : (loc.hash ?? '');
  const fromHash = new URLSearchParams(hash).get('pid');
  if (fromHash !== null) return fromHash;
  return new URLSearchParams(loc.search).get('pid');
}

async function main() {
  const params = new URLSearchParams(location.search);

  const itemsParam = params.get('items');
  // PID validation lives in shared/pid.js — single source of truth shared with the composer.
  // Invalid PIDs are silently treated as absent rather than surfaced in error messages,
  // to avoid reflecting crafted strings back into the UI.
  const pid = sanitizePid(readPid());

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

  // Item IDs are addresses: each token's config file is configs/prod/<token>.json.
  // Deduplicate (repeated items are a URL author error, not two fetches).
  const configSources = [...new Set(itemTokens)];

  showLoading(container);

  // Load config(s)
  let config;
  try {
    config = await loadConfig(configSources);
  } catch (err) {
    // Three failure modes, three messages:
    //   • timeout                  → connection issue, suggest retry
    //   • HTTP 4xx/5xx              → broken link or server problem, contact therapist
    //   • network error / other     → ambiguous, suggest both
    // The previous code conflated all three into "check your internet", which
    // sent patients hunting for a connection problem when the real cause was
    // a broken URL — which they cannot fix and their therapist needs to know about.
    let title = 'לא ניתן לטעון את השאלון.';
    let detail;
    if (err instanceof ConfigFetchError && err.timedOut) {
      detail = 'הבקשה ארכה זמן רב מדי. בדוק את חיבור האינטרנט ונסה שנית.';
    } else if (err instanceof ConfigFetchError && err.httpStatus !== null) {
      title  = 'הקישור שגוי או שאינו זמין.';
      detail = 'אנא פנה למטפל שלך לקבלת קישור חדש.';
    } else {
      detail = 'בדוק את חיבור האינטרנט ונסה שנית, או פנה למטפל לקבלת קישור חדש.';
    }
    showError(container, title, detail, { retryable: true });
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
