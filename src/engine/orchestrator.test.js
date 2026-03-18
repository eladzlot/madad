import { describe, it, expect, vi } from 'vitest';
import { createOrchestrator } from './orchestrator.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const select = (id) => ({ id, type: 'select', text: `Q${id}` });

const makeQ = (id, items = [select('q1'), select('q2')], extras = {}) => ({
  id, title: id, items, scoring: { method: 'sum' }, alerts: [], ...extras,
});

// config.questionnaires and config.batteries are plain arrays
const makeConfig = (questionnaires, batteries) => ({ questionnaires, batteries });

const linearBattery = (id, ...qIds) => ({
  id, title: id,
  sequence: qIds.map(qId => ({ questionnaireId: qId })),
});

// Advance engine through all items, recording a value for each answerable item
function drainEngine(engine, value = 1) {
  let item = engine.currentItem();
  while (item !== null) {
    if (item.type !== 'instructions') engine.recordAnswer(item.id, value);
    item = engine.advance();
  }
}

// ─── Source validation ────────────────────────────────────────────────────────

describe('source validation', () => {
  it('throws if invalid source object is provided', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    expect(() => createOrchestrator(config, {}, {})).toThrow('source must be');
  });

  it('throws if source is null', () => {
    const config = makeConfig([makeQ('phq9')], []);
    expect(() => createOrchestrator(config, null, {})).toThrow('source must be');
  });
});

// ─── batteryId source ─────────────────────────────────────────────────────────

describe('batteryId source', () => {
  it('throws if battery not found', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('standard', 'phq9')]);
    expect(() => createOrchestrator(config, { batteryId: 'missing' })).toThrow('battery "missing" not found');
  });

  it('throws if questionnaire not found in config', () => {
    const config = makeConfig([], [linearBattery('b', 'phq9')]);
    const orc = createOrchestrator(config, { batteryId: 'b' });
    expect(() => orc.start()).toThrow('questionnaire "phq9" not found');
  });

  it('start() fires onQuestionnaireStart with engine, sessionKey, and questionnaire', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const onStart = vi.fn();
    const orc = createOrchestrator(config, { batteryId: 'b' }, { onQuestionnaireStart: onStart });
    orc.start();
    expect(onStart).toHaveBeenCalledOnce();
    const [engine, key, questionnaire] = onStart.mock.calls[0];
    expect(key).toBe('phq9');
    expect(typeof engine.advance).toBe('function');
    expect(questionnaire.id).toBe('phq9');
  });
});

// ─── sequence source ──────────────────────────────────────────────────────────

describe('sequence source (items URL model)', () => {
  it('accepts a pre-built sequence directly', () => {
    const config = makeConfig([makeQ('phq9')], []);
    const sequence = [{ questionnaireId: 'phq9' }];
    const onStart = vi.fn();
    const orc = createOrchestrator(config, { sequence }, { onQuestionnaireStart: onStart });
    orc.start();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][1]).toBe('phq9');
  });

  it('runs multiple questionnaires from sequence in order', () => {
    const config = makeConfig([makeQ('phq9'), makeQ('gad7')], []);
    const sequence = [{ questionnaireId: 'phq9' }, { questionnaireId: 'gad7' }];
    const starts = [];
    const orc = createOrchestrator(config, { sequence }, {
      onQuestionnaireStart: (_, key) => starts.push(key),
    });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    expect(starts).toEqual(['phq9', 'gad7']);
  });

  it('completes session after sequence exhausted', () => {
    const config = makeConfig([makeQ('phq9')], []);
    const sequence = [{ questionnaireId: 'phq9' }];
    const onComplete = vi.fn();
    const orc = createOrchestrator(config, { sequence }, { onSessionComplete: onComplete });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(orc.isComplete()).toBe(true);
  });

  it('throws if questionnaire referenced in sequence is not in config', () => {
    const config = makeConfig([], []);
    const sequence = [{ questionnaireId: 'missing' }];
    const orc = createOrchestrator(config, { sequence });
    expect(() => orc.start()).toThrow('questionnaire "missing" not found');
  });

  it('works with an empty sequence — immediately completes', () => {
    const config = makeConfig([], []);
    const onComplete = vi.fn();
    const orc = createOrchestrator(config, { sequence: [] }, { onSessionComplete: onComplete });
    orc.start();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('supports instanceId in pre-built sequence', () => {
    const config = makeConfig([makeQ('phq9')], []);
    const sequence = [{ questionnaireId: 'phq9', instanceId: 'phq9_t1' }];
    const onStart = vi.fn();
    const orc = createOrchestrator(config, { sequence }, { onQuestionnaireStart: onStart });
    orc.start();
    expect(onStart.mock.calls[0][1]).toBe('phq9_t1');
  });
});

// ─── Linear battery flow ──────────────────────────────────────────────────────

describe('linear battery flow', () => {
  it('advances to second questionnaire after first completes', () => {
    const config = makeConfig(
      [makeQ('phq9'), makeQ('gad7')],
      [linearBattery('b', 'phq9', 'gad7')]
    );
    const starts = [];
    const orc = createOrchestrator(config, { batteryId: 'b' }, {
      onQuestionnaireStart: (_, key) => starts.push(key),
    });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    expect(starts).toEqual(['phq9', 'gad7']);
  });

  it('signals session complete after last questionnaire', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const onComplete = vi.fn();
    const orc = createOrchestrator(config, { batteryId: 'b' }, { onSessionComplete: onComplete });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(orc.isComplete()).toBe(true);
  });

  it('persists answers into session state on completion', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    const engine = orc.currentEngine();
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); engine.recordAnswer('q2', 2);
    engine.advance();
    orc.engineComplete();
    expect(orc.sessionState().answers.phq9).toEqual({ q1: 3, q2: 2 });
  });

  it('persists scores into session state on completion', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    const engine = orc.currentEngine();
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); engine.recordAnswer('q2', 2);
    engine.advance();
    orc.engineComplete();
    expect(orc.sessionState().scores.phq9.total).toBe(5);
  });
});

