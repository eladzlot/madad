// Questionnaire timer — per-questionnaire wall and focus time, for monitoring.
// See IMPLEMENTATION_SPEC.md §19.4a (envelope `timing` field) and TODO AGG-8.
//
// A stopwatch with one current bucket. The controller tells it which
// questionnaire is on screen (enter) and whether the tab is visible (hide /
// show); it accrues clock time into that questionnaire's bucket. Nothing
// about the patient's interactions is observed — a page left open keeps
// counting. Outliers are handled statistically downstream, not here.
//
//   wallMs  — clock time while the questionnaire was the current one
//   focusMs — the part of wallMs during which the tab was visible
//   visits  — number of times the questionnaire was entered (re-entry after
//             the results screen counts; the time is added to the same bucket)
//
// Pure: no DOM, no globals. The clock is injectable for tests.

export function createQuestionnaireTimer({ clock = () => Date.now() } = {}) {
  const startedAt = clock();
  let _mark   = startedAt;
  let _key    = null;      // current sessionKey, or null (welcome / results screen)
  let _hidden = false;
  const _q    = {};        // { [sessionKey]: { wallMs, focusMs, visits } }

  function bucket(key) {
    return _q[key] ?? (_q[key] = { wallMs: 0, focusMs: 0, visits: 0 });
  }

  // Credit the time since the last mark to the current bucket.
  function settle() {
    const now   = clock();
    const delta = Math.max(0, now - _mark);   // Date.now() can step backwards
    if (_key !== null) {
      const b = bucket(_key);
      b.wallMs += delta;
      if (!_hidden) b.focusMs += delta;
    }
    _mark = now;
  }

  function enter(key) {
    settle();
    _key = key ?? null;
    if (_key !== null) bucket(_key).visits += 1;
  }

  function hide() {
    if (_hidden) return;
    settle();
    _hidden = true;
  }

  function show() {
    if (!_hidden) return;
    settle();
    _hidden = false;
  }

  // Plain JSON for the envelope. Non-destructive: the pending span is added
  // to a copy, so repeated snapshots (download, share, resend) stay consistent.
  function snapshot() {
    const now   = clock();
    const delta = Math.max(0, now - _mark);
    const questionnaires = {};
    for (const [key, b] of Object.entries(_q)) {
      const pending = key === _key ? delta : 0;
      questionnaires[key] = {
        wallMs:  Math.round(b.wallMs + pending),
        focusMs: Math.round(b.focusMs + (_hidden ? 0 : pending)),
        visits:  b.visits,
      };
    }
    return { startedAt: new Date(startedAt).toISOString(), questionnaires };
  }

  return { enter, hide, show, snapshot };
}
