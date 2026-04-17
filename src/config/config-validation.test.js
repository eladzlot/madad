import { describe, it, expect } from 'vitest';
import { collectConfigErrors, ConfigError, validateConfigData, checkCrossFileBatteryRefs } from './config-validation.js';

const minimalQ = (id = 'phq9') => ({
  id, title: 'Test',
  items: [{ id: 'q1', type: 'select', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
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


// ─── Binary item options ──────────────────────────────────────────────────────

describe('binary item options', () => {
  const binaryQ = (itemOverrides = {}) => ({
    id: 'screen', title: 'Screener',
    items: [{ id: 'q1', type: 'binary', text: 'Did this happen?', ...itemOverrides }],
    scoring: { method: 'none' }, alerts: [],
  });

  it('binary item without options is an error — explicit labels required', () => {
    const errors = collectConfigErrors(minimalConfig([binaryQ()]));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('no options') || e.includes('optionSetId') || e.includes('defaultOptionSetId'))).toBe(true);
  });

  it('binary item with inline options is valid', () => {
    const errors = collectConfigErrors(minimalConfig([binaryQ({
      options: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }],
    })]));
    expect(errors).toEqual([]);
  });

  it('binary item referencing a valid optionSetId is valid', () => {
    const q = {
      id: 'screen', title: 'Screener',
      optionSets: { yesno: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] },
      items: [{ id: 'q1', type: 'binary', text: 'Did this happen?', optionSetId: 'yesno' }],
      scoring: { method: 'none' }, alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });

  it('binary item referencing a missing optionSetId is an error', () => {
    const errors = collectConfigErrors(minimalConfig([binaryQ({ optionSetId: 'nonexistent' })]));
    expect(errors.some(e => e.includes('nonexistent'))).toBe(true);
  });

  it('pc-ptsd5 pattern: binary items with defaultOptionSetId+yesno are valid', () => {
    const q = {
      id: 'pc_ptsd5', title: 'PC-PTSD-5',
      defaultOptionSetId: 'yesno',
      optionSets: { yesno: [{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }] },
      items: [
        { id: 'intro', type: 'instructions', text: 'Intro text' },
        { id: 'exposure', type: 'binary', text: 'Trauma exposure?' },
        { id: '1', type: 'binary', text: 'Symptom 1' },
        { id: '2', type: 'binary', text: 'Symptom 2' },
        { id: '3', type: 'binary', text: 'Symptom 3' },
        { id: '4', type: 'binary', text: 'Symptom 4' },
        { id: '5', type: 'binary', text: 'Symptom 5' },
      ],
      scoring: { method: 'sum', exclude: ['exposure'] },
      alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });

  it('pc-ptsd5 pattern: binary items without any options are now an error', () => {
    const q = {
      id: 'pc_ptsd5', title: 'PC-PTSD-5',
      items: [
        { id: '1', type: 'binary', text: 'Symptom 1' },
      ],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.length).toBeGreaterThan(0);
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

// ─── checkScoringRefs ─────────────────────────────────────────────────────────

describe('scoring subscale item references', () => {
  const subscaleQ = (subscales, items) => ({
    id: 'q', title: 'Q',
    items,
    scoring: { method: 'subscales', subscales },
    alerts: [],
  });

  it('no error when all subscale item IDs exist', () => {
    const q = subscaleQ(
      { a: ['1', '2'] },
      [{ id: '1', type: 'select', text: 'Q1', options: [{ label: 'A', value: 0 }] },
       { id: '2', type: 'select', text: 'Q2', options: [{ label: 'A', value: 0 }] }]
    );
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });

  it('error when subscale references a non-existent item ID', () => {
    const q = subscaleQ(
      { a: ['1', 'ghost'] },
      [{ id: '1', type: 'select', text: 'Q1', options: [{ label: 'A', value: 0 }] }]
    );
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.some(e => e.includes('"ghost"'))).toBe(true);
  });

  it('includes questionnaire ID and subscale name in error message', () => {
    const q = subscaleQ({ mysub: ['missing'] }, [
      { id: '1', type: 'select', text: 'Q1', options: [{ label: 'A', value: 0 }] }
    ]);
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors[0]).toContain('"q"');
    expect(errors[0]).toContain('"mysub"');
    expect(errors[0]).toContain('"missing"');
  });

  it('skips questionnaires without subscales scoring', () => {
    const q = {
      id: 'q', title: 'Q',
      items: [{ id: '1', type: 'select', text: 'Q1', options: [{ label: 'A', value: 0 }] }],
      scoring: { method: 'sum' }, alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });

  it('finds item IDs inside if-node branches', () => {
    const q = {
      id: 'q', title: 'Q',
      items: [
        { id: 'gate', type: 'binary', text: 'Gate?', options: [{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }] },
        { id: 'cond', type: 'if', condition: 'item.gate == 1',
          then: [{ id: 'nested', type: 'select', text: 'N', options: [{ label: 'A', value: 0 }] }],
          else: [] }
      ],
      scoring: { method: 'subscales', subscales: { a: ['nested'] } },
      alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });
});

// ─── checkSliderItems ─────────────────────────────────────────────────────────

describe('slider item validation', () => {
  const sliderQ = (itemOverrides = {}) => ({
    id: 'q', title: 'Q',
    items: [{ id: 's1', type: 'slider', text: 'Rate it', min: 0, max: 10, ...itemOverrides }],
    scoring: { method: 'none' }, alerts: [],
  });

  it('valid slider has no errors', () => {
    expect(collectConfigErrors(minimalConfig([sliderQ()]))).toEqual([]);
  });

  it('error when min equals max', () => {
    const errors = collectConfigErrors(minimalConfig([sliderQ({ min: 5, max: 5 })]));
    expect(errors.some(e => e.includes('min') && e.includes('max'))).toBe(true);
  });

  it('error when min is greater than max', () => {
    const errors = collectConfigErrors(minimalConfig([sliderQ({ min: 10, max: 0 })]));
    expect(errors.some(e => e.includes('min'))).toBe(true);
  });

  it('error when step is zero', () => {
    const errors = collectConfigErrors(minimalConfig([sliderQ({ step: 0 })]));
    expect(errors.some(e => e.includes('step'))).toBe(true);
  });

  it('error when step is negative', () => {
    const errors = collectConfigErrors(minimalConfig([sliderQ({ step: -1 })]));
    expect(errors.some(e => e.includes('step'))).toBe(true);
  });

  it('no error when step is positive', () => {
    expect(collectConfigErrors(minimalConfig([sliderQ({ step: 0.5 })]))).toEqual([]);
  });

  it('no error when step is absent', () => {
    expect(collectConfigErrors(minimalConfig([sliderQ()]))).toEqual([]);
  });

  it('error message includes questionnaire ID and item ID', () => {
    const errors = collectConfigErrors(minimalConfig([sliderQ({ min: 10, max: 0 })]));
    expect(errors[0]).toContain('"q"');
    expect(errors[0]).toContain('"s1"');
  });
});

// ─── select item — no options error ──────────────────────────────────────────

describe('select item without options', () => {
  it('error when select item has no options, no optionSetId, no defaultOptionSetId', () => {
    const q = {
      id: 'q', title: 'Q',
      items: [{ id: '1', type: 'select', text: 'Q1' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.some(e => e.includes('missing options'))).toBe(true);
  });

  it('binary item without options gets a copy-pasteable כן/לא fix in the error', () => {
    const q = {
      id: 'q', title: 'Q',
      items: [{ id: '1', type: 'binary', text: 'Q1' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    const msg = errors.find(e => e.includes('missing options'));
    expect(msg).toBeDefined();
    expect(msg).toContain('כן');
    expect(msg).toContain('לא');
    expect(msg).toContain('defaultOptionSetId');
  });

  it('no error when select item uses defaultOptionSetId', () => {
    const q = {
      id: 'q', title: 'Q',
      defaultOptionSetId: 'scale',
      optionSets: { scale: [{ label: 'A', value: 0 }, { label: 'B', value: 1 }] },
      items: [{ id: '1', type: 'select', text: 'Q1' }],
      scoring: { method: 'none' }, alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });

  it('error when select item references missing optionSetId', () => {
    const q = {
      id: 'q', title: 'Q',
      optionSets: {},
      items: [{ id: '1', type: 'select', text: 'Q1', optionSetId: 'missing' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.some(e => e.includes('"missing"'))).toBe(true);
  });

  it('error on duplicate option values within same item', () => {
    const q = {
      id: 'q', title: 'Q',
      items: [{ id: '1', type: 'select', text: 'Q1',
        options: [{ label: 'A', value: 0 }, { label: 'B', value: 0 }] }],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.some(e => e.includes('duplicate'))).toBe(true);
  });
});

// ─── binary via optionSetId ───────────────────────────────────────────────────

describe('binary item via optionSetId', () => {
  it('error when binary references optionSetId with wrong count', () => {
    const q = {
      id: 'q', title: 'Q',
      optionSets: { yesno: [{ label: 'Yes', value: 1 }] }, // only 1 option — wrong
      items: [{ id: '1', type: 'binary', text: 'Q?', optionSetId: 'yesno' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const errors = collectConfigErrors(minimalConfig([q]));
    expect(errors.some(e => e.includes('exactly 2'))).toBe(true);
  });

  it('no error when binary via optionSetId has exactly 2 options', () => {
    const q = {
      id: 'q', title: 'Q',
      optionSets: { yesno: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] },
      items: [{ id: '1', type: 'binary', text: 'Q?', optionSetId: 'yesno' }],
      scoring: { method: 'none' }, alerts: [],
    };
    expect(collectConfigErrors(minimalConfig([q]))).toEqual([]);
  });
});

// ─── checkCrossFileBatteryRefs ────────────────────────────────────────────────

describe('checkCrossFileBatteryRefs', () => {
  const makeFile = (rel, questionnaires, batteries = [], dependencies = []) => ({
    rel,
    data: { questionnaires, batteries, dependencies },
  });

  const q = (id) => ({ id, title: id, items: [], scoring: { method: 'none' }, alerts: [] });

  const battery = (id, refs) => ({
    id,
    title: id,
    sequence: refs.map(r => ({ questionnaireId: r })),
  });

  it('no error when battery refs all exist in the same file', () => {
    const files = [makeFile('a.json', [q('phq9')], [battery('b1', ['phq9'])])];
    expect(checkCrossFileBatteryRefs(files)).toEqual([]);
  });

  it('no error when battery refs exist in a declared dependency', () => {
    const files = [
      makeFile('intake.json', [q('diamond')], [battery('intake_bat', ['diamond', 'phq9'])], ['configs/prod/standard.json']),
      makeFile('public/configs/prod/standard.json', [q('phq9')]),
    ];
    expect(checkCrossFileBatteryRefs(files)).toEqual([]);
  });

  it('error when battery refs a questionnaire not in file or dependencies', () => {
    const files = [
      makeFile('intake.json', [q('diamond')], [battery('intake_bat', ['spin'])]),
      makeFile('public/configs/prod/standard.json', [q('spin')]),
    ];
    const errors = checkCrossFileBatteryRefs(files);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"spin"');
    expect(errors[0]).toContain('"intake_bat"');
    expect(errors[0]).toContain('dependencies');
  });

  it('error message names the battery and the missing questionnaire', () => {
    const files = [makeFile('a.json', [], [battery('my_battery', ['missing_q'])])];
    const errors = checkCrossFileBatteryRefs(files);
    expect(errors[0]).toContain('"my_battery"');
    expect(errors[0]).toContain('"missing_q"');
  });

  it('reports all missing refs, not just the first', () => {
    const files = [makeFile('a.json', [], [battery('bat', ['q1', 'q2', 'q3'])])];
    expect(checkCrossFileBatteryRefs(files)).toHaveLength(3);
  });

  it('no error for files with no batteries', () => {
    const files = [makeFile('a.json', [q('phq9')]), makeFile('b.json', [q('gad7')])];
    expect(checkCrossFileBatteryRefs(files)).toEqual([]);
  });

  it('resolves refs inside if-node then branch as missing when dep undeclared', () => {
    const files = [
      makeFile('a.json', [], [{
        id: 'bat', title: 'bat',
        sequence: [{ type: 'if', condition: 'true', then: [{ questionnaireId: 'phq9' }], else: [] }],
      }]),
      makeFile('public/configs/prod/standard.json', [q('phq9')]),
    ];
    const errors = checkCrossFileBatteryRefs(files);
    expect(errors.some(e => e.includes('"phq9"'))).toBe(true);
  });

  it('no error for if-node ref when dependency is declared', () => {
    const files = [
      makeFile('a.json', [], [{
        id: 'bat', title: 'bat',
        sequence: [{ type: 'if', condition: 'true', then: [{ questionnaireId: 'phq9' }], else: [] }],
      }], ['configs/prod/standard.json']),
      makeFile('public/configs/prod/standard.json', [q('phq9')]),
    ];
    expect(checkCrossFileBatteryRefs(files)).toEqual([]);
  });

  it('regression: clinical_intake without standard.json catches spin and phq9', () => {
    const files = [
      makeFile('public/configs/prod/intake.json',
        [q('diamond')],
        [battery('clinical_intake', ['diamond', 'spin', 'phq9', 'pcl5'])],
        ['configs/prod/trauma.json']   // missing standard.json
      ),
      makeFile('public/configs/prod/standard.json', [q('spin'), q('phq9')]),
      makeFile('public/configs/prod/trauma.json',   [q('pcl5')]),
    ];
    const errors = checkCrossFileBatteryRefs(files);
    expect(errors.some(e => e.includes('"spin"'))).toBe(true);
    expect(errors.some(e => e.includes('"phq9"'))).toBe(true);
    // pcl5 is in declared trauma.json — must not appear
    expect(errors.some(e => e.includes('"pcl5"'))).toBe(false);
    // diamond is own — must not appear
    expect(errors.some(e => e.includes('"diamond"'))).toBe(false);
  });
});
