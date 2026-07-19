import { describe, it, expect, vi } from 'vitest';
import { buildCatalog, serializeCatalog, toToken, CATALOG_VERSION } from './build-catalog.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const selectItem = (id) => ({
  id, type: 'select', text: 'שאלה',
  options: [{ label: 'לא', value: 0 }, { label: 'כן', value: 1 }],
});

const meta = (overrides = {}) => ({
  domains: ['depression'], type: 'severity', populations: ['adult'], ...overrides,
});

function makeQ(id, overrides = {}) {
  return { id, title: `שאלון ${id}`, items: [selectItem('1'), selectItem('2')], meta: meta(), ...overrides };
}

function makeConfig(overrides = {}) {
  return { id: 'cfg', version: '1.0.0', questionnaires: [], ...overrides };
}

function build(manifestConfigs, byUrl, options) {
  return buildCatalog({ configs: manifestConfigs }, new Map(Object.entries(byUrl)), options);
}

const STD = '/configs/prod/standard.json';

// ── toToken ───────────────────────────────────────────────────────────────────

describe('toToken', () => {
  it('strips prod prefix and .json to a short name', () =>
    expect(toToken('/configs/prod/standard.json')).toBe('standard'));
  it('works without leading slash', () =>
    expect(toToken('configs/prod/trauma.json')).toBe('trauma'));
  it('keeps non-prod paths as relative paths', () =>
    expect(toToken('/configs/test/e2e.json')).toBe('configs/test/e2e.json'));
});

// ── entries ───────────────────────────────────────────────────────────────────

describe('buildCatalog entries', () => {
  it('maps questionnaire fields including meta', () => {
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('phq9', { description: 'תיאור', keywords: ['PHQ'], meta: meta({ featured: true, tags: ['CBT'] }) })] }) },
    );
    expect(cat.catalogVersion).toBe(CATALOG_VERSION);
    expect(cat.entries).toHaveLength(1);
    expect(cat.entries[0]).toMatchObject({
      id: 'phq9', kind: 'questionnaire', title: 'שאלון phq9', description: 'תיאור',
      keywords: ['PHQ'], source: 'standard', itemCount: 2, estMinutes: 1,
      hasConditional: false, domains: ['depression'], type: 'severity',
      populations: ['adult'], tags: ['CBT'], featured: true,
    });
  });

  it('defaults populations to adult, tags/featured/type to empty', () => {
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { meta: { domains: ['anxiety'] } })] }) },
    );
    expect(cat.entries[0]).toMatchObject({
      domains: ['anxiety'], type: null, populations: ['adult'], tags: [], featured: false,
    });
  });

  it('emits batteries before questionnaires per config, in manifest order', () => {
    const B = '/configs/prod/b.json';
    const cat = build(
      [{ name: 'Std', url: STD }, { name: 'B', url: B }],
      {
        [STD]: makeConfig({
          questionnaires: [makeQ('q1')],
          batteries: [{ id: 'bat1', title: 'סוללה', sequence: [{ questionnaireId: 'q1' }], meta: { domains: ['intake'] } }],
        }),
        [B]: makeConfig({ questionnaires: [makeQ('q2')] }),
      },
    );
    expect(cat.entries.map(e => e.id)).toEqual(['bat1', 'q1', 'q2']);
    expect(cat.entries[0].kind).toBe('battery');
  });

  it('truncates long descriptions at a word boundary with ellipsis', () => {
    const long = 'מילה '.repeat(60).trim(); // 359 chars
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { description: long })] }) },
    );
    const desc = cat.entries[0].description;
    expect(desc.length).toBeLessThanOrEqual(141);
    expect(desc.endsWith('…')).toBe(true);
    expect(desc).not.toContain('  ');
  });

  it('keeps short descriptions untouched', () => {
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { description: 'קצר' })] }) },
    );
    expect(cat.entries[0].description).toBe('קצר');
  });
});

// ── counting ──────────────────────────────────────────────────────────────────

