import { describe, it, expect, vi } from 'vitest';
import { evaluateAlerts } from './alerts.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeQ = (alerts) => ({ id: 'test', title: 'Test', items: [], alerts });

const noSubscales = { total: 5, subscales: {} };

// ─── Basic firing ─────────────────────────────────────────────────────────────

describe('basic firing', () => {
  it('returns empty array when no alerts defined', () => {
    expect(evaluateAlerts({ id: 'q', title: 'Q', items: [] }, {}, noSubscales)).toEqual([]);
  });

  it('returns empty array when alerts array is empty', () => {
    expect(evaluateAlerts(makeQ([]), {}, noSubscales)).toEqual([]);
  });

  it('fires alert when condition is true', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.x >= 1', message: 'fired' }]);
    const result = evaluateAlerts(q, { x: 2 }, noSubscales);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
    expect(result[0].message).toBe('fired');
  });

  it('does not fire alert when condition is false', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.x >= 1', message: 'fired' }]);
    expect(evaluateAlerts(q, { x: 0 }, noSubscales)).toEqual([]);
  });

  it('fires multiple alerts independently', () => {
    const q = makeQ([
      { id: 'a1', condition: 'item.x >= 1', message: 'first' },
      { id: 'a2', condition: 'item.y >= 1', message: 'second' },
    ]);
    const result = evaluateAlerts(q, { x: 2, y: 0 }, noSubscales);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('can fire all alerts at once', () => {
    const q = makeQ([
      { id: 'a1', condition: 'item.x >= 1', message: 'first' },
      { id: 'a2', condition: 'item.y >= 1', message: 'second' },
    ]);
    const result = evaluateAlerts(q, { x: 1, y: 1 }, noSubscales);
    expect(result).toHaveLength(2);
  });
});

// ─── Severity ─────────────────────────────────────────────────────────────────

describe('severity', () => {
  it('includes severity field when defined', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.x >= 1', message: 'msg', severity: 'critical' }]);
    const [alert] = evaluateAlerts(q, { x: 1 }, noSubscales);
    expect(alert.severity).toBe('critical');
  });

  it('omits severity field when not defined', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.x >= 1', message: 'msg' }]);
    const [alert] = evaluateAlerts(q, { x: 1 }, noSubscales);
    expect('severity' in alert).toBe(false);
  });
});

// ─── DSL context ──────────────────────────────────────────────────────────────

describe('DSL context', () => {
  it('resolves item references from answers', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.q9 >= 1', message: 'suicidality' }]);
    expect(evaluateAlerts(q, { q9: 0 }, noSubscales)).toEqual([]);
    expect(evaluateAlerts(q, { q9: 1 }, noSubscales)).toHaveLength(1);
  });

  it('resolves subscale references from scoreResult', () => {
    const q = makeQ([{ id: 'a1', condition: 'subscale.intrusion >= 15', message: 'high intrusion' }]);
    const scoreResult = { total: 39, subscales: { intrusion: 15, avoidance: 4 } };
    expect(evaluateAlerts(q, {}, scoreResult)).toHaveLength(1);
  });

  it('resolves subscale references that do not fire', () => {
    const q = makeQ([{ id: 'a1', condition: 'subscale.intrusion >= 15', message: 'high intrusion' }]);
    const scoreResult = { total: 10, subscales: { intrusion: 5 } };
    expect(evaluateAlerts(q, {}, scoreResult)).toEqual([]);
  });

  it('handles compound conditions', () => {
    const q = makeQ([{ id: 'a1', condition: 'item.x >= 1 && item.y >= 1', message: 'both' }]);
    expect(evaluateAlerts(q, { x: 1, y: 0 }, noSubscales)).toEqual([]);
    expect(evaluateAlerts(q, { x: 1, y: 1 }, noSubscales)).toHaveLength(1);
  });
});

// ─── PHQ-9 suicidality alert (real fixture shape) ────────────────────────────

describe('PHQ-9 suicidality alert', () => {
  const phq9 = {
    id: 'phq9',
    title: 'PHQ-9',
    items: [],
    alerts: [{
      id: 'suicidality',
      condition: 'item.9 >= 1',
      message: 'פריט 9 — המטופל דיווח על מחשבות אובדניות או פגיעה עצמית',
      severity: 'critical',
    }],
  };
  const scores = { total: 0, subscales: {} };

  it('does not fire when item 9 = 0', () => {
    expect(evaluateAlerts(phq9, { '9': 0 }, scores)).toEqual([]);
  });

  it('fires when item 9 = 1', () => {
    const [a] = evaluateAlerts(phq9, { '9': 1 }, scores);
    expect(a.id).toBe('suicidality');
    expect(a.severity).toBe('critical');
  });

  it('fires when item 9 = 3', () => {
    expect(evaluateAlerts(phq9, { '9': 3 }, scores)).toHaveLength(1);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('skips alert with syntax error in condition, does not throw', () => {
    const q = makeQ([
      { id: 'bad',  condition: 'item.x >=',    message: 'broken' },
      { id: 'good', condition: 'item.x >= 1',  message: 'works' },
    ]);
    const result = evaluateAlerts(q, { x: 2 }, noSubscales);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  it('skips alert with unresolvable reference, does not throw', () => {
    const q = makeQ([
      { id: 'bad',  condition: 'subscale.nonexistent >= 1', message: 'broken' },
      { id: 'good', condition: 'item.x >= 1',               message: 'works' },
    ]);
    const result = evaluateAlerts(q, { x: 1 }, noSubscales);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  it('emits a console warning for skipped alerts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    const q = makeQ([{ id: 'bad', condition: 'item.x >=', message: 'broken' }]);
    evaluateAlerts(q, { x: 1 }, noSubscales);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/bad/);
    warn.mockRestore();
  });

  it('rethrows unexpected errors', () => {
    // Force an unexpected runtime error by passing a non-string condition
    const q = makeQ([{ id: 'a1', condition: null, message: 'msg' }]);
    expect(() => evaluateAlerts(q, {}, noSubscales)).toThrow();
  });
});

describe('score.x references in alert conditions', () => {
  it('fires when score.<questionnaireId> meets threshold', () => {
    const q = makeQ([{ id: 'high', condition: 'score.pcl5 >= 33', message: 'מעל סף', severity: 'warning' }]);
    q.id = 'pcl5';
    const result = evaluateAlerts(q, {}, { total: 51, subscales: {} });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('high');
  });

  it('does not fire when score is below threshold', () => {
    const q = makeQ([{ id: 'high', condition: 'score.pcl5 >= 33', message: 'מעל סף', severity: 'warning' }]);
    q.id = 'pcl5';
    const result = evaluateAlerts(q, {}, { total: 20, subscales: {} });
    expect(result).toHaveLength(0);
  });

  it('does not fire when total is null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = makeQ([{ id: 'high', condition: 'score.pcl5 >= 33', message: 'מעל סף', severity: 'warning' }]);
    q.id = 'pcl5';
    const result = evaluateAlerts(q, {}, { total: null, subscales: {} });
    expect(result).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
