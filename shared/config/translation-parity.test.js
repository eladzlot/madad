import { describe, it, expect } from 'vitest';
import { checkTranslationParity } from './translation-parity.js';

const he = () => ({
  id: 'phq9', version: '1.0.0',
  questionnaires: [{
    id: 'phq9',
    meta: { domains: ['depression'], type: 'severity', featured: true },
    title: 'שאלון דיכאון (PHQ-9)', description: 'תיאור', keywords: ['PHQ', 'דיכאון'],
    defaultOptionSetId: 'f4',
    optionSets: { f4: [{ label: 'כלל לא', value: 0 }, { label: 'כמעט כל יום', value: 3 }] },
    items: [
      { id: 'intro', type: 'instructions', text: 'הוראות' },
      { id: '1', type: 'select', text: 'פריט 1' },
      { id: 's', type: 'slider', text: 'מדרג', min: 0, max: 10, labels: { min: 'נמוך', max: 'גבוה' } },
    ],
    scoring: { method: 'subscales', subscales: { a: ['1'] } },
    subscaleLabels: { a: 'תת-סולם א' },
    interpretations: { target: 'total', type: 'severity', ranges: [{ min: 0, max: 4, label: 'מינימלי' }], cutoffs: [{ value: 10, label: 'סף' }] },
    alerts: [{ id: 'sui', condition: 'item.9 >= 1', message: 'אובדנות', severity: 'critical' }],
    psychometrics: { reliability: 0.89, sd: 5, source: 'Kroenke 2001' },
  }],
});

const en = () => {
  const c = he();
  c.version = '1.0.1';
  const q = c.questionnaires[0];
  q.meta.source = 'Kroenke et al. 2001 — English original';
  q.title = 'Patient Health Questionnaire (PHQ-9)'; q.description = 'Desc'; q.keywords = ['PHQ'];
  q.optionSets.f4[0].label = 'Not at all'; q.optionSets.f4[1].label = 'Nearly every day';
  q.items[0].text = 'Instructions'; q.items[1].text = 'Item 1'; q.items[2].text = 'Scale';
  q.items[2].labels = { min: 'low', max: 'high' };
  q.subscaleLabels.a = 'Subscale A';
  q.interpretations.ranges[0].label = 'Minimal'; q.interpretations.cutoffs[0].label = 'Cutoff';
  q.alerts[0].message = 'Suicidality';
  q.psychometrics.source = 'Kroenke 2001 (en)';
  return c;
};

describe('checkTranslationParity', () => {
  it('accepts a translation that changes only text, version and provenance', () => {
    expect(checkTranslationParity(he(), en(), 'en')).toEqual([]);
  });

  it('rejects a changed option value', () => {
    const t = en(); t.questionnaires[0].optionSets.f4[1].value = 4;
    const errs = checkTranslationParity(he(), t, 'en');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/optionSets\/f4\/1\/value/);
  });

  it('rejects a changed scoring block', () => {
    const t = en(); t.questionnaires[0].scoring.method = 'sum';
    expect(checkTranslationParity(he(), t, 'en')[0]).toMatch(/scoring\/method/);
  });

  it('rejects a missing item and an extra item', () => {
    const t = en(); t.questionnaires[0].items.pop();
    expect(checkTranslationParity(he(), t, 'en')[0]).toMatch(/items \(length 3 vs 2\)/);
    const t2 = en(); t2.questionnaires[0].items.push({ id: 'x', type: 'text', text: 'extra' });
    expect(checkTranslationParity(he(), t2, 'en')[0]).toMatch(/length/);
  });

  it('rejects a renamed subscale key but not a relabelled one', () => {
    const t = en(); t.questionnaires[0].subscaleLabels = { b: 'B' };
    expect(checkTranslationParity(he(), t, 'en')[0]).toMatch(/subscaleLabels\/(a|b)/);
  });

  it('rejects a changed alert condition or severity', () => {
    const t = en(); t.questionnaires[0].alerts[0].condition = 'item.9 >= 2';
    expect(checkTranslationParity(he(), t, 'en')[0]).toMatch(/alerts\/0\/condition/);
    const t2 = en(); t2.questionnaires[0].alerts[0].severity = 'warning';
    expect(checkTranslationParity(he(), t2, 'en')[0]).toMatch(/alerts\/0\/severity/);
  });

  it('rejects a changed meta taxonomy but not meta.source', () => {
    const t = en(); t.questionnaires[0].meta.domains = ['anxiety'];
    expect(checkTranslationParity(he(), t, 'en')[0]).toMatch(/meta\/domains/);
  });

  it('requires meta.source on translated questionnaires', () => {
    const t = en(); delete t.questionnaires[0].meta.source;
    const errs = checkTranslationParity(he(), t, 'en');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/meta\.source is required/);
  });

  it('ignores version and dev at the top level', () => {
    const t = en(); t.dev = true;
    const c = he(); c.version = '9.9.9';
    expect(checkTranslationParity(c, t, 'en')).toEqual([]);
  });

  it('requires dependencies rewritten into the language directory', () => {
    const c = he(); c.dependencies = ['configs/prod/pcl5.json', 'configs/prod/ptci.json'];
    const t = en(); t.dependencies = ['configs/prod/en/pcl5.json', 'configs/prod/en/ptci.json'];
    expect(checkTranslationParity(c, t, 'en')).toEqual([]);
    const bad = en(); bad.dependencies = ['configs/prod/pcl5.json', 'configs/prod/en/ptci.json'];
    const errs = checkTranslationParity(c, bad, 'en');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/dependencies/);
  });

  it('rejects a battery whose sequence changed', () => {
    const c = { id: 'b', version: '1', questionnaires: [], batteries: [{ id: 'b', title: 'ס', meta: { domains: ['intake'] }, sequence: [{ questionnaireId: 'q1' }] }] };
    const t = { id: 'b', version: '1', questionnaires: [], batteries: [{ id: 'b', title: 'B', meta: { domains: ['intake'] }, sequence: [{ questionnaireId: 'q2' }] }] };
    expect(checkTranslationParity(c, t, 'en')[0]).toMatch(/sequence\/0\/questionnaireId/);
  });
});
