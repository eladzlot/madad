// Engine — item-level navigation within a single questionnaire instance.
// See SEQUENCE_SPEC.md §6 and IMPLEMENTATION_SPEC.md §11.
//
// Public API:
//   createEngine(questionnaire, sessionKey, existingAnswers?)
//     .advance()          → item | null (null = questionnaire complete)
//     .back()             → item        (throws if at first item or before first advance)
//     .recordAnswer(itemId, value)
//     .canGoBack()        → boolean
//     .currentItem()      → item | null
//     .answers()          → { [itemId]: number }   (defensive copy)
//     .progress()         → { current: number, total: number | null }
//     .isComplete()       → boolean
//     .scoreResult()      → { total, subscales, category } | null  (null until complete)
//     .alertResults()     → Alert[] | null                          (null until complete)

import { createSequenceRunner } from './sequence-runner.js';
import { score } from './scoring.js';
import { evaluateAlerts } from './alerts.js';

export function createEngine(questionnaire, sessionKey, existingAnswers = {}) {
  const runner = createSequenceRunner(questionnaire.items ?? []);

  // Answers are stored by itemId. Pre-populated from existingAnswers
  // (cross-boundary back re-entry) but never cleared.
  const _answers = { ...existingAnswers };

  let _current = null;
  let _complete = false;
  let _scoreResult = null;
  let _alertResults = null;

  // ── context builder ────────────────────────────────────────────────────────

  function buildContext() {
    return {
      item: { ..._answers },
      subscale: _scoreResult?.subscales ?? {},
    };
  }

  // ── advance() ──────────────────────────────────────────────────────────────

  function advance() {
    if (_complete) {
      throw new Error('Engine: advance() called but questionnaire is already complete');
    }
    if (!runner.hasNext()) {
      _complete = true;
      _scoreResult = score(questionnaire, _answers);
      _alertResults = evaluateAlerts(questionnaire, _answers, _scoreResult);
      _current = null;
      return null;
    }
    _current = runner.advance(buildContext());

    // runner.advance() returns null when all remaining nodes were control-flow
    // that resolved to empty branches (e.g. a trailing if-node with a false condition
    // and no else). Treat this as normal completion — same as exhausting the sequence.
    if (_current === null) {
      _complete = true;
      _scoreResult = score(questionnaire, _answers);
      _alertResults = evaluateAlerts(questionnaire, _answers, _scoreResult);
    }

    return _current;
  }

  // ── back() ─────────────────────────────────────────────────────────────────

  function back() {
    if (_complete) {
      // Re-entering after completion — restore to last item
      _complete = false;
      _scoreResult = null;
      _alertResults = null;
      _current = runner.currentNode();
      return _current;
    }
    if (!canGoBack()) {
      throw new Error('Engine: back() called but already at first item');
    }
    _current = runner.back();
    return _current;
  }

  // ── recordAnswer(itemId, value) ────────────────────────────────────────────

  function recordAnswer(itemId, value) {
    _answers[itemId] = value;
  }

  // ── canGoBack() ────────────────────────────────────────────────────────────

  function canGoBack() {
    if (_complete) return true; // can always re-enter completed questionnaire
    return runner.canGoBack();
  }

  // ── currentItem() ──────────────────────────────────────────────────────────

  function currentItem() {
    return _current;
  }

  // ── answers() ──────────────────────────────────────────────────────────────

  function answers() {
    return { ..._answers };
  }

  // ── progress() ─────────────────────────────────────────────────────────────

  function progress() {
    // Count only answerable (non-instructions) items in the resolved path
    const path = runner.resolvedPath();
    const pos = path.filter(n => n.type !== 'instructions').length;
    const remaining = runner.remainingCount();  // already excludes instructions
    const total = remaining === null ? null : pos + remaining;
    return { current: pos, total };
  }

  // ── isComplete() ───────────────────────────────────────────────────────────

  function isComplete() {
    return _complete;
  }

  // ── scoreResult() ──────────────────────────────────────────────────────────

  function scoreResult() {
    return _scoreResult;
  }

  // ── alertResults() ─────────────────────────────────────────────────────────

  function alertResults() {
    return _alertResults;
  }

  return {
    advance,
    back,
    recordAnswer,
    canGoBack,
    currentItem,
    answers,
    progress,
    isComplete,
    scoreResult,
    alertResults,
  };
}
