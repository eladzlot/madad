import { describe, it, expect } from 'vitest';
import { collectConfigErrors, ConfigError, validateConfigData } from './config-validation.js';

const minimalQ = (id = 'phq9') => ({
  id, title: 'Test',
  items: [{ id: 'q1', type: 'likert', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
  scoring: { method: 'none' }, alerts: [],
});
const minimalBattery = (id, qId = 'phq9') => ({ id, title: id, sequence: [{ questionnaireId: qId }] });
const minimalConfig = (questionnaires = [], batteries = []) => ({ id: 'test', version: '1.0', questionnaires, batteries });

// ─── collectConfigErrors ──────────────────────────────────────────────────────

describe('collectConfigErrors', () => {
  it('returns empty array for clean config', () => {
    expect(collectConfigErrors(minimalConfig([minimalQ()], [minimalBattery('standard')]))).toEqual([]);
  });

  it('never throws — always returns array', () => {
    expect(() => collectConfigErrors({})).not.toThrow();
    expect(collectConfigErrors({})).toBeInstanceOf(Array);
  });
});

// ─── Cross-entity ID collision ────────────────────────────────────────────────

describe('cross-entity ID collision', () => {
  it('reports error when battery ID matches a questionnaire ID', () => {
    const errors = collectConfigErrors(minimalConfig([minimalQ('intake')], [minimalBattery('intake')]));
    expect(errors.some(e => e.includes('"intake"'))).toBe(true);
  });

  it('reports one error per colliding ID', () => {
    const errors = collectConfigErrors(minimalConfig(
      [minimalQ('foo'), minimalQ('bar')],
      [minimalBattery('foo', 'phq9'), minimalBattery('bar', 'phq9')]
    ));
    expect(errors.filter(e => e.includes('both a questionnaire and a battery'))).toHaveLength(2);
  });

  it('no error when IDs are distinct', () => {
    const errors = collectConfigErrors(minimalConfig([minimalQ('phq9')], [minimalBattery('standard')]));
    expect(errors.filter(e => e.includes('both a questionnaire and a battery'))).toHaveLength(0);
  });
});

// ─── validateConfigData ───────────────────────────────────────────────────────

describe('validateConfigData', () => {
  it('throws ConfigError on cross-entity collision', () => {
    expect(() => validateConfigData(minimalConfig([minimalQ('intake')], [minimalBattery('intake')]), '/test.json'))
      .toThrow(ConfigError);
  });

  it('error message includes the source URL', () => {
    let err;
    try { validateConfigData(minimalConfig([minimalQ('intake')], [minimalBattery('intake')]), '/configs/test.json'); } catch (e) { err = e; }
    expect(err.message).toContain('/configs/test.json');
  });

  it('does not throw for valid data', () => {
    expect(() => validateConfigData(minimalConfig([minimalQ()], [minimalBattery('standard')]), '/test.json')).not.toThrow();
  });
});

// ─── Duplicate session keys ───────────────────────────────────────────────────

describe('duplicate session key check', () => {
  it('reports duplicate questionnaireId without instanceId', () => {
    const errors = collectConfigErrors(minimalConfig([minimalQ()], [{
      id: 'b', title: 'b',
      sequence: [{ questionnaireId: 'phq9' }, { questionnaireId: 'phq9' }],
    }]));
    expect(errors.some(e => e.includes('duplicate session key'))).toBe(true);
  });

  it('allows same questionnaireId with distinct instanceIds', () => {
    const errors = collectConfigErrors(minimalConfig([minimalQ()], [{
      id: 'b', title: 'b',
      sequence: [{ questionnaireId: 'phq9', instanceId: 'pre' }, { questionnaireId: 'phq9', instanceId: 'post' }],
    }]));
    expect(errors).toEqual([]);
  });
});
