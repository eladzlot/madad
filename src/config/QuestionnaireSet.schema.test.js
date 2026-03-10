import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import schema from './QuestionnaireSet.schema.json' with { type: 'json' };

let validate;
beforeAll(() => {
  const ajv = new Ajv({ allErrors: true });
  validate = ajv.compile(schema);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function valid(doc) {
  const ok = validate(doc);
  if (!ok) console.error(validate.errors);
  return ok;
}

function invalid(doc) {
  return !validate(doc);
}

// ─── Minimal valid config ─────────────────────────────────────────────────────

const minimalConfig = {
  id: 'test',
  version: '1.0.0',
  questionnaires: [],
};

const likertItem = {
  id: '1',
  type: 'likert',
  text: 'שאלה',
  options: [
    { label: 'כלל לא', value: 0 },
    { label: 'מעט', value: 1 },
  ],
};

const binaryItem = {
  id: '2',
  type: 'binary',
  text: 'האם?',
};

const instructionsItem = {
  id: 'intro',
  type: 'instructions',
  text: 'הוראות',
};

function makeQuestionnaire(overrides = {}) {
  return {
    id: 'q1',
    title: 'שאלון',
    items: [likertItem],
    ...overrides,
  };
}

// ─── Top-level structure ──────────────────────────────────────────────────────

describe('top-level', () => {
  it('accepts minimal valid config',   () => expect(valid(minimalConfig)).toBe(true));
  it('rejects missing id',             () => expect(invalid({ version: '1.0', questionnaires: [] })).toBe(true));
  it('rejects missing version',        () => expect(invalid({ id: 'x', questionnaires: [] })).toBe(true));
  it('rejects missing questionnaires', () => expect(invalid({ id: 'x', version: '1.0' })).toBe(true));
  it('rejects unknown top-level field',() => expect(invalid({ ...minimalConfig, foo: 'bar' })).toBe(true));
});

// ─── ID pattern ───────────────────────────────────────────────────────────────

describe('id pattern', () => {
  it('accepts letters and digits',       () => expect(valid({ ...minimalConfig, id: 'abc123' })).toBe(true));
  it('accepts underscores',              () => expect(valid({ ...minimalConfig, id: 'a_b_c' })).toBe(true));
  it('rejects hyphens',                  () => expect(invalid({ ...minimalConfig, id: 'a-b' })).toBe(true));
  it('rejects id starting with hyphen',  () => expect(invalid({ ...minimalConfig, id: '-abc' })).toBe(true));
  it('rejects id with spaces',           () => expect(invalid({ ...minimalConfig, id: 'a b' })).toBe(true));
  it('rejects id with dot',              () => expect(invalid({ ...minimalConfig, id: 'a.b' })).toBe(true));
  it('rejects empty id',                 () => expect(invalid({ ...minimalConfig, id: '' })).toBe(true));
});

// ─── optionSets (questionnaire-level) ────────────────────────────────────────

describe('optionSets', () => {
  it('accepts valid option set on questionnaire', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      optionSets: {
        freq_4: [
          { label: 'כלל לא', value: 0 },
          { label: 'מספר ימים', value: 1 },
        ],
      },
    })],
  })).toBe(true));

  it('accepts defaultOptionSetId on questionnaire', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({ defaultOptionSetId: 'freq_4' })],
  })).toBe(true));

  it('rejects option set key with invalid id format', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      optionSets: { 'bad key': [{ label: 'x', value: 0 }, { label: 'y', value: 1 }] },
    })],
  })).toBe(true));

  it('rejects option set with only one option', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      optionSets: { freq: [{ label: 'כלל לא', value: 0 }] },
    })],
  })).toBe(true));

  it('rejects option missing label', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      optionSets: { freq: [{ value: 0 }, { label: 'y', value: 1 }] },
    })],
  })).toBe(true));
});

// ─── Questionnaire ────────────────────────────────────────────────────────────

describe('questionnaire', () => {
  it('accepts valid questionnaire', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire()],
  })).toBe(true));

  it('rejects questionnaire without title', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [{ id: 'q1', items: [likertItem] }],
  })).toBe(true));

  it('rejects questionnaire with empty items array', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [{ id: 'q1', title: 'שאלון', items: [] }],
  })).toBe(true));
});

// ─── Likert item ──────────────────────────────────────────────────────────────

