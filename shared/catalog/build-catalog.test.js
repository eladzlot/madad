import { describe, it, expect, vi } from 'vitest';
import { buildCatalog, serializeCatalog, CATALOG_VERSION } from './build-catalog.js';

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

// A per-instrument config file: one questionnaire, id = config id.
function qConfig(id, qOverrides = {}, cfgOverrides = {}) {
  return { id, version: '1.0.0', questionnaires: [makeQ(id, qOverrides)], ...cfgOverrides };
}

function batConfig(id, sequence, cfgOverrides = {}, batOverrides = {}) {
  return {
    id, version: '1.0.0', questionnaires: [],
    batteries: [{ id, title: `סוללה ${id}`, sequence, meta: { domains: ['intake'] }, ...batOverrides }],
    ...cfgOverrides,
  };
}

// ── entries ───────────────────────────────────────────────────────────────────

describe('buildCatalog entries', () => {
  it('maps questionnaire fields including meta', () => {
    const cat = buildCatalog([
      qConfig('phq9', { description: 'תיאור', keywords: ['PHQ'], meta: meta({ featured: true, tags: ['CBT'] }) }),
    ]);
    expect(cat.catalogVersion).toBe(CATALOG_VERSION);
    expect(cat.entries).toHaveLength(1);
    expect(cat.entries[0]).toMatchObject({
      id: 'phq9', kind: 'questionnaire', title: 'שאלון phq9', description: 'תיאור',
      keywords: ['PHQ'], itemCount: 2, estMinutes: 1,
      hasConditional: false, domains: ['depression'], type: 'severity',
      populations: ['adult'], tags: ['CBT'], featured: true,
    });
  });

  it('defaults populations to adult, tags/featured/type to empty', () => {
    const cat = buildCatalog([qConfig('q1', { meta: { domains: ['anxiety'] } })]);
    expect(cat.entries[0]).toMatchObject({
      domains: ['anxiety'], type: null, populations: ['adult'], tags: [], featured: false,
    });
  });

  it('emits entries in given config order (batteries before questionnaires within a config)', () => {
    const cat = buildCatalog([
      batConfig('bat1', [{ questionnaireId: 'q1' }]),
      qConfig('q1'),
      qConfig('q2'),
    ]);
    expect(cat.entries.map(e => e.id)).toEqual(['bat1', 'q1', 'q2']);
    expect(cat.entries[0].kind).toBe('battery');
  });

  it('truncates long descriptions at a word boundary with ellipsis', () => {
    const long = 'מילה '.repeat(60).trim();
    const cat = buildCatalog([qConfig('q1', { description: long })]);
    const desc = cat.entries[0].description;
    expect(desc.length).toBeLessThanOrEqual(141);
    expect(desc.endsWith('…')).toBe(true);
  });

  it('keeps short descriptions untouched', () => {
    const cat = buildCatalog([qConfig('q1', { description: 'קצר' })]);
    expect(cat.entries[0].description).toBe('קצר');
  });
});

// ── counting ──────────────────────────────────────────────────────────────────

describe('item counting and time estimates', () => {
  it('does not count instructions in itemCount', () => {
    const cat = buildCatalog([
      qConfig('q1', { items: [{ id: 'i', type: 'instructions', text: 'הוראות' }, selectItem('1')] }),
    ]);
    expect(cat.entries[0].itemCount).toBe(1);
  });

  it('counts randomize contents, flags if-nodes as conditional without counting them', () => {
    const items = [
      selectItem('1'),
      { id: 'r', type: 'randomize', ids: [selectItem('2'), selectItem('3')] },
      { id: 'c', type: 'if', condition: 'answers.1 >= 1', then: [selectItem('4')], else: [] },
    ];
    const cat = buildCatalog([qConfig('q1', { items })]);
    expect(cat.entries[0].itemCount).toBe(3);
    expect(cat.entries[0].hasConditional).toBe(true);
  });

  it('estMinutes rounds up and has a floor of 1', () => {
    const many = Array.from({ length: 30 }, (_, i) => selectItem(String(i + 1))); // 180s → 3min
    const cat = buildCatalog([qConfig('few'), qConfig('many', { items: many })]);
    expect(cat.entries.find(e => e.id === 'few').estMinutes).toBe(1);
    expect(cat.entries.find(e => e.id === 'many').estMinutes).toBe(3);
  });

  it('meta.durationMinutes overrides the computed estimate', () => {
    const cat = buildCatalog([qConfig('q1', { meta: meta({ durationMinutes: 15 }) })]);
    expect(cat.entries[0].estMinutes).toBe(15);
  });

  it('battery counts sum referenced questionnaires across config files', () => {
    const cat = buildCatalog([
      batConfig('bat', [
        { questionnaireId: 'q1' },
        { questionnaireId: 'q_other' },
        { type: 'if', condition: 'score.q1 >= 1', then: [{ questionnaireId: 'q1' }], else: [] },
      ]),
      qConfig('q1'),
      qConfig('q_other', { items: [selectItem('1'), selectItem('2'), selectItem('3')] }),
    ]);
    const bat = cat.entries.find(e => e.id === 'bat');
    expect(bat.itemCount).toBe(5); // 2 + 3; if-branch not counted
    expect(bat.hasConditional).toBe(true);
  });

  it('warns and skips unresolvable battery refs', () => {
    const warn = vi.fn();
    const cat = buildCatalog([batConfig('bat', [{ questionnaireId: 'missing' }])], { warn });
    expect(cat.entries.find(e => e.id === 'bat').itemCount).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });
});

// ── flags / warnings ──────────────────────────────────────────────────────────

describe('flags, warnings', () => {
  it('propagates a config dev flag onto its entries; others carry no dev key', () => {
    const cat = buildCatalog([
      qConfig('q1'),
      qConfig('devq', { meta: undefined }, { dev: true }),
    ]);
    expect(cat.entries.find(e => e.id === 'devq')).toMatchObject({ dev: true });
    expect(cat.entries.find(e => e.id === 'q1')).not.toHaveProperty('dev');
  });

  it('warns on missing meta for non-dev configs only', () => {
    const warn = vi.fn();
    buildCatalog([
      qConfig('q1', { meta: undefined }),
      qConfig('devq', { meta: undefined }, { dev: true }),
    ], { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('q1'));
  });
});

// ── determinism ───────────────────────────────────────────────────────────────

describe('serializeCatalog', () => {
  it('same inputs produce byte-identical output', () => {
    const configs = [qConfig('q1')];
    const a = serializeCatalog(buildCatalog(configs));
    const b = serializeCatalog(buildCatalog(configs));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });
});
