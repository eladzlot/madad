// Controller — wires orchestrator + engine to Lit components.
// See RENDER_SPEC.md §2.
//
// Usage:
//   const controller = createController(container);
//   controller.start(config, batteryId, { createOrchestrator });
//
// Components must be registered before calling start() — import them in app.js.

const ADVANCE_DELAY_MS = 150;

// ── Item resolution ───────────────────────────────────────────────────────────

function resolveOptions(item, { questionnaire }) {
  if (item.type !== 'likert' && item.type !== 'binary') return item;
  if (item.options) return item;
  const setId = item.optionSetId ?? questionnaire.defaultOptionSetId;
  const options = questionnaire.optionSets?.[setId] ?? [];
  return { ...item, options };
}

function resolveItem(item, context) {
  return [resolveOptions].reduce((it, fn) => fn(it, context), item);
}

// ── Component tag by item type ────────────────────────────────────────────────

const TAG_BY_TYPE = {
  likert:       'item-likert',
  binary:       'item-binary',
  instructions: 'item-instructions',
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createController(container) {
  let _orchestrator = null;
  let _engine       = null;
  let _questionnaire = null;
  let _config       = null;
  let _shellEl      = null;
  let _progressEl   = null;  // <progress-bar> in shell header
  let _itemEl       = null;
  let _advanceTimer = null;

  let _session      = null;

  // ── Shell setup ──────────────────────────────────────────────────────────

  function mountShell() {
    _shellEl = document.createElement('app-shell');
    _shellEl.canGoBack    = false;
    _shellEl.canGoForward = false;
    _shellEl.addEventListener('back',    onBack);
    _shellEl.addEventListener('forward', onForward);

    _progressEl = document.createElement('progress-bar');
    _progressEl.slot = 'progress';
    _shellEl.appendChild(_progressEl);

    container.appendChild(_shellEl);
    return _shellEl;
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function getOrCreateItemEl(tag) {
    if (_itemEl && _itemEl.tagName.toLowerCase() === tag) return _itemEl;
    if (_itemEl) _itemEl.remove();
    _itemEl = document.createElement(tag);
    _itemEl.addEventListener('answer', onAnswer);
    _itemEl.addEventListener('advance', onAdvance);
    _shellEl.appendChild(_itemEl);
    return _itemEl;
  }

  function updateNav() {
    if (!_shellEl || !_engine) return;
    const item = _engine.currentItem();
    const hasAnswer = item && _engine.answers()[item.id] != null;
    _shellEl.canGoBack    = _engine.canGoBack();
    _shellEl.canGoForward = hasAnswer && !_engine.isComplete();

    if (_progressEl) {
      _progressEl.itemProgress      = _engine.progress();
      _progressEl.batteryProgress   = _orchestrator.progress();
      _progressEl.questionnaireName = _questionnaire?.title ?? '';
    }
  }

  function mountItem(item) {
    const tag = TAG_BY_TYPE[item.type] ?? 'item-likert';
    const resolved = resolveItem(item, { questionnaire: _questionnaire });
    const el = getOrCreateItemEl(tag);
    el.item = resolved;
    el.selected = _engine.answers()[item.id] ?? null;
    updateNav();
  }

  // ── Engine event handlers ────────────────────────────────────────────────

  function onAnswer(e) {
    if (!_engine?.currentItem()) return;
    _engine.recordAnswer(_engine.currentItem().id, e.detail.value);
    if (_itemEl) _itemEl.selected = e.detail.value;
    updateNav();
  }

  function onAdvance() {
    clearTimeout(_advanceTimer);
    // Hide forward button immediately — prevents it flashing during the delay
    if (_shellEl) _shellEl.canGoForward = false;
    const delay = _engine?.currentItem()?.type === 'instructions' ? 0 : ADVANCE_DELAY_MS;
    _advanceTimer = setTimeout(() => {
      const next = _engine.advance();
      if (next === null) {
        _orchestrator.engineComplete();
      } else {
        mountItem(next);
      }
    }, delay);
  }

  function onBack() {
    if (!_engine) return;
    if (_engine.canGoBack()) {
      // Remove completion screen if present
      _shellEl?.querySelector('completion-screen')?.remove();
      // Re-enable gestures
      if (_shellEl) _shellEl.gesturesEnabled = true;
      mountItem(_engine.back());
    } else {
      _orchestrator.engineCrossBack();
    }
  }

  function onForward() {
    // Forward is only available when current item is already answered —
    // fires advance immediately without waiting for an answer event.
    if (!_engine?.currentItem()) return;
    const item = _engine.currentItem();
    if (_engine.answers()[item.id] == null) return;
    onAdvance();
  }

  // ── Orchestrator callbacks ───────────────────────────────────────────────

  function onQuestionnaireStart(engine, sessionKey, questionnaire) {
    _engine = engine;
    _questionnaire = questionnaire;

    const first = engine.advance();
    if (first === null) {
      _orchestrator.engineComplete();
    } else {
      mountItem(first);
    }
  }

  function onSessionComplete(sessionState) {
    if (_itemEl) { _itemEl.remove(); _itemEl = null; }
    if (_progressEl) { _progressEl.remove(); _progressEl = null; }
    if (_shellEl) {
      _shellEl.canGoBack       = true;
      _shellEl.canGoForward    = false;
      _shellEl.gesturesEnabled = false; // prevent overscroll artifacts on completion screen
    }

    // Mount completion screen — patient can still go back from here
    const completionEl = document.createElement('completion-screen');
    _shellEl.appendChild(completionEl);

    completionEl.addEventListener('view-results', () => {
      completionEl.remove();

      // Lock navigation permanently
      _shellEl.canGoBack    = false;
      _shellEl.canGoForward = false;

      // Build results array from session state + config
      const results = Object.entries(sessionState.scores ?? {}).map(([key, scoreResult]) => {
        const q = _config.questionnaires.find(q => q.id === key || key.startsWith(q.id));
        return {
          title: q?.title ?? key,
          total: scoreResult?.total ?? null,
        };
      });

      const resultsEl = document.createElement('results-screen');
      resultsEl.results = results;
      _shellEl.appendChild(resultsEl);
    }, { once: true });
  }

  function onError(err) {
    container.innerHTML = `
      <div style="padding: var(--space-lg); direction: rtl; color: var(--color-no)">
        <p>אירעה שגיאה: ${err.message}</p>
      </div>
    `;
    console.error('Controller error:', err);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function start(config, batteryId, { createOrchestrator, session = {} } = {}) {
    _config  = config;
    _session = session;
    mountShell();
    _orchestrator = createOrchestrator(config, batteryId, {
      onQuestionnaireStart,
      onSessionComplete,
      onError,
    });
    _orchestrator.start();
  }

  return { start };
}
