// store.js — in-memory session store for the Aggregate surface.
//
// Holds parsed envelopes and the per-file upload statuses, and derives the
// per-instrument point series the charts render. Deliberately framework-free
// (plain module + subscribe callback), mirroring composer-state.js.
//
// Two spec-anchored behaviours (AGGREGATE_SPEC §4):
//   - No dedup, no grouping: every uploaded PDF contributes points, even if
//     the same file is uploaded twice. Upload hygiene is the clinician's.
//   - pid is a *filter*, not a grouping primitive. 'all' charts everything.

export const PID_ALL = 'all';
export const PID_NONE = 'none';   // sessions whose envelope has pid == null

export function createStore() {
  const files = [];      // { name, status: 'ok' | failure reason, detail? }
  const sessions = [];   // { envelope, fileName }
  let pidFilter = PID_ALL;
  const listeners = new Set();

  function notify() { for (const fn of listeners) fn(); }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** @param {Array<{file: File, result: object}>} parsed — parsePdfFile outputs */
    addFiles(parsed) {
      for (const { file, result } of parsed) {
        if (result.ok) {
          files.push({ name: file.name, status: 'ok' });
          // The File itself is retained so the detail panel can offer the
          // underlying PDF back as a download (AGGREGATE_SPEC §5.6) — in
          // memory only, discarded with the tab like everything else.
          sessions.push({ id: sessions.length, envelope: result.envelope, fileName: file.name, file });
        } else {
          files.push({ name: file.name, status: result.reason, detail: result.detail });
        }
      }
      notify();
    },

    /** Session lookup for the detail panel. */
    getSession(id) {
      return sessions[id] ?? null;
    },

    get files() { return files.slice(); },
    get sessionCount() { return sessions.length; },

    get pidFilter() { return pidFilter; },
    setPidFilter(value) { pidFilter = value; notify(); },

    /** Distinct pids across all sessions (nulls excluded), sorted. */
    pids() {
      const set = new Set();
      for (const { envelope } of sessions) {
        if (envelope.pid != null) set.add(envelope.pid);
      }
      return [...set].sort();
    },

    /** Whether any session has no pid (drives the "no pid" filter option). */
    hasUnidentified() {
      return sessions.some(({ envelope }) => envelope.pid == null);
    },

    /**
     * Per-instrument series of quantitative points, honouring the pid
     * filter, sorted by date ascending (time flows LTR — D-10).
     *
     * Instruments are ordered most-administered first (AGG-7); see
     * byAdministrationCount below for the tie-breaks.
     *
     * @returns {Array<{questionnaireId, title, points}>}
     *   points: [{ date, total, subscales, category, alerts, pid, fileName }]
     */
    series() {
      const byInstrument = new Map();
      for (const { id, envelope, fileName } of filtered()) {
        for (const { sessionKey, qId, score } of sessionEntries(envelope)) {
          if (score?.total == null) continue;
          if (!byInstrument.has(qId)) {
            byInstrument.set(qId, {
              questionnaireId: qId,
              title: titleFor(envelope, qId),
              points: [],
            });
          }
          byInstrument.get(qId).points.push({
            sessionId: id,
            sessionKey,
            date: new Date(envelope.generatedAt),
            total: score.total,
            subscales: score.subscales ?? {},
            category: score.category ?? null,
            alerts: envelope.sessionState.alerts?.[sessionKey] ?? [],
            answers: envelope.sessionState.answers?.[sessionKey] ?? {},
            pid: envelope.pid ?? null,
            fileName,
          });
        }
      }
      const result = [...byInstrument.values()];
      for (const s of result) s.points.sort((a, b) => a.date - b.date);
      return result.sort(byAdministrationCount(s => s.points));
    },

    /**
     * Instruments completed in uploaded sessions that have no quantitative
     * total — idiographic scales, screeners without scores, worksheets.
     * Rendered as the "raw data, not graphed" list (AGGREGATE_SPEC §5.5).
     * Ordered most-administered first, like series().
     *
     * @returns {Array<{questionnaireId, title, sessions: [{date, pid, fileName}]}>}
     */
    rawInstruments() {
      const byInstrument = new Map();
      for (const { envelope, fileName } of filtered()) {
        for (const { qId, score } of sessionEntries(envelope)) {
          if (score?.total != null) continue;
          if (!byInstrument.has(qId)) {
            byInstrument.set(qId, {
              questionnaireId: qId,
              title: titleFor(envelope, qId),
              sessions: [],
            });
          }
          byInstrument.get(qId).sessions.push({
            date: new Date(envelope.generatedAt),
            pid: envelope.pid ?? null,
            fileName,
          });
        }
      }
      const result = [...byInstrument.values()];
      for (const r of result) r.sessions.sort((a, b) => a.date - b.date);
      return result.sort(byAdministrationCount(r => r.sessions));
    },

    /**
     * Union of instrument IDs across uploaded sessions — used to fetch
     * instrument configs for chart overlays. Item IDs are addresses
     * (configs/prod/<id>.json), so the envelope's instrument ids ARE the
     * config sources; the legacy configFile label is ignored (old PDFs
     * recorded bundle names like "standard" whose files no longer exist).
     */
    configFiles() {
      const set = new Set();
      for (const { envelope } of sessions) {
        for (const inst of envelope.instruments) {
          if (inst.questionnaireId && /^[a-zA-Z0-9_-]+$/.test(inst.questionnaireId)) {
            set.add(inst.questionnaireId);
          }
        }
      }
      return [...set].sort();
    },
  };

  // ── helpers ──────────────────────────────────────────────────────────────

  function filtered() {
    if (pidFilter === PID_ALL) return sessions;
    if (pidFilter === PID_NONE) return sessions.filter(s => s.envelope.pid == null);
    return sessions.filter(s => s.envelope.pid === pidFilter);
  }

  // One entry per completed session key, resolved to its questionnaire ID
  // via the questionnaireIds map (instanceId-keyed sessions — see D-8).
  function sessionEntries(envelope) {
    const ss = envelope.sessionState;
    return Object.keys(ss.answers ?? {}).map(sessionKey => ({
      sessionKey,
      qId: ss.questionnaireIds?.[sessionKey] ?? sessionKey,
      score: ss.scores?.[sessionKey],
    }));
  }

  function titleFor(envelope, qId) {
    return envelope.instruments.find(i => i.questionnaireId === qId)?.title ?? qId;
  }

  // Instrument ordering (AGG-7): most-administered first, so the trajectory a
  // clinician came to read is at the top instead of wherever upload order put
  // it. Ties go to the instrument administered most recently — between two
  // instruments seen the same number of times, the one still in use is the
  // live one — and then to the title, so the order is fully determined and a
  // re-render never reshuffles equal rows.
  //
  // Recomputed on every derivation rather than frozen at first render: the
  // list is derived from the pid-filtered set, so freezing it would make the
  // order lie as soon as a filter changes or a later batch of PDFs arrives.
  // `entries` picks the dated array to count (points for charts, sessions for
  // the raw list); both are already sorted ascending by date when this runs.
  function byAdministrationCount(entries) {
    return (a, b) => {
      const ea = entries(a), eb = entries(b);
      if (eb.length !== ea.length) return eb.length - ea.length;
      const lastA = ea[ea.length - 1]?.date ?? 0;
      const lastB = eb[eb.length - 1]?.date ?? 0;
      if (lastB - lastA !== 0) return lastB - lastA;
      return a.title.localeCompare(b.title, 'he');
    };
  }
}
