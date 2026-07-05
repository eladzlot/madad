// Tests for store.js — the Aggregate session store.

import { describe, it, expect, vi } from 'vitest';
import { createStore, PID_ALL, PID_NONE } from './store.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEnvelope({
  generatedAt = '2026-07-01T10:00:00Z',
  pid = 'P001',
  instruments = [{ questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' }],
  answers = { phq9: { q1: 2 } },
  scores = { phq9: { total: 12, subscales: {}, category: 'בינוני' } },
  alerts = {},
  questionnaireIds = null,
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    appVersion: '1.0.0',
    pid,
    name: null,
    instruments,
    sessionState: {
      answers,
      scores,
      alerts,
      questionnaireIds: questionnaireIds ?? Object.fromEntries(Object.keys(answers).map(k => [k, k])),
    },
  };
}

function okFile(envelope, name = 'report.pdf') {
  return { file: { name }, result: { ok: true, envelope } };
}

function badFile(reason, name = 'bad.pdf', detail) {
  return { file: { name }, result: { ok: false, reason, detail } };
}

// ── Upload list ───────────────────────────────────────────────────────────────

describe('addFiles / files', () => {
  it('records ok and failed files with statuses', () => {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope(), 'a.pdf'),
      badFile('not-pdf', 'b.txt'),
      badFile('malformed', 'c.pdf', 'attachment is not valid JSON'),
    ]);
    expect(store.files).toEqual([
      { name: 'a.pdf', status: 'ok' },
      { name: 'b.txt', status: 'not-pdf', detail: undefined },
      { name: 'c.pdf', status: 'malformed', detail: 'attachment is not valid JSON' },
    ]);
    expect(store.sessionCount).toBe(1);
  });

  it('does not dedupe identical uploads (AGGREGATE_SPEC §4)', () => {
    const store = createStore();
    const env = makeEnvelope();
    store.addFiles([okFile(env, 'same.pdf'), okFile(env, 'same.pdf')]);
    expect(store.sessionCount).toBe(2);
    expect(store.series()[0].points).toHaveLength(2);
  });

  it('retains the uploaded File and exposes sessions by id', () => {
    const store = createStore();
    const file = { name: 'a.pdf', size: 123 };
    store.addFiles([{ file, result: { ok: true, envelope: makeEnvelope() } }]);
    const point = store.series()[0].points[0];
    expect(point.sessionId).toBe(0);
    const session = store.getSession(point.sessionId);
    expect(session.file).toBe(file);
    expect(session.fileName).toBe('a.pdf');
    expect(store.getSession(99)).toBeNull();
  });

  it('notifies subscribers on add and on filter change', () => {
    const store = createStore();
    const spy = vi.fn();
    store.subscribe(spy);
    store.addFiles([okFile(makeEnvelope())]);
    store.setPidFilter('P001');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ── Series ────────────────────────────────────────────────────────────────────

describe('series', () => {
  it('groups points by instrument, sorted by date ascending', () => {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope({ generatedAt: '2026-07-08T10:00:00Z', scores: { phq9: { total: 8 } } }), 'later.pdf'),
      okFile(makeEnvelope({ generatedAt: '2026-07-01T10:00:00Z', scores: { phq9: { total: 12 } } }), 'earlier.pdf'),
    ]);
    const series = store.series();
    expect(series).toHaveLength(1);
    expect(series[0].questionnaireId).toBe('phq9');
    expect(series[0].title).toBe('שאלון דיכאון (PHQ-9)');
    expect(series[0].points.map(p => p.total)).toEqual([12, 8]);
    expect(series[0].points.map(p => p.fileName)).toEqual(['earlier.pdf', 'later.pdf']);
  });

  it('splits multi-instrument sessions into separate series', () => {
    const store = createStore();
    store.addFiles([okFile(makeEnvelope({
      instruments: [
        { questionnaireId: 'phq9', title: 'PHQ-9', configFile: 'standard' },
        { questionnaireId: 'gad7', title: 'GAD-7', configFile: 'standard' },
      ],
      answers: { phq9: { q1: 1 }, gad7: { g1: 2 } },
      scores: { phq9: { total: 5 }, gad7: { total: 9 } },
    }))]);
    const ids = store.series().map(s => s.questionnaireId).sort();
    expect(ids).toEqual(['gad7', 'phq9']);
  });

  it('resolves instanceId session keys via questionnaireIds', () => {
    const store = createStore();
    store.addFiles([okFile(makeEnvelope({
      answers: { 'phq9#1': { q1: 1 } },
      scores: { 'phq9#1': { total: 7 } },
      questionnaireIds: { 'phq9#1': 'phq9' },
    }))]);
    const series = store.series();
    expect(series[0].questionnaireId).toBe('phq9');
    expect(series[0].points[0].total).toBe(7);
  });

  it('attaches per-session alerts to points', () => {
    const store = createStore();
    store.addFiles([okFile(makeEnvelope({
      alerts: { phq9: [{ id: 'suicidality', message: 'מחשבות אובדניות', severity: 'critical' }] },
    }))]);
    expect(store.series()[0].points[0].alerts).toHaveLength(1);
  });

  it('excludes sessions without a total from series', () => {
    const store = createStore();
    store.addFiles([okFile(makeEnvelope({
      instruments: [{ questionnaireId: 'top3', title: 'שלושת הבעיות', configFile: 'standard' }],
      answers: { top3: { t1: 'בעיה' } },
      scores: { top3: { total: null } },
    }))]);
    expect(store.series()).toHaveLength(0);
  });
});

