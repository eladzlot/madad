// Orchestrator — battery-level session management.
// See SEQUENCE_SPEC.md §7 and IMPLEMENTATION_SPEC.md §8.
//
// Public API:
//   createOrchestrator(config, batteryId, callbacks)
//     .start()                  → void  — initializes runner, advances to first questionnaire
//     .engineComplete()         → void  — called by UI when engine returns null from advance()
//     .engineCrossBack()        → void  — called by UI when engine signals cross-boundary back
//     .sessionKey()             → string | null
//     .currentEngine()          → engine | null
//     .sessionState()           → { answers, scores, alerts }  (live reference)
//     .isComplete()             → boolean
//     .progress()               → { current: number, total: number | null }
//
// Callbacks (all optional):
//   onQuestionnaireStart(engine, sessionKey, questionnaire)  — new questionnaire ready
//   onSessionComplete(sessionState)           — all questionnaires done
//   onError(error)                            — unrecoverable error

import { createSequenceRunner } from './sequence-runner.js';
import { createEngine } from './engine.js';

export function createOrchestrator(config, batteryId, callbacks = {}) {
  const { onQuestionnaireStart, onSessionComplete, onError } = callbacks;

  // ── Resolve battery sequence ─────────────────────────────────────────────

  const battery = config.batteries?.find(b => b.id === batteryId);
  if (!battery) {
    throw new Error(`Orchestrator: battery "${batteryId}" not found in config`);
  }

  // Build a lookup map for questionnaires
  const questionnaireMap = Object.fromEntries(
    (config.questionnaires ?? []).map(q => [q.id, q])
  );

  // ── Session state ────────────────────────────────────────────────────────

  const state = {
    answers: {},   // { [sessionKey]: { [itemId]: any } }
    scores:  {},   // { [sessionKey]: { total, subscales, category } }
    alerts:  {},   // { [sessionKey]: Alert[] }
  };

  // ── Runner & engine ──────────────────────────────────────────────────────

  const runner = createSequenceRunner(battery.sequence);
  let _currentEngine = null;
  let _currentSessionKey = null;
  let _complete = false;
  let _questionnaireIndex = 0;

  // ── Battery-level DSL context ────────────────────────────────────────────

  function buildBatteryContext() {
    const score = {};
    const subscale = {};
    for (const [key, result] of Object.entries(state.scores)) {
      score[key] = result.total;
      subscale[key] = result.subscales;
    }
    return { score, subscale };
  }

  // ── Start a questionnaire node ───────────────────────────────────────────

  function startQuestionnaire(node) {
    const sessionKey = node.instanceId ?? node.questionnaireId;
    const questionnaire = questionnaireMap[node.questionnaireId];

    if (!questionnaire) {
      const err = new Error(`Orchestrator: questionnaire "${node.questionnaireId}" not found in config`);
      onError?.(err);
      throw err;
    }

    // Initialize answers slot if not already present (preserves existing on re-entry)
    if (!state.answers[sessionKey]) {
      state.answers[sessionKey] = {};
    }

    _currentSessionKey = sessionKey;
    _currentEngine = createEngine(questionnaire, sessionKey, state.answers[sessionKey]);
    _questionnaireIndex++;

    onQuestionnaireStart?.(_currentEngine, sessionKey, questionnaire);
  }

  // ── Public: start() ──────────────────────────────────────────────────────

  function start() {
    if (!runner.hasNext()) {
      _complete = true;
      onSessionComplete?.(state);
      return;
    }
    const node = runner.advance(buildBatteryContext());
    startQuestionnaire(node);
  }

  // ── Public: engineComplete() ─────────────────────────────────────────────
  // Called by the UI after engine.advance() returns null.

  function engineComplete() {
    // Persist engine results into session state
    const key = _currentSessionKey;
    state.answers[key] = _currentEngine.answers();
    state.scores[key]  = _currentEngine.scoreResult() ?? { total: null, subscales: {}, category: null };
    state.alerts[key]  = _currentEngine.alertResults() ?? [];

    if (!runner.hasNext()) {
      _complete = true;
      onSessionComplete?.(state);
      return;
    }

    // advance() may return null if all remaining nodes resolve to empty branches
    const node = runner.advance(buildBatteryContext());
    if (node === null) {
      _complete = true;
      onSessionComplete?.(state);
      return;
    }

    startQuestionnaire(node);
  }

  // ── Public: engineCrossBack() ────────────────────────────────────────────
  // Called by the UI when back() is pressed on the first item of a questionnaire.

  function engineCrossBack() {
    if (!runner.canGoBack()) {
      // Already at first questionnaire — nothing to do
      return;
    }

    const node = runner.back();
    const sessionKey = node.instanceId ?? node.questionnaireId;
    const questionnaire = questionnaireMap[node.questionnaireId];

    if (!questionnaire) {
      const err = new Error(`Orchestrator: questionnaire "${node.questionnaireId}" not found in config`);
      onError?.(err);
      throw err;
    }

    _currentSessionKey = sessionKey;

    // Re-initialize engine with existing answers
    const existingAnswers = state.answers[sessionKey] ?? {};
    _currentEngine = createEngine(questionnaire, sessionKey, existingAnswers);

    // Drain to end then back once to land on the last item
    let item = _currentEngine.advance();
    while (item !== null) {
      item = _currentEngine.advance();
    }
    _currentEngine.back();

    onQuestionnaireStart?.(_currentEngine, sessionKey, questionnaire);
  }

  // ── Public accessors ─────────────────────────────────────────────────────

  function sessionKey()    { return _currentSessionKey; }
  function currentEngine() { return _currentEngine; }
  function sessionState()  { return state; }
  function isComplete()    { return _complete; }

  function progress() {
    const remaining = runner.remainingCount();
    const total = remaining === null ? null : _questionnaireIndex + remaining;
    return { current: _questionnaireIndex, total };
  }

  return {
    start,
    engineComplete,
    engineCrossBack,
    sessionKey,
    currentEngine,
    sessionState,
    isComplete,
    progress,
  };
}
