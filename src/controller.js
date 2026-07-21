import { generateReport } from './pdf/report.js';
import { score } from './engine/scoring.js';
import { evaluateAlerts } from './engine/alerts.js';
import { tagForType, canAdvance, autoAdvances } from '../shared/config/item-types.js';
import { resolveItemOptions } from '../shared/config/options.js';

// Controller — wires orchestrator + engine to Lit components.
// See RENDER_SPEC.md §2.
//
// Usage:
//   const controller = createController(container, router);
//   controller.start(config, source, { createOrchestrator });
//   source: { sequence: BatteryNode[] }
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
  return { ...item, options: resolveItemOptions(item, questionnaire) };
}

function resolveItem(item, context) {
  return resolveOptions(item, context);
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
  let _sessionState  = null;  // saved when onSessionComplete fires; used by showResults

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
    // Cancel any pending auto-advance. A rapid tap+swipe could otherwise fire
    // engine.advance() after the back navigation has already repositioned the engine.
    clearTimeout(_advanceTimer);

    if (screen === 'welcome') {
      location.reload();
      return;
    }

    // Leaving the results screen to review/edit answers. Scores are recomputed
    // from the current answers whenever the results screen is re-entered
    // (showResults), so back-navigation is safe — no lock required.
    const resultsEl = _shellEl?.querySelector('results-screen');
    if (resultsEl) {
      resultsEl.remove();
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
    if (screen === 'complete') {
      if (!_shellEl?.querySelector('results-screen')) {
        if (_itemEl) { _itemEl.remove(); _itemEl = null; }
        if (_progressEl) { _progressEl.remove(); _progressEl = null; }
        showResults();
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

  // Recompute scores and alerts for every answered questionnaire from the
  // current answers, writing them back into the session state. Runs on every
  // entry to the results screen so the displayed scores — and the PDF, which
  // reads the same session-state snapshot — always reflect the latest edits.
  // Scoring and alert evaluation are pure functions of (questionnaire, answers),
  // so this cannot diverge from what a fresh engine would produce. Note: this
  // re-scores the questionnaires that were answered; it does not re-derive which
  // questionnaires a battery includes (branch membership is fixed at the moment
  // each if-node was evaluated during the forward walk).
  function recomputeDerived(sessionState) {
    if (!sessionState || !_config) return;
    const answersByKey = sessionState.answers ?? {};
    sessionState.scores = sessionState.scores ?? {};
    sessionState.alerts = sessionState.alerts ?? {};
    for (const key of Object.keys(answersByKey)) {
      const qId = sessionState.questionnaireIds?.[key] ?? key;
      const q   = _config.questionnaires.find(x => x.id === qId);
      if (!q) continue;
      const sc = score(q, answersByKey[key]);
      sessionState.scores[key] = sc;
      sessionState.alerts[key] = evaluateAlerts(q, answersByKey[key], sc);
    }
  }

  // Mount (or remount) the results screen. The session is NOT locked: the shell
  // back button and swipe-back stay live so the patient can return to review or
  // change answers. Re-entering the results screen (via forward navigation)
  // recomputes scores/alerts, so consistency between the shown score and the PDF
  // is guaranteed by recomputation, not by refusing further edits.
  function showResults() {
    const existing = _shellEl?.querySelector('results-screen');
    if (existing) existing.remove();

    recomputeDerived(_sessionState);

    _shellEl.canGoBack    = true;
    _shellEl.canGoForward = false;
    // Briefly disable gestures to absorb any trailing touch from the last answer,
    // then re-enable so the patient can swipe back from the results screen.
    _shellEl.gesturesEnabled = false;
    setTimeout(() => { if (_shellEl) _shellEl.gesturesEnabled = true; }, 400);

    const results = Object.entries(_sessionState?.scores ?? {}).map(([key, scoreResult]) => {
      // Resolve questionnaire via the orchestrator's sessionKey → questionnaireId
      // map. Falls back to treating the key as a questionnaireId for older
      // callers (tests) that may not populate questionnaireIds.
      const qId = _sessionState?.questionnaireIds?.[key] ?? key;
      const q   = _config.questionnaires.find(q => q.id === qId);
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
      const { blob, filename } = await generateReport(_sessionState, _config, _session);
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const doShare = async () => {
      const { blob, filename } = await generateReport(_sessionState, _config, _session);
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

  // Called after engineCrossBack positions the engine on the previous
  // questionnaire's last item. The engine is already pointing at the right
  // item — we must NOT advance, only mount. Advancing here would move past
  // the last item, return null, trigger engineComplete, and re-enter the
  // next questionnaire (the cross-back round-trip bug).
  function onQuestionnaireResume(engine, sessionKey, questionnaire) {
    _engine = engine;
    _questionnaire = questionnaire;

    const current = engine.currentItem();
    if (current === null) {
      // Defensive: an empty questionnaire somehow being resumed. Treat as
      // already complete and let the orchestrator move on.
      _orchestrator.engineComplete();
      return;
    }
    router.push('q');
    mountItem(current);
  }

  function onSessionComplete(sessionState) {
    _sessionState = sessionState;
    if (_itemEl) { _itemEl.remove(); _itemEl = null; }
    if (_progressEl) { _progressEl.remove(); _progressEl = null; }

    router.push('complete');

    // Show results directly — patient can still go back to review/change answers.
    showResults();
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

  // source: { sequence: BatteryNode[] }
  function start(config, source, { createOrchestrator, session = {} } = {}) {
    _config  = config;
    _session = session;
    router.onBack(_onPopBack);
    router.onForward(_onPopForward);
    mountShell();
    _orchestrator = createOrchestrator(config, source, {
      onQuestionnaireStart,
      onQuestionnaireResume,
      onSessionComplete,
      onError,
    });
    _orchestrator.start();
  }

  return { start };
}