// ── pid filter ────────────────────────────────────────────────────────────────

describe('pid filter', () => {
  function storeWithPids() {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope({ pid: 'P001', scores: { phq9: { total: 1 } } })),
      okFile(makeEnvelope({ pid: 'P002', scores: { phq9: { total: 2 } } })),
      okFile(makeEnvelope({ pid: null, scores: { phq9: { total: 3 } } })),
    ]);
    return store;
  }

  it('defaults to all sessions', () => {
    const store = storeWithPids();
    expect(store.pidFilter).toBe(PID_ALL);
    expect(store.series()[0].points).toHaveLength(3);
  });

  it('filters to a specific pid', () => {
    const store = storeWithPids();
    store.setPidFilter('P002');
    expect(store.series()[0].points.map(p => p.total)).toEqual([2]);
  });

  it('filters to sessions without a pid', () => {
    const store = storeWithPids();
    store.setPidFilter(PID_NONE);
    expect(store.series()[0].points.map(p => p.total)).toEqual([3]);
  });

  it('lists distinct pids sorted and reports unidentified sessions', () => {
    const store = storeWithPids();
    expect(store.pids()).toEqual(['P001', 'P002']);
    expect(store.hasUnidentified()).toBe(true);
  });
});

// ── Raw (non-quantitative) instruments ────────────────────────────────────────

describe('rawInstruments', () => {
  it('lists instruments without totals, grouped with session dates', () => {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope({
        generatedAt: '2026-07-02T09:00:00Z',
        instruments: [{ questionnaireId: 'top3', title: 'שלושת הבעיות', configFile: 'standard' }],
        answers: { top3: { t1: 'x' } },
        scores: { top3: { total: null } },
      }), 'b.pdf'),
      okFile(makeEnvelope({
        generatedAt: '2026-07-01T09:00:00Z',
        instruments: [{ questionnaireId: 'top3', title: 'שלושת הבעיות', configFile: 'standard' }],
        answers: { top3: { t1: 'y' } },
        scores: {},
      }), 'a.pdf'),
    ]);
    const raw = store.rawInstruments();
    expect(raw).toHaveLength(1);
    expect(raw[0].title).toBe('שלושת הבעיות');
    expect(raw[0].sessions.map(s => s.fileName)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('honours the pid filter', () => {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope({ pid: 'P001', scores: {} })),
      okFile(makeEnvelope({ pid: 'P002', scores: {} })),
    ]);
    store.setPidFilter('P001');
    expect(store.rawInstruments()[0].sessions).toHaveLength(1);
  });
});

// ── Config union ──────────────────────────────────────────────────────────────

describe('configFiles', () => {
  it('returns the sorted union of short-name configFiles', () => {
    const store = createStore();
    store.addFiles([
      okFile(makeEnvelope({ instruments: [{ questionnaireId: 'phq9', title: 'x', configFile: 'standard' }] })),
      okFile(makeEnvelope({ instruments: [{ questionnaireId: 'pcl5', title: 'y', configFile: 'trauma' }] })),
      okFile(makeEnvelope({ instruments: [{ questionnaireId: 'gad7', title: 'z', configFile: 'standard' }] })),
    ]);
    expect(store.configFiles()).toEqual(['standard', 'trauma']);
  });

  it('excludes full-URL and null configFiles', () => {
    const store = createStore();
    store.addFiles([okFile(makeEnvelope({
      instruments: [
        { questionnaireId: 'a', title: 'a', configFile: 'https://example.com/x.json' },
        { questionnaireId: 'b', title: 'b', configFile: null },
        { questionnaireId: 'c', title: 'c', configFile: 'ocd' },
      ],
    }))]);
    expect(store.configFiles()).toEqual(['ocd']);
  });
});
