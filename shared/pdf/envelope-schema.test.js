import { describe, it, expect } from 'vitest';
import { ENVELOPE_VERSION, buildEnvelope, validateEnvelope } from './envelope-schema.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONFIG = {
  questionnaires: [
    { id: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' },
    { id: 'gad7', title: 'שאלון חרדה (GAD-7)', configFile: 'standard' },
  ],
};

const SESSION_STATE = {
  answers: { phq9: { q1: 2, q2: 3 }, gad7: { g1: 1 } },
  scores:  { phq9: { total: 5, category: 'קל' }, gad7: { total: 1 } },
  alerts:  { phq9: [{ message: 'מחשבות אובדניות', severity: 'critical' }] },
  questionnaireIds: { phq9: 'phq9', gad7: 'gad7' },
};

const NOW = new Date('2026-07-03T10:00:00Z');

// ─── buildEnvelope ────────────────────────────────────────────────────────────

describe('buildEnvelope', () => {
  it('produces the v1 envelope shape', () => {
    const env = buildEnvelope({
      sessionState: SESSION_STATE,
      config: CONFIG,
      session: { pid: 'TRC-2025-000123', name: 'ישראל' },
      appVersion: '1.0.0',
      now: NOW,
    });

    expect(env.schemaVersion).toBe(ENVELOPE_VERSION);
    expect(env.generatedAt).toBe('2026-07-03T10:00:00.000Z');
    expect(env.appVersion).toBe('1.0.0');
    expect(env.pid).toBe('TRC-2025-000123');
    expect(env.name).toBe('ישראל');
    expect(env.instruments).toEqual([
      { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' },
      { questionnaireId: 'gad7', title: 'שאלון חרדה (GAD-7)', configFile: 'standard' },
    ]);
    expect(env.sessionState.answers).toEqual(SESSION_STATE.answers);
    expect(env.sessionState.scores).toEqual(SESSION_STATE.scores);
    expect(env.sessionState.alerts).toEqual(SESSION_STATE.alerts);
    expect(env.sessionState.questionnaireIds).toEqual(SESSION_STATE.questionnaireIds);
  });

  it('defaults pid and name to null when session is absent', () => {
    const env = buildEnvelope({ sessionState: SESSION_STATE, config: CONFIG, now: NOW });
    expect(env.pid).toBeNull();
    expect(env.name).toBeNull();
    expect(env.appVersion).toBeNull();
  });

  it('resolves instanceId session keys via questionnaireIds map', () => {
    const state = {
      answers: { 'phq9#1': { q1: 0 } },
      scores:  {},
      alerts:  {},
      questionnaireIds: { 'phq9#1': 'phq9' },
    };
    const env = buildEnvelope({ sessionState: state, config: CONFIG, now: NOW });
    expect(env.instruments).toEqual([
      { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' },
    ]);
  });

  it('keeps an entry with null title for unknown questionnaires', () => {
    const state = { answers: { mystery: {} }, scores: {}, alerts: {}, questionnaireIds: {} };
    const env = buildEnvelope({ sessionState: state, config: CONFIG, now: NOW });
    expect(env.instruments).toEqual([
      { questionnaireId: 'mystery', title: null, configFile: null },
    ]);
  });

  it('survives a JSON round-trip and validates', () => {
    const env = buildEnvelope({
      sessionState: SESSION_STATE,
      config: CONFIG,
      session: { pid: 'a1', name: 'שם עם English' },
      appVersion: '1.0.0',
      now: NOW,
    });
    const roundTripped = JSON.parse(JSON.stringify(env));
    expect(roundTripped).toEqual(env);
    expect(validateEnvelope(roundTripped)).toEqual({ valid: true, errors: [] });
  });
});

// ─── validateEnvelope ─────────────────────────────────────────────────────────

describe('validateEnvelope', () => {
  const valid = () => buildEnvelope({ sessionState: SESSION_STATE, config: CONFIG, now: NOW });

  it('accepts a built envelope', () => {
    expect(validateEnvelope(valid()).valid).toBe(true);
  });

  it('rejects non-object payloads', () => {
    for (const bad of [null, undefined, 'str', 42, []]) {
      expect(validateEnvelope(bad).valid).toBe(false);
    }
  });

  it('rejects a missing or non-integer schemaVersion', () => {
    expect(validateEnvelope({ ...valid(), schemaVersion: undefined }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), schemaVersion: '1' }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), schemaVersion: 0 }).valid).toBe(false);
  });

  it('rejects schemaVersion newer than this build', () => {
    const res = validateEnvelope({ ...valid(), schemaVersion: ENVELOPE_VERSION + 1 });
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/newer than this build/);
  });

  it('rejects an unparseable generatedAt', () => {
    expect(validateEnvelope({ ...valid(), generatedAt: 'not a date' }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), generatedAt: null }).valid).toBe(false);
  });

  it('accepts null pid and name; rejects non-string values', () => {
    expect(validateEnvelope({ ...valid(), pid: null, name: null }).valid).toBe(true);
    expect(validateEnvelope({ ...valid(), pid: 7 }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), name: {} }).valid).toBe(false);
  });

  it('rejects malformed instruments', () => {
    expect(validateEnvelope({ ...valid(), instruments: 'nope' }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), instruments: [{ title: 'no id' }] }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), instruments: [null] }).valid).toBe(false);
  });

  it('rejects missing or malformed sessionState', () => {
    expect(validateEnvelope({ ...valid(), sessionState: undefined }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), sessionState: [] }).valid).toBe(false);
    expect(validateEnvelope({ ...valid(), sessionState: { answers: {}, scores: {} } }).valid).toBe(false);
  });

  it('tolerates unknown extra fields (forward compatibility)', () => {
    expect(validateEnvelope({ ...valid(), futureField: { anything: true } }).valid).toBe(true);
  });

  it('reports every error, not just the first', () => {
    const res = validateEnvelope({ schemaVersion: 'x', generatedAt: 'x', instruments: 'x', sessionState: 'x' });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });
});
