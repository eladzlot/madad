// Orchestrator — battery-level session management.
// See SEQUENCE_SPEC.md §7 and IMPLEMENTATION_SPEC.md §8.
//
// Public API:
//   createOrchestrator(config, source, callbacks)
//
//   `source` is one of:
//     { batteryId: string }   — looks up a named battery in config.batteries
//     { sequence: Node[] }    — uses a pre-built sequence directly (composer/items URL model)
//
//   config.questionnaires must be a Map<id, { data: Questionnaire }> (from loadConfig).
//
//   Methods:
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

export function createOrchestrator(config, source, callbacks = {}) {
  const { onQuestionnaireStart, onSessionComplete, onError } = callbacks;

  // ── Resolve sequence ─────────────────────────────────────────────────────

  let sequence;

  if (source && 'sequence' in source) {
    // Pre-built sequence from resolveItems() — used by the items URL model
    sequence = source.sequence;
  } else if (source && 'batteryId' in source) {
    // Named battery lookup — used by internal/legacy callers
    const battery = config.batteries?.find(b => b.id === source.batteryId);
    if (!battery) {
      throw new Error(`Orchestrator: battery "${source.batteryId}" not found in config`);
    }
    sequence = battery.sequence;
  } else {
    throw new Error('Orchestrator: source must be { batteryId } or { sequence }');
  }

  // ── Questionnaire lookup ─────────────────────────────────────────────────
  // config.questionnaires is a plain array.

  function lookupQuestionnaire(id) {
    return config.questionnaires?.find(q => q.id === id) ?? null;
  }

  // ── Session state ────────────────────────────────────────────────────────

  const state = {
    answers: {},   // { [sessionKey]: { [itemId]: any } }
    scores:  {},   // { [sessionKey]: { total, subscales, category } }
    alerts:  {},   // { [sessionKey]: Alert[] }
  };

  // ── Runner & engine ──────────────────────────────────────────────────────

  const runner = createSequenceRunner(sequence);
  let _currentEngine = null;
  let _currentSessionKey = null;
  let _complete = false;
  let _questionnaireIndex = 0;

  // ── Battery-level DSL context ────────────────────────────────────────────

  function buildBatteryContext() {
    const score = {};
    const subscale = {};
    // item.<questionnaireId>.<itemId> — qualified cross-questionnaire references.
    // Each completed questionnaire's answers are stored under its session key,
    // so battery if-conditions can reference e.g. item.diamond_sr.q11
    const item = {};
    for (const [key, result] of Object.entries(state.scores)) {
      score[key]    = result.total;
      subscale[key] = result.subscales;
    }
    for (const [key, answers] of Object.entries(state.answers)) {
      item[key] = answers;
    }
    return { score, subscale, item };
  }

  // ── Start a questionnaire node ───────────────────────────────────────────

  function startQuestionnaire(node) {
    const sessionKey = node.instanceId ?? node.questionnaireId;
    const questionnaire = lookupQuestionnaire(node.questionnaireId);

    if (!questionnaire) {
      const err = new Error(`Orchestrator: questionnaire "${node.questionnaireId}" not found in config`);
      onError?.(err);
      throw err;
    }

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

  function engineComplete() {
    const key = _currentSessionKey;
    state.answers[key] = _currentEngine.answers();
    state.scores[key]  = _currentEngine.scoreResult() ?? { total: null, subscales: {}, category: null };
    state.alerts[key]  = _currentEngine.alertResults() ?? [];

    if (!runner.hasNext()) {
      _complete = true;
      onSessionComplete?.(state);
      return;
    }

    const node = runner.advance(buildBatteryContext());
    if (node === null) {
      _complete = true;
      onSessionComplete?.(state);
      return;
    }

    startQuestionnaire(node);
  }

  // ── Public: engineCrossBack() ────────────────────────────────────────────

  function engineCrossBack() {
    if (!runner.canGoBack()) return;

    const node = runner.back();
    const sessionKey = node.instanceId ?? node.questionnaireId;
    const questionnaire = lookupQuestionnaire(node.questionnaireId);

    if (!questionnaire) {
      const err = new Error(`Orchestrator: questionnaire "${node.questionnaireId}" not found in config`);
      onError?.(err);
      throw err;
    }

    _currentSessionKey = sessionKey;

    const existingAnswers = state.answers[sessionKey] ?? {};
    _currentEngine = createEngine(questionnaire, sessionKey, existingAnswers);

    let item = _currentEngine.advance();
    while (item !== null) { item = _currentEngine.advance(); }
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