describe('likert item', () => {
  it('accepts inline options', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({ items: [likertItem] })],
  })).toBe(true));

  it('accepts optionSetId', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ id: '1', type: 'likert', text: 'שאלה', optionSetId: 'freq_4' }],
    })],
  })).toBe(true));

  it('accepts neither options nor optionSetId (defers to defaultOptionSetId)', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      defaultOptionSetId: 'freq_4',
      items: [{ id: '1', type: 'likert', text: 'שאלה' }],
    })],
  })).toBe(true));

  it('rejects both options and optionSetId', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{
        id: '1', type: 'likert', text: 'שאלה',
        options: [{ label: 'x', value: 0 }, { label: 'y', value: 1 }],
        optionSetId: 'freq_4',
      }],
    })],
  })).toBe(true));

  it('rejects missing text', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ id: '1', type: 'likert', options: [{ label: 'x', value: 0 }, { label: 'y', value: 1 }] }],
    })],
  })).toBe(true));

  it('accepts reverse and weight', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ ...likertItem, reverse: true, weight: 2 }],
    })],
  })).toBe(true));
});

// ─── Binary item ──────────────────────────────────────────────────────────────

describe('binary item', () => {
  it('accepts minimal binary item', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({ items: [binaryItem] })],
  })).toBe(true));

  it('accepts custom labels', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ ...binaryItem, labels: { yes: 'כן', no: 'לא' } }],
    })],
  })).toBe(true));

  it('rejects labels missing yes', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ ...binaryItem, labels: { no: 'לא' } }],
    })],
  })).toBe(true));
});

// ─── Instructions item ────────────────────────────────────────────────────────

describe('instructions item', () => {
  it('accepts valid instructions item', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({ items: [instructionsItem] })],
  })).toBe(true));

  it('rejects instructions with extra fields', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [{ ...instructionsItem, options: [] }],
    })],
  })).toBe(true));
});

// ─── If node (item level) ─────────────────────────────────────────────────────

describe('if node (item level)', () => {
  it('accepts valid if node', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [
        likertItem,
        { id: 'branch', type: 'if', condition: 'item.1 >= 2',
          then: [{ id: '2a', type: 'likert', text: 'follow-up' }],
          else: [{ id: '2b', type: 'likert', text: 'alternate' }] },
      ],
    })],
  })).toBe(true));

  it('accepts if node with empty else', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [
        likertItem,
        { id: 'branch', type: 'if', condition: 'item.1 >= 2',
          then: [{ id: '2a', type: 'likert', text: 'follow-up' }],
          else: [] },
      ],
    })],
  })).toBe(true));

  it('rejects if node missing else', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [
        likertItem,
        { id: 'branch', type: 'if', condition: 'item.1 >= 2',
          then: [{ id: '2a', type: 'likert', text: 'follow-up' }] },
      ],
    })],
  })).toBe(true));
});

// ─── Randomize node ───────────────────────────────────────────────────────────

describe('randomize node', () => {
  it('accepts valid randomize node', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [
        { id: 'rand', type: 'randomize', ids: [
          { id: '1', type: 'likert', text: 'שאלה א' },
          { id: '2', type: 'binary', text: 'שאלה ב' },
        ]},
        likertItem,
      ],
    })],
  })).toBe(true));

  it('rejects randomize with only one id', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      items: [
        { id: 'rand', type: 'randomize', ids: [
          { id: '1', type: 'likert', text: 'שאלה' },
        ]},
        likertItem,
      ],
    })],
  })).toBe(true));
});

// ─── Scoring ──────────────────────────────────────────────────────────────────

describe('scoring', () => {
  it('accepts sum scoring', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: { method: 'sum', maxPerItem: 3 },
    })],
  })).toBe(true));

  it('accepts subscales scoring with subscales map', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: {
        method: 'subscales',
        subscales: { somatic: ['1', '2'], cognitive: ['3', '4'] },
      },
    })],
  })).toBe(true));

  it('rejects subscales method without subscales map', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: { method: 'subscales' },
    })],
  })).toBe(true));

  it('accepts custom method with formula', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: { method: 'custom', customFormula: 'sum(item.1, item.2)' },
    })],
  })).toBe(true));

  it('rejects custom method without formula', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: { method: 'custom' },
    })],
  })).toBe(true));

  it('rejects subscales key with invalid id format', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      scoring: {
        method: 'subscales',
        subscales: { 'bad key': ['1'] },
      },
    })],
  })).toBe(true));
});

// ─── Interpretations ─────────────────────────────────────────────────────────

describe('interpretations', () => {
  it('accepts valid interpretations', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      interpretations: {
        target: 'total',
        ranges: [
          { min: 0, max: 9, label: 'קל' },
          { min: 10, max: 27, label: 'חמור' },
        ],
      },
    })],
  })).toBe(true));

  it('rejects interpretations with empty ranges', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      interpretations: { ranges: [] },
    })],
  })).toBe(true));
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

