import { t, currentLang } from './i18n/index.js';
import { generateReport } from './pdf/report.js';
import { buildEnvelope } from '../shared/pdf/envelope-schema.js';
import { submitSession } from './remote/api.js';
import { createQuestionnaireTimer } from './questionnaire-timer.js';
import { score } from './engine/scoring.js';
import { evaluateAlerts } from './engine/alerts.js';
import { tagForType, canAdvance, autoAdvances, ratedTextTextKey } from '../shared/config/item-types.js';
import { resolveItemOptions } from '../shared/config/options.js';

// Controller — wires orchestrator + engine to Lit components.
// See RENDER_SPEC.md §2.
//
// Usage:
//   const controller = createController(container, router);
//   controller.start(config, source, { createOrchestrator, session, timer });
//   source: { sequence: BatteryNode[] }
//   timer:  optional questionnaire timer (src/questionnaire-timer.js); defaults
//           to a real-clock one. Injectable so tests can drive the clock.
//
// Components must be registered before calling start() — import them in app.js.
//
// Navigation model:
//   All back and forward navigation routes through history.back() /
//   history.forward() → popstate → router handlers. Shell 'back' and 'forward'
//   events call history.back/forward() — they never call the engine directly.
//   This keeps the history stack in sync at all times.

const ADVANCE_DELAY_MS = 150;