describe('item counting and time estimates', () => {
  it('does not count instructions in itemCount', () => {
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { items: [{ id: 'i', type: 'instructions', text: 'הוראות' }, selectItem('1')] })] }) },
    );
    expect(cat.entries[0].itemCount).toBe(1);
  });

  it('counts randomize contents, flags if-nodes as conditional without counting them', () => {
    const items = [
      selectItem('1'),
      { id: 'r', type: 'randomize', ids: [selectItem('2'), selectItem('3')] },
      { id: 'c', type: 'if', condition: 'answers.1 >= 1', then: [selectItem('4')], else: [] },
    ];
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { items })] }) },
    );
    expect(cat.entries[0].itemCount).toBe(3); // 1 + randomize(2); if-branch not counted
    expect(cat.entries[0].hasConditional).toBe(true);
  });

  it('estMinutes rounds up and has a floor of 1', () => {
    const many = Array.from({ length: 30 }, (_, i) => selectItem(String(i + 1))); // 180s → 3min
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('few'), makeQ('many', { items: many })] }) },
    );
    expect(cat.entries.find(e => e.id === 'few').estMinutes).toBe(1);
    expect(cat.entries.find(e => e.id === 'many').estMinutes).toBe(3);
  });

  it('meta.durationMinutes overrides the computed estimate', () => {
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1', { meta: meta({ durationMinutes: 15 }) })] }) },
    );
    expect(cat.entries[0].estMinutes).toBe(15);
  });

  it('battery counts sum referenced questionnaires across configs', () => {
    const DEP = '/configs/prod/dep.json';
    const cat = build(
      [{ name: 'Std', url: STD }, { name: 'Dep', url: DEP }],
      {
        [STD]: makeConfig({
          questionnaires: [makeQ('q1')],
          batteries: [{
            id: 'bat', title: 'סוללה', meta: { domains: ['intake'] },
            sequence: [
              { questionnaireId: 'q1' },
              { questionnaireId: 'q_other' }, // lives in dep.json
              { type: 'if', condition: 'score.q1 >= 1', then: [{ questionnaireId: 'q1' }], else: [] },
            ],
          }],
        }),
        [DEP]: makeConfig({ questionnaires: [makeQ('q_other', { items: [selectItem('1'), selectItem('2'), selectItem('3')] })] }),
      },
    );
    const bat = cat.entries.find(e => e.id === 'bat');
    expect(bat.itemCount).toBe(5); // 2 + 3; if-branch not counted
    expect(bat.hasConditional).toBe(true);
  });

  it('warns and skips unresolvable battery refs', () => {
    const warn = vi.fn();
    const cat = build(
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1')], batteries: [{ id: 'bat', title: 'ס', sequence: [{ questionnaireId: 'missing' }], meta: { domains: ['intake'] } }] }) },
      { warn },
    );
    expect(cat.entries.find(e => e.id === 'bat').itemCount).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });
});

// ── flags / warnings ──────────────────────────────────────────────────────────

describe('flags, warnings', () => {
  it('propagates dev flag onto entries; non-dev entries carry no dev key', () => {
    const E = '/configs/test/e2e.json';
    const cat = build(
      [{ name: 'Std', url: STD }, { name: 'E2E', url: E, dev: true }],
      {
        [STD]: makeConfig({ questionnaires: [makeQ('q1')] }),
        [E]: makeConfig({ questionnaires: [makeQ('devq', { meta: undefined })] }),
      },
    );
    expect(cat.entries.find(e => e.id === 'devq')).toMatchObject({ dev: true, source: 'configs/test/e2e.json' });
    expect(cat.entries.find(e => e.id === 'q1')).not.toHaveProperty('dev');
  });

  it('hidden configs contribute no entries but their questionnaires still count in batteries', () => {
    const H = '/configs/prod/hiddencfg.json';
    const cat = build(
      [{ name: 'Std', url: STD }, { name: 'Hidden', url: H, hidden: true }],
      {
        [STD]: makeConfig({
          batteries: [{ id: 'bat', title: 'ס', sequence: [{ questionnaireId: 'hidden_q' }], meta: { domains: ['intake'] } }],
        }),
        [H]: makeConfig({ questionnaires: [makeQ('hidden_q')] }),
      },
    );
    expect(cat.entries.map(e => e.id)).toEqual(['bat']);
    expect(cat.entries[0].itemCount).toBe(2); // hidden_q's items still counted
  });

  it('warns on missing meta for non-dev configs only', () => {
    const warn = vi.fn();
    const E = '/configs/test/e2e.json';
    build(
      [{ name: 'Std', url: STD }, { name: 'E2E', url: E, dev: true }],
      {
        [STD]: makeConfig({ questionnaires: [makeQ('q1', { meta: undefined })] }),
        [E]: makeConfig({ questionnaires: [makeQ('devq', { meta: undefined })] }),
      },
      { warn },
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('q1'));
  });
});

// ── determinism ───────────────────────────────────────────────────────────────

describe('serializeCatalog', () => {
  it('same inputs produce byte-identical output', () => {
    const args = [
      [{ name: 'Std', url: STD }],
      { [STD]: makeConfig({ questionnaires: [makeQ('q1')] }) },
    ];
    const a = serializeCatalog(build(...args));
    const b = serializeCatalog(build(...args));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });
});