describe('alerts', () => {
  it('accepts valid alert', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      alerts: [{ id: 'suid', condition: 'item.9 >= 1', message: 'אזהרה' }],
    })],
  })).toBe(true));

  it('accepts alert with severity', () => expect(valid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      alerts: [{ id: 'suid', condition: 'item.9 >= 1', message: 'אזהרה', severity: 'critical' }],
    })],
  })).toBe(true));

  it('rejects alert with unknown severity', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      alerts: [{ id: 'suid', condition: 'item.9 >= 1', message: 'אזהרה', severity: 'extreme' }],
    })],
  })).toBe(true));

  it('rejects alert missing message', () => expect(invalid({
    ...minimalConfig,
    questionnaires: [makeQuestionnaire({
      alerts: [{ id: 'suid', condition: 'item.9 >= 1' }],
    })],
  })).toBe(true));
});

// ─── Batteries ───────────────────────────────────────────────────────────────

describe('batteries', () => {
  it('accepts simple battery', () => expect(valid({
    ...minimalConfig,
    batteries: [{
      id: 'standard',
      title: 'הערכה ראשונית',
      sequence: [{ questionnaireId: 'phq9' }],
    }],
  })).toBe(true));

  it('accepts battery with if node', () => expect(valid({
    ...minimalConfig,
    batteries: [{
      id: 'standard',
      title: 'הערכה',
      sequence: [
        { questionnaireId: 'phq9' },
        {
          type: 'if',
          condition: 'score.phq9 >= 10',
          then: [{ questionnaireId: 'pcl5' }],
          else: [],
        },
      ],
    }],
  })).toBe(true));

  it('accepts battery with randomize node', () => expect(valid({
    ...minimalConfig,
    batteries: [{
      id: 'rand_battery',
      title: 'מקרי',
      sequence: [{ type: 'randomize', ids: [
        { questionnaireId: 'phq9' },
        { questionnaireId: 'gad7' },
      ]}],
    }],
  })).toBe(true));

  it('rejects battery with empty sequence', () => expect(invalid({
    ...minimalConfig,
    batteries: [{ id: 'empty', title: 'ריק', sequence: [] }],
  })).toBe(true));

  it('rejects battery if node missing else', () => expect(invalid({
    ...minimalConfig,
    batteries: [{
      id: 'b',
      title: 'x',
      sequence: [{
        type: 'if',
        condition: 'score.phq9 >= 10',
        then: [{ questionnaireId: 'pcl5' }],
      }],
    }],
  })).toBe(true));
});

// ─── Full example from spec ───────────────────────────────────────────────────

describe('full example', () => {
  it('validates the full example from CONFIG_SCHEMA_SPEC.md', () => expect(valid({
    id: 'standard',
    version: '1.0.0',
    questionnaires: [
      {
        id: 'phq9',
        title: 'PHQ-9',
        defaultOptionSetId: 'frequency_4',
        optionSets: {
          frequency_4: [
            { label: 'כלל לא',           value: 0 },
            { label: 'מספר ימים',         value: 1 },
            { label: 'יותר ממחצית הזמן', value: 2 },
            { label: 'כמעט כל יום',       value: 3 },
          ],
        },
        items: [
          { id: 'intro', type: 'instructions', text: 'הוראות' },
          { id: '1', type: 'likert', text: 'חוסר עניין' },
          { id: '9', type: 'likert', text: 'מחשבות אובדניות' },
        ],
        scoring: { method: 'sum', maxPerItem: 3 },
        interpretations: {
          target: 'total',
          ranges: [
            { min: 0,  max: 4,  label: 'מינימלי' },
            { min: 5,  max: 9,  label: 'קל' },
            { min: 10, max: 14, label: 'בינוני' },
            { min: 15, max: 19, label: 'בינוני-חמור' },
            { min: 20, max: 27, label: 'חמור' },
          ],
        },
        alerts: [{
          id: 'suicidality',
          condition: 'item.9 >= 1',
          message: 'פריט 9 — דיווח על מחשבות אובדניות',
        }],
      },
    ],
    batteries: [{
      id: 'standard_intake',
      title: 'הערכה ראשונית',
      sequence: [
        { questionnaireId: 'phq9' },
        {
          type: 'if',
          condition: 'score.phq9 >= 10',
          then: [{ questionnaireId: 'pcl5' }],
          else: [],
        },
      ],
    }],
  })).toBe(true));
});