// Remote deployment (REMOTE_SPEC §8.1): post-first. Inlined from package.json
// at build time via Vite `define`, same as report.js.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Built per call, not at module load: t() must read the language the patient
// actually got. The `refused` detail is the only route out of a failed
// submission, so leaving any of these untranslated strands a non-Hebrew
// patient in front of an error they cannot read.
const SEND_STATUS = {
  sending: () => ({ kind: 'info', message: t('send.sending') }),
  sent:    () => ({ kind: 'success', message: t('send.sent'),
                    detail: t('send.sentDetail') }),
  failed:  (retry) => ({ kind: 'error', message: t('send.failed'),
                    detail: t('send.failedDetail'),
                    action: { label: t('send.failedRetry'), onClick: retry } }),
  refused: () => ({ kind: 'error', message: t('send.refused'),
                    detail: t('send.refusedDetail') }),
};

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
  let _send          = { answersJson: null, state: null, inFlight: false, queued: false };   // remote submission memo
  let _sessionKey    = null;  // current questionnaire's session key (for timer re-entry)
  let _timer         = null;  // per-questionnaire wall/focus time — monitoring only

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
    // rated_text stores its free-text half under a sidecar key — rehydrate it too.
    if (item.type === 'rated_text') {
      el.selectedText = _engine.answers()[ratedTextTextKey(item.id)] ?? null;
    }
    updateNav();
  }

  // ── Engine event handlers ────────────────────────────────────────────────

  function onAnswer(e) {
    const item = _engine?.currentItem();
    if (!item) return;
    // The rating (e.detail.value) is the item's canonical scalar answer; the
    // rated_text free-text half rides under a sidecar key so the scoring/alert/
    // envelope pipeline keeps seeing plain scalars.
    _engine.recordAnswer(item.id, e.detail.value);
    if (item.type === 'rated_text') {
      _engine.recordAnswer(ratedTextTextKey(item.id), e.detail.text ?? null);
    }
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
      // Coming back from the results screen re-opens the last questionnaire
      // without an orchestrator callback, so the timer is re-entered here.
      // The cross-back branch below reaches onQuestionnaireResume instead.
      if (resultsEl) _timer?.enter(_sessionKey);
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

    // No questionnaire is on screen: results dwell is charged to none of them.
    _timer?.enter(null);
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

    // Remote deployment: no share button — results are sent, the PDF is a
    // fallback (REMOTE_SPEC §8.1).
    const canShareFiles = false;

    // Timing rides in the embedded data.json only (monitoring); the snapshot
    // is taken at generation time so a later re-download stays current.
    const report = () => generateReport(_sessionState, _config, _session, { timing: _timer?.snapshot() ?? null });

    const doDownload = async () => {
      const { blob, filename } = await report();
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const doShare = async () => {
      const { blob, filename } = await report();
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

    sendResults();
  }

  // ── Remote submission (REMOTE_SPEC §4.2, §8.1) ────────────────────────────
  // Post-first: every completion is sent. Going back to change answers and
  // completing again sends again (the therapist sees the latest); returning
  // to the results screen with unchanged answers does not resend. The status
  // is memoised in _send so a remounted results screen shows the right thing
  // even while a request is in flight.

  function setSendStatus(state) {
    _send.state = state;
    const el = _shellEl?.querySelector('results-screen');
    if (!el) return;
    el.status = state === 'failed' ? SEND_STATUS.failed(() => sendResults({ force: true })) : SEND_STATUS[state]();
  }

  async function sendResults({ force = false } = {}) {
    if (!_session?.pid) return;                               // nothing to attribute (unit-test sessions)
    const answersJson = JSON.stringify(_sessionState?.answers ?? {});
    if (!force && answersJson === _send.answersJson && _send.state !== 'failed') {
      setSendStatus(_send.state);
      return;
    }
    _send.answersJson = answersJson;

    // Sends are serialised. Completing, going back to edit, and completing again
    // while the first request was still in flight used to start a second POST
    // alongside it: two rows for one sitting whose arrival order at the database
    // need not match the edit order, so the therapist's most recent reading could
    // be the pre-edit answers. Overlapping completions now collapse into one
    // follow-up send of the newest answers once the current request resolves;
    // sequential completions still send individually, as §6 expects.
    if (_send.inFlight) { _send.queued = true; return; }
    _send.inFlight = true;
    setSendStatus('sending');
    try {
      do {
        _send.queued = false;
        const sending = _send.answersJson;
        // lang must be passed explicitly: buildEnvelope defaults it to 'he', so a
        // session answered in any other language would be stored claiming Hebrew
        // while the PDF (report.js, which does pass it) says the truth.
        const envelope = buildEnvelope({ sessionState: _sessionState, config: _config, session: _session, appVersion: APP_VERSION, lang: currentLang() });
        const result = await submitSession({ uid: _session.pid, envelope });
        if (sending !== _send.answersJson) continue;        // superseded; the loop sends the newer
        // A 429 is transient — the per-IP window is a minute, the per-uid cap a day —
        // so it takes the retryable 'failed' state and its retry button. Every other
        // refusal (404, 400, 413) would fail identically however often it is retried,
        // and 'refused' tells the patient to use the PDF instead.
        const retryable = result.status === 429 || !result.error;
        setSendStatus(result.ok ? 'sent' : (retryable ? 'failed' : 'refused'));
      } while (_send.queued);
    } finally {
      _send.inFlight = false;
    }
  }



  // ── Orchestrator callbacks ───────────────────────────────────────────────

  function onQuestionnaireStart(engine, sessionKey, questionnaire) {
    _engine = engine;
    _questionnaire = questionnaire;
    _sessionKey = sessionKey;
    _timer?.enter(sessionKey);

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
    _sessionKey = sessionKey;
    _timer?.enter(sessionKey);

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
    wrap.style.cssText = 'padding: var(--space-lg); color: var(--color-no)';
    const msg = document.createElement('p');
    msg.textContent = t('error.generic', { message: err.message });
    wrap.appendChild(msg);
    container.innerHTML = '';
    container.appendChild(wrap);
    console.error('Controller error:', err);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  // source: { sequence: BatteryNode[] }
  function start(config, source, { createOrchestrator, session = {}, timer = createQuestionnaireTimer() } = {}) {
    _config  = config;
    _session = session;
    _timer   = timer;
    // Focus time = wall time minus the spans the tab was hidden. Never removed:
    // the controller lives as long as the page (back-to-welcome reloads).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _timer.hide();
      else _timer.show();
    });
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
