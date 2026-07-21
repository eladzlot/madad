import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPreviewModel, prettifyCondition } from './preview-model.js';

// ── Real prod configs ─────────────────────────────────────────────────────────
// Read a prod config file and merge in its declared dependencies (one level —
// enough for the batteries here, whose deps are all leaf questionnaires). This
// mirrors what loadConfig hands buildPreviewModel, without pulling in AJV.
function readProd(id) {
  const url = new URL(`../../../public/configs/prod/${id}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

function loadProd(id) {
  const root = readProd(id);
  const questionnaires = [...(root.questionnaires ?? [])];
  const batteries = [...(root.batteries ?? [])];
  for (const dep of root.dependencies ?? []) {
    const depId = dep.replace(/^.*\//, '').replace(/\.json$/, '');
    const depData = readProd(depId);
    questionnaires.push(...(depData.questionnaires ?? []));
    batteries.push(...(depData.batteries ?? []));
  }
  return { questionnaires, batteries };
}

const items = (model) => model.nodes.filter(n => n.kind === 'item');
const conditions = (model) => model.nodes.filter(n => n.kind === 'condition');

// ── prettifyCondition ─────────────────────────────────────────────────────────
describe('prettifyCondition', () => {
  it('prettifies comparison operators', () => {
    expect(prettifyCondition('item.9 >= 1')).toBe('item.9 ≥ 1');
    expect(prettifyCondition('x <= 2')).toBe('x ≤ 2');
    expect(prettifyCondition('x == 1')).toBe('x = 1');
    expect(prettifyCondition('x != 0')).toBe('x ≠ 0');
  });

  it('prettifies boolean operators to Hebrew words', () => {
    expect(prettifyCondition('a == 1 || b == 1')).toBe('a = 1 או b = 1');
    expect(prettifyCondition('a == 1 && b == 1')).toBe('a = 1 וגם b = 1');
  });

  it('does not resolve item references', () => {
    expect(prettifyCondition('count(item.p2_label) >= 1')).toBe('count(item.p2_label) ≥ 1');
  });

  it('is safe on null/empty', () => {
    expect(prettifyCondition(null)).toBe('');
    expect(prettifyCondition(undefined)).toBe('');
  });
});

// ── Questionnaire: phq9 (scored + ranges + alert) ─────────────────────────────
describe('buildPreviewModel — phq9', () => {
  const model = buildPreviewModel(loadProd('phq9'), 'phq9');

  it('is a questionnaire model with a summary', () => {
    expect(model.kind).toBe('questionnaire');
    expect(model.summary.title).toContain('PHQ-9');
    expect(model.summary.domains).toEqual(['depression']);
    expect(model.summary.type).toBe('severity');
    expect(model.summary.featured).toBe(true);
  });

  it('counts answerable items excluding instructions', () => {
    expect(model.summary.itemCount).toBe(9);
  });

  it('resolves select options from the default option set', () => {
    const first = items(model).find(n => n.type === 'select');
    expect(first.options).toHaveLength(4);
    expect(first.options[0]).toEqual({ label: 'כלל לא', value: 0 });
  });

  it('renders the instructions item as text-only (no options)', () => {
    const intro = items(model)[0];
    expect(intro.type).toBe('instructions');
    expect(intro.options).toBeUndefined();
  });

  it('passes scoring, interpretation ranges, and alerts', () => {
    expect(model.scoring.method).toBe('sum');
    expect(model.interpretations.ranges).toHaveLength(5);
    expect(model.alerts).toEqual([
      { severity: 'critical', message: 'אובדנות', condition: 'item.9 ≥ 1' },
    ]);
  });
});

// ── Questionnaire: top3 (nested item-level ifs, text, slider, required) ────────
describe('buildPreviewModel — top3', () => {
  const model = buildPreviewModel(loadProd('top3'), 'top3');

  it('marks required items', () => {
    const p1 = items(model).find(n => n.id === 'p1_label');
    expect(p1.type).toBe('text');
    expect(p1.inputType).toBe('multiline');
    expect(p1.required).toBe(true);
  });

  it('renders sliders with a range and labels', () => {
    const s = items(model).find(n => n.id === 'p1_severity');
    expect(s.range).toEqual({ min: 1, max: 12, labels: { min: 'במידה מועטה מאד', max: 'במידה רבה מאד' } });
  });

  it('emits an if condition entry with prettified DSL', () => {
    const ifs = conditions(model).filter(c => c.variant === 'if');
    expect(ifs.map(c => c.label)).toEqual([
      'count(item.p2_label) ≥ 1',
      'count(item.p3_label) ≥ 1',
    ]);
  });

  it('nests the inner condition and items one depth deeper', () => {
    const outer = conditions(model).find(c => c.label === 'count(item.p2_label) ≥ 1');
    const inner = conditions(model).find(c => c.label === 'count(item.p3_label) ≥ 1');
    expect(outer.depth).toBe(0);
    expect(inner.depth).toBe(1);
    const p2sev = items(model).find(n => n.id === 'p2_severity');
    const p3sev = items(model).find(n => n.id === 'p3_severity');
    expect(p2sev.depth).toBe(1);
    expect(p3sev.depth).toBe(2);
  });
});

// ── Questionnaire: all_types_q (every item type + option resolution) ──────────
describe('buildPreviewModel — all_types_q', () => {
  const model = buildPreviewModel(loadProd('all_types_q'), 'all_types_q');
  const byId = Object.fromEntries(items(model).map(n => [n.id, n]));

  it('resolves binary options from a named optionSet', () => {
    expect(byId.binary1.options).toEqual([
      { label: 'כן', value: 1 },
      { label: 'לא', value: 0 },
    ]);
  });

  it('uses inline select options when present', () => {
    expect(byId.select_mood.options).toHaveLength(4);
    expect(byId.select_mood.options[0]).toEqual({ label: 'מצוין', value: 3 });
  });

  it('carries slider range and text inputType', () => {
    expect(byId.slider1.range.min).toBe(0);
    expect(byId.slider1.range.max).toBe(10);
    expect(byId.text1.inputType).toBe('line');
  });

  it('renders multiselect positional options (label only)', () => {
    expect(byId.multi1.options).toHaveLength(4);
    expect(byId.multi1.options[0]).toEqual({ label: 'כאבי ראש' });
    expect(byId.multi1.options[0].value).toBeUndefined();
  });
});

// ── Battery: clinical_intake (battery-level ifs → titled steps) ───────────────
describe('buildPreviewModel — clinical_intake battery', () => {
  const model = buildPreviewModel(loadProd('clinical_intake'), 'clinical_intake');

  it('is a battery model', () => {
    expect(model.kind).toBe('battery');
    expect(model.summary.title).toBe('הערכה ראשונית');
  });

  it('lists the screener first with no condition', () => {
    const first = model.steps[0];
    expect(first.questionnaireId).toBe('diamond_sr');
    expect(first.condition).toBeUndefined();
    expect(first.sub.kind).toBe('questionnaire');
  });

  it('gates later questionnaires on a prettified condition and resolves titles', () => {
    const spin = model.steps.find(s => s.questionnaireId === 'spin');
    expect(spin.condition).toBe('item.diamond_sr.q1 = 1');
    expect(spin.branch).toBe('then');
    expect(spin.title).not.toBe('spin'); // resolved to the real Hebrew title
    expect(spin.sub.summary.itemCount).toBeGreaterThan(0);
  });
});

// ── Synthetic: randomize + non-empty else ─────────────────────────────────────
describe('buildPreviewModel — control-flow variants', () => {
  it('emits a randomize condition entry and nests its items', () => {
    const config = {
      questionnaires: [{
        id: 'rnd', title: 'R', items: [
          { type: 'randomize', ids: [
            { id: 'a', type: 'text', text: 'A' },
            { id: 'b', type: 'text', text: 'B' },
          ] },
        ],
      }],
    };
    const model = buildPreviewModel(config, 'rnd');
    const cond = conditions(model);
    expect(cond).toHaveLength(1);
    expect(cond[0].variant).toBe('randomize');
    expect(items(model).map(n => n.depth)).toEqual([1, 1]);
  });

  it('renders a non-empty else branch as its own condition group', () => {
    const config = {
      questionnaires: [{
        id: 'e', title: 'E', items: [
          { type: 'if', condition: 'item.x == 1',
            then: [{ id: 't', type: 'text', text: 'T' }],
            else: [{ id: 'f', type: 'text', text: 'F' }] },
        ],
      }],
    };
    const model = buildPreviewModel(config, 'e');
    const cond = conditions(model);
    expect(cond.map(c => c.variant)).toEqual(['if', 'else']);
    expect(items(model).find(n => n.id === 't').depth).toBe(1);
    expect(items(model).find(n => n.id === 'f').depth).toBe(1);
  });

  it('battery else branch carries branch:else', () => {
    const config = {
      batteries: [{
        id: 'b', title: 'B', sequence: [
          { type: 'if', condition: 'score.a > 5',
            then: [{ questionnaireId: 'qa' }],
            else: [{ questionnaireId: 'qb' }] },
        ],
      }],
      questionnaires: [
        { id: 'qa', title: 'QA', items: [{ id: '1', type: 'text', text: 'x' }] },
        { id: 'qb', title: 'QB', items: [{ id: '1', type: 'text', text: 'y' }] },
      ],
    };
    const model = buildPreviewModel(config, 'b');
    expect(model.steps.map(s => [s.questionnaireId, s.branch])).toEqual([
      ['qa', 'then'],
      ['qb', 'else'],
    ]);
    expect(model.steps[0].condition).toBe('score.a > 5');
  });
});

// ── Lookup ────────────────────────────────────────────────────────────────────
describe('buildPreviewModel — lookup', () => {
  it('returns null for an unknown id', () => {
    expect(buildPreviewModel({ questionnaires: [], batteries: [] }, 'nope')).toBeNull();
  });

  it('marks a battery step whose questionnaire is missing', () => {
    const config = { batteries: [{ id: 'b', title: 'B', sequence: [{ questionnaireId: 'gone' }] }], questionnaires: [] };
    const model = buildPreviewModel(config, 'b');
    expect(model.steps[0].missing).toBe(true);
    expect(model.steps[0].sub).toBeNull();
    expect(model.steps[0].title).toBe('gone');
  });
});
