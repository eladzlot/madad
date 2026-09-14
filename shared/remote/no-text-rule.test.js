import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  textItemIds, questionnaireHasText, sequenceQuestionnaireIds, remoteExcludedIds,
  remoteExclude, textInstrumentsIn,
} from './no-text-rule.js';
import { buildCatalog } from '../catalog/build-catalog.js';

const sel = (id) => ({ id, type: 'select', text: 'q', options: [{ label: 'a', value: 0 }] });
const txt = (id) => ({ id, type: 'text', text: 'free' });
const rated = (id) => ({ id, type: 'rated_text', text: 'r', min: 0, max: 10 });

describe('textItemIds / questionnaireHasText', () => {
  it('finds text and rated_text items, including inside if/randomize nodes', () => {
    const items = [
      sel('1'),
      { type: 'if', condition: 'true', then: [txt('t1')], else: [{ type: 'randomize', ids: [rated('r1'), sel('2')] }] },
    ];
    expect(textItemIds(items)).toEqual(['t1', 'r1']);
    expect(questionnaireHasText({ items })).toBe(true);
    expect(questionnaireHasText({ items: [sel('1'), { type: 'instructions', id: 'i', text: 'x' }] })).toBe(false);
    expect(questionnaireHasText(null)).toBe(false);
  });
});

describe('remoteExcludedIds', () => {
  const configs = [
    { id: 'clean', questionnaires: [{ id: 'clean', items: [sel('1')] }] },
    { id: 'chatty', questionnaires: [{ id: 'chatty', items: [sel('1'), txt('2')] }] },
    { id: 'devchatty', dev: true, questionnaires: [{ id: 'devchatty', items: [txt('1')] }] },
    { id: 'bat_ok', batteries: [{ id: 'bat_ok', sequence: [{ questionnaireId: 'clean' }] }] },
    { id: 'bat_bad', batteries: [{ id: 'bat_bad', sequence: [
      { questionnaireId: 'clean' },
      { type: 'if', condition: 'x', then: [{ questionnaireId: 'chatty' }], else: [] },
    ] }] },
  ];

  it('excludes text questionnaires and batteries that reach them; skips dev configs', () => {
    const ids = remoteExcludedIds(configs);
    expect([...ids].sort()).toEqual(['bat_bad', 'chatty']);
  });

  it('sequenceQuestionnaireIds recurses control-flow nodes', () => {
    expect(sequenceQuestionnaireIds(configs[4].batteries[0].sequence)).toEqual(['clean', 'chatty']);
  });

  it('plugs into buildCatalog as the exclude predicate', () => {
    const withMeta = configs.map(c => ({
      ...c, version: '1.0.0',
      questionnaires: (c.questionnaires ?? []).map(q => ({ ...q, title: q.id, meta: { domains: [] } })),
      batteries: (c.batteries ?? []).map(b => ({ ...b, title: b.id, meta: { domains: [] } })),
    }));
    const cat = buildCatalog(withMeta, { exclude: remoteExclude(remoteExcludedIds(withMeta)) });
    expect(cat.entries.map(e => e.id).sort()).toEqual(['bat_ok', 'clean', 'devchatty']);
  });
});

describe('textInstrumentsIn (merged config)', () => {
  it('lists non-dev questionnaires with text items', () => {
    const merged = { questionnaires: [
      { id: 'a', items: [sel('1')] },
      { id: 'b', items: [txt('1')] },
      { id: 'c', dev: true, items: [txt('1')] },
    ] };
    expect(textInstrumentsIn(merged).map(q => q.id)).toEqual(['b']);
    expect(textInstrumentsIn(undefined)).toEqual([]);
  });
});

describe('against the real prod configs', () => {
  const dir = join(process.cwd(), 'public/configs/prod');
  const configs = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));

  it('excludes exactly the instruments the spec names (REMOTE_SPEC §5.3)', () => {
    const ids = [...remoteExcludedIds(configs)].sort();
    expect(ids).toEqual([
      'anger_log', 'cpt_abc', 'cpt_alternative', 'cpt_exploring', 'cpt_patterns',
      'demographics', 'scq', 'top3',
    ]);
  });
});