// ─── Conditional battery flow ─────────────────────────────────────────────────

describe('conditional battery (if node)', () => {
  const conditionalBattery = {
    id: 'b', title: 'b',
    sequence: [
      { questionnaireId: 'phq9' },
      { type: 'if', condition: 'score.phq9 >= 10',
        then: [{ questionnaireId: 'pcl5' }],
        else: [] },
    ],
  };

  it('takes then branch when score meets threshold', () => {
    const config = makeConfig(
      [makeQ('phq9', [select('q1')]), makeQ('pcl5')],
      [conditionalBattery]
    );
    const starts = [];
    const orc = createOrchestrator(config, { batteryId: 'b' }, {
      onQuestionnaireStart: (_, key) => starts.push(key),
    });
    orc.start();
    orc.currentEngine().advance();
    orc.currentEngine().recordAnswer('q1', 12);
    orc.currentEngine().advance();
    orc.engineComplete();
    expect(starts).toEqual(['phq9', 'pcl5']);
  });

  it('skips then branch when score below threshold', () => {
    const config = makeConfig(
      [makeQ('phq9', [select('q1')]), makeQ('pcl5')],
      [conditionalBattery]
    );
    const onComplete = vi.fn();
    const orc = createOrchestrator(config, { batteryId: 'b' }, { onSessionComplete: onComplete });
    orc.start();
    orc.currentEngine().advance();
    orc.currentEngine().recordAnswer('q1', 5);
    orc.currentEngine().advance();
    orc.engineComplete();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ─── instanceId / session key ─────────────────────────────────────────────────

describe('instanceId', () => {
  it('uses instanceId as session key when present', () => {
    const battery = {
      id: 'b', title: 'b',
      sequence: [{ questionnaireId: 'phq9', instanceId: 'phq9_pre' }],
    };
    const config = makeConfig([makeQ('phq9')], [battery]);
    const onStart = vi.fn();
    const orc = createOrchestrator(config, { batteryId: 'b' }, { onQuestionnaireStart: onStart });
    orc.start();
    expect(onStart.mock.calls[0][1]).toBe('phq9_pre');
  });
});

// ─── Cross-boundary back ──────────────────────────────────────────────────────

describe('engineCrossBack()', () => {
  it('does nothing when at first questionnaire', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const onStart = vi.fn();
    const orc = createOrchestrator(config, { batteryId: 'b' }, { onQuestionnaireStart: onStart });
    orc.start();
    orc.engineCrossBack();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('re-initializes previous questionnaire engine', () => {
    const config = makeConfig(
      [makeQ('phq9'), makeQ('gad7')],
      [linearBattery('b', 'phq9', 'gad7')]
    );
    const starts = [];
    const orc = createOrchestrator(config, { batteryId: 'b' }, {
      onQuestionnaireStart: (_, key) => starts.push(key),
    });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    orc.engineCrossBack();
    expect(starts).toEqual(['phq9', 'gad7', 'phq9']);
  });

  it('lands on last item of previous questionnaire', () => {
    const config = makeConfig(
      [makeQ('phq9'), makeQ('gad7')],
      [linearBattery('b', 'phq9', 'gad7')]
    );
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    drainEngine(orc.currentEngine());
    orc.engineComplete();
    orc.engineCrossBack();
    expect(orc.currentEngine().currentItem()).toEqual(select('q2'));
  });

  it('preserves answers from first pass on re-entry', () => {
    const config = makeConfig(
      [makeQ('phq9'), makeQ('gad7')],
      [linearBattery('b', 'phq9', 'gad7')]
    );
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    const engine = orc.currentEngine();
    engine.advance(); engine.recordAnswer('q1', 3);
    engine.advance(); engine.recordAnswer('q2', 1);
    engine.advance();
    orc.engineComplete();
    orc.engineCrossBack();
    expect(orc.currentEngine().answers()).toEqual({ q1: 3, q2: 1 });
  });
});

// ─── Progress ─────────────────────────────────────────────────────────────────

describe('progress()', () => {
  it('current starts at 1 after first questionnaire starts', () => {
    const config = makeConfig([makeQ('phq9')], [linearBattery('b', 'phq9')]);
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    expect(orc.progress().current).toBe(1);
  });

  it('total equals battery length for linear battery', () => {
    const config = makeConfig(
      [makeQ('phq9'), makeQ('gad7'), makeQ('pcl5')],
      [linearBattery('b', 'phq9', 'gad7', 'pcl5')]
    );
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    expect(orc.progress().total).toBe(3);
  });

  it('total is null for conditional battery', () => {
    const battery = {
      id: 'b', title: 'b',
      sequence: [
        { questionnaireId: 'phq9' },
        { type: 'if', condition: 'score.phq9 >= 10',
          then: [{ questionnaireId: 'pcl5' }], else: [] },
      ],
    };
    const config = makeConfig([makeQ('phq9'), makeQ('pcl5')], [battery]);
    const orc = createOrchestrator(config, { batteryId: 'b' });
    orc.start();
    expect(orc.progress().total).toBeNull();
  });

  it('works with sequence source — total reflects sequence length', () => {
    const config = makeConfig([makeQ('phq9'), makeQ('gad7')], []);
    const sequence = [{ questionnaireId: 'phq9' }, { questionnaireId: 'gad7' }];
    const orc = createOrchestrator(config, { sequence });
    orc.start();
    expect(orc.progress().total).toBe(2);
    expect(orc.progress().current).toBe(1);
  });
});
