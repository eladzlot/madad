import { generateReport } from './pdf/report.js';
import { tagForType, canAdvance, autoAdvances } from './item-types.js';

// Controller — wires orchestrator + engine to Lit components.
// See RENDER_SPEC.md §2.
//
// Usage:
//   const controller = createController(container, router);
//   controller.start(config, source, { createOrchestrator });
//   source: { batteryId: string } | { sequence: BatteryNode[] }
//
// Components must be registered before calling start() — import them in app.js.
//
// Navigation model:
//   All back and forward navigation routes through history.back() /
//   history.forward() → popstate → router handlers. Shell 'back' and 'forward'
//   events call history.back/forward() — they never call the engine directly.
//   This keeps the history stack in sync at all times.

const ADVANCE_DELAY_MS = 150;

// ── Item resolution ───────────────────────────────────────────────────────────

function resolveOptions(item, { questionnaire }) {
  if (item.type !== 'select' && item.type !== 'binary') return item;
  if (item.options) return item;
  const setId = item.optionSetId ?? questionnaire.defaultOptionSetId;
  const options = questionnaire.optionSets?.[setId] ?? [];
  return { ...item, options };
}

function resolveItem(item, context) {
  return [resolveOptions].reduce((it, fn) => fn(it, context), item);
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createController(container, router) {
  let _orchestrator  = null;
  let _engine        = null;
  let _questionnaire = null;
  let _config        = null;
  let _shellEl       = null;
  let _progressEl    = null;  // <progress-bar> in shell header
  let _itemEl        = null;
  let _advanceTimer  = null;
  let _session       = null;
  let _locked        = false; // true once patient proceeds to results screen

  // ── Shell setup ──────────────────────────────────────────────────────────

  function mountShell() {
    _shellEl = document.createElement('app-shell');
    _shellEl.canGoBack    = false;
    _shellEl.canGoForward = false;
    _shellEl.addEventListener('back', () => history.back());
    // Delegate to history for already-answered items (back-nav replay).
    // For skippable items with no answer yet, there's no forward history entry,
    // so we trigger onAdvance() directly instead.
    _shellEl.addEventListener('forward', () => {
      const item = _engine?.currentItem();
      const answer = item ? _engine.answers()[item.id] : null;
      if (item && canAdvance(item, answer) && answer == null) {
        onAdvance();
      } else {
        history.forward();
      }
    });

    _progressEl = document.createElement('progress-bar');
    _progressEl.slot = 'progress';
    _shellEl.appendChild(_progressEl);

    container.appendChild(_shellEl);
    return _shellEl;
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function getOrCreateItemEl(tag) {
    // Always create a fresh element. Reusing the same DOM node carries over
    // the browser's touch/hover tracking state, causing ghost highlights on
    // the incoming question when the previous tap's synthetic events fire.
    if (_itemEl) _itemEl.remove();
    _itemEl = document.createElement(tag);
    _itemEl.addEventListener('answer', onAnswer);
    _itemEl.addEventListener('advance', onAdvance);
    _itemEl.classList.add('item-entering');
    _shellEl.appendChild(_itemEl);
    return _itemEl;
  }

  function updateNav() {
    if (!_shellEl || !_engine) return;
    const item = _engine.currentItem();
    const answer = item ? _engine.answers()[item.id] : null;
    _shellEl.canGoBack    = _engine.canGoBack() || _orchestrator?.currentEngine?.() !== _engine;
    _shellEl.canGoForward = !!item && canAdvance(item, answer) && !_engine.isComplete();

    if (_progressEl) {
      _progressEl.itemProgress      = _engine.progress();
      _progressEl.batteryProgress   = _orchestrator.progress();
      _progressEl.questionnaireName = _questionnaire?.title ?? '';
    }
  }

  function mountItem(item) {
    const tag = tagForType(item.type);
    const resolved = resolveItem(item, { questionnaire: _questionnaire });
    const el = getOrCreateItemEl(tag);
    el.selected = null;
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
    const delay = autoAdvances(_engine?.currentItem()) ? ADVANCE_DELAY_MS : 0;
    _advanceTimer = setTimeout(() => {
      const next = _engine.advance();
      if (next === null) {
        _orchestrator.engineComplete();
      } else {
        router.push('q');
        mountItem(next);
      }
    }, delay);
  }

  // ── popstate handlers ────────────────────────────────────────────────────

  function _onPopBack(screen) {
    if (_locked) return;

    if (screen === 'welcome') {
      location.reload();
      return;
    }

    const completionEl = _shellEl?.querySelector('completion-screen');
    if (completionEl) {
      completionEl.remove();
      if (_shellEl) _shellEl.gesturesEnabled = true;
    }

    if (!_engine) return;

    if (_engine.canGoBack()) {
      mountItem(_engine.back());
    } else {
      _orchestrator.engineCrossBack();
    }
  }

  function _onPopForward(screen) {
    if (_locked) return;

    if (screen === 'complete') {
      if (!_shellEl?.querySelector('completion-screen')) {
        if (_itemEl) { _itemEl.remove(); _itemEl = null; }
        if (_progressEl) { _progressEl.remove(); _progressEl = null; }
        _shellEl.canGoBack    = true;
        _shellEl.canGoForward = false;
        _shellEl.gesturesEnabled = true;
        const completionEl = document.createElement('completion-screen');
        _shellEl.appendChild(completionEl);
        completionEl.addEventListener('view-results', _onViewResults, { once: true });
      }
      return;
    }

    if (screen === 'q') {
      if (!_engine?.currentItem()) return;
      const item = _engine.currentItem();
      const answer = _engine.answers()[item.id];
      if (!canAdvance(item, answer)) return;
      clearTimeout(_advanceTimer);
      const delay = autoAdvances(item) ? ADVANCE_DELAY_MS : 0;
      _advanceTimer = setTimeout(() => {
        const next = _engine.advance();
        if (next === null) {
          _orchestrator.engineComplete();
        } else {
          mountItem(next);
        }
      }, delay);
    }
  }

  function _onViewResults(sessionState) {
    const completionEl = _shellEl?.querySelector('completion-screen');
    if (completionEl) completionEl.remove();

    _locked = true;
    router.replace('results');
    _shellEl.canGoBack    = false;
    _shellEl.canGoForward = false;

    const results = Object.entries((sessionState ?? {}).scores ?? {}).map(([key, scoreResult]) => {
      const q = _config.questionnaires.find(q => q.id === key || key.startsWith(q.id));
      return {
        title:    q?.title ?? key,
        total:    scoreResult?.total ?? null,
        category: scoreResult?.category ?? null,
      };
    });

    // Show share button if the browser has Web Share API.
    // Note: navigator.share is only available over HTTPS — on HTTP it is undefined.
    const canShareFiles = !!(navigator.share);

    const doDownload = async () => {
      const { blob, filename } = await generateReport(sessionState, _config, _session);
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const doShare = async () => {
      const { blob, filename } = await generateReport(sessionState, _config, _session);
      try {
        await navigator.share({
          files: [new File([blob], filename, { type: 'application/pdf' })],
          title: filename,
        });
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        // Share failed — fall through to download
        await doDownload();
      }
    };

    const resultsEl = document.createElement('results-screen');
    resultsEl.results    = results;
    resultsEl.canShare   = canShareFiles;
    resultsEl.onDownload = doDownload;
    resultsEl.onShare    = canShareFiles ? doShare : null;
    _shellEl.appendChild(resultsEl);
  }



  // ── Orchestrator callbacks ───────────────────────────────────────────────

  function onQuestionnaireStart(engine, sessionKey, questionnaire) {
    _engine = engine;
    _questionnaire = questionnaire;

    const first = engine.advance();
    if (first === null) {
      _orchestrator.engineComplete();
    } else {
      router.push('q');
      mountItem(first);
    }
  }

  function onSessionComplete(sessionState) {
    if (_itemEl) { _itemEl.remove(); _itemEl = null; }
    if (_progressEl) { _progressEl.remove(); _progressEl = null; }
    if (_shellEl) {
      _shellEl.canGoBack       = true;
      _shellEl.canGoForward    = false;
      // Briefly disable gestures to absorb any trailing touch from the last answer,
      // then re-enable so the patient can swipe back from the completion screen.
      _shellEl.gesturesEnabled = false;
      setTimeout(() => { if (_shellEl) _shellEl.gesturesEnabled = true; }, 400);
    }

    router.push('complete');

    // Mount completion screen — patient can still go back from here
    const completionEl = document.createElement('completion-screen');
    _shellEl.appendChild(completionEl);

    completionEl.addEventListener('view-results', () => _onViewResults(sessionState), { once: true });
  }

  function onError(err) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding: var(--space-lg); direction: rtl; color: var(--color-no)';
    const msg = document.createElement('p');
    msg.textContent = 'אירעה שגיאה: ' + err.message;
    wrap.appendChild(msg);
    container.innerHTML = '';
    container.appendChild(wrap);
    console.error('Controller error:', err);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  // source: { batteryId: string } | { sequence: BatteryNode[] }
  function start(config, source, { createOrchestrator, session = {} } = {}) {
    _config  = config;
    _session = session;
    router.onBack(_onPopBack);
    router.onForward(_onPopForward);
    mountShell();
    _orchestrator = createOrchestrator(config, source, {
      onQuestionnaireStart,
      onSessionComplete,
      onError,
    });
    _orchestrator.start();
  }

  return { start };
}
