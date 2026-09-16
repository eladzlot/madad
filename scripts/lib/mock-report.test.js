/**
 * Tests for the mock report generator's scenario logic.
 *
 * These run against the REAL prod configs, not fixtures: the point of the
 * generator is that a scenario produces genuine scores from the shipped
 * instruments, so the tests should break if an instrument's shape changes
 * under them. Inline questionnaires are used only for the shapes no prod
 * config has (a scored slider).
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  ScenarioError,
  normalizeScenario,
  collectInstrumentIds,
  patientOutDir,
  loadQuestionnaires,
  answerableItems,
  optionValues,
  describeInstrument,
  answersForTotal,
  explicitAnswers,
  resolveInstrumentAnswers,
  buildSessionState,
  summarizeSession,
} from './mock-report.js';

const CONFIG_DIR = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'public/configs/prod');

const load = (...ids) => loadQuestionnaires(ids, CONFIG_DIR);
const phq9 = () => load('phq9').get('phq9');
const pcPtsd5 = () => load('pc_ptsd5').get('pc_ptsd5');

/** A full, valid PHQ-9 answer map with every item at `v`. */
const flatPhq9 = (v) => Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((id) => [id, v]));

// ─── normalizeScenario ────────────────────────────────────────────────────────

describe('normalizeScenario', () => {
  const session = { date: '2026-06-05', instruments: { phq9: 10 } };

  it('accepts a bare patient object', () => {
    const patients = normalizeScenario({ pid: 'A', sessions: [session] });
    expect(patients).toHaveLength(1);
    expect(patients[0].pid).toBe('A');
    expect(patients[0].name).toBeNull();
  });

  it('accepts a { patients: [...] } wrapper', () => {
    const patients = normalizeScenario({
      patients: [
        { pid: 'A', sessions: [session] },
        { pid: 'B', name: 'ב׳', sessions: [session] },
      ],
    });
    expect(patients.map((p) => p.pid)).toEqual(['A', 'B']);
    expect(patients[1].name).toBe('ב׳');
  });

  it('accepts a bare array of patients', () => {
    expect(normalizeScenario([{ pid: 'A', sessions: [session] }])).toHaveLength(1);
  });

  it('rejects a patient with no sessions', () => {
    expect(() => normalizeScenario({ pid: 'A', sessions: [] })).toThrow(ScenarioError);
    expect(() => normalizeScenario({ pid: 'A' })).toThrow(/"sessions" must be a non-empty array/);
  });

  it('rejects a malformed date', () => {
    expect(() => normalizeScenario({ sessions: [{ date: '5/6/2026', instruments: { phq9: 1 } }] })).toThrow(
      /must be YYYY-MM-DD/
    );
  });

  it('rejects a session with no instruments', () => {
    expect(() => normalizeScenario({ sessions: [{ date: '2026-06-05', instruments: {} }] })).toThrow(
      /"instruments" must be a non-empty object/
    );
  });

  it('defaults lang to Hebrew and accepts a patient-level or wrapper-level lang', () => {
    expect(normalizeScenario({ pid: 'A', sessions: [session] })[0].lang).toBe('he');
    expect(normalizeScenario({ pid: 'A', lang: 'en', sessions: [session] })[0].lang).toBe('en');
    const mixed = normalizeScenario({ lang: 'en', patients: [{ pid: 'A', sessions: [session] }, { pid: 'B', lang: 'he', sessions: [session] }] });
    expect(mixed.map((p) => p.lang)).toEqual(['en', 'he']);
  });

  it('rejects an unknown lang', () => {
    expect(() => normalizeScenario({ pid: 'A', lang: 'xx', sessions: [session] })).toThrow(/"lang" must be one of/);
    expect(() => normalizeScenario({ lang: 'xx', patients: [{ pid: 'A', sessions: [session] }] })).toThrow(/"lang" must be one of/);
  });

  it('collects every problem in one throw', () => {
    let err;
    try {
      normalizeScenario({
        patients: [
          { pid: 'A', sessions: [{ date: 'nope', instruments: {} }] },
          { pid: 'B' },
        ],
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ScenarioError);
    expect(err.problems).toHaveLength(3);
    expect(err.message).toContain('"A"');
    expect(err.message).toContain('"B"');
  });
});

describe('collectInstrumentIds', () => {
  it('dedupes across patients and sessions', () => {
    const patients = normalizeScenario([
      { pid: 'A', sessions: [{ date: '2026-06-05', instruments: { phq9: 1, gad7: 2 } }] },
      { pid: 'B', sessions: [{ date: '2026-06-05', instruments: { phq9: 3 } }] },
    ]);
    expect(collectInstrumentIds(patients).sort()).toEqual(['gad7', 'phq9']);
  });
});

describe('patientOutDir', () => {
  // Both CLIs derive output paths from this — generate-test-pdfs.mjs writes
  // there, generate-demo-shots.mjs reads from there without re-running the
  // build. They must agree by construction, so pin the shape.
  const p = (extra = {}) => ({ pid: 'DEMO-A', sessions: [], ...extra });

  it('writes an unnamed lone patient straight into the base directory', () => {
    expect(patientOutDir(p(), 0, 1, '/out')).toBe('/out');
  });

  it('honours an explicit `out` even for a lone patient', () => {
    // Naming a subdirectory and having it ignored scatters files into the
    // base directory alongside every other run.
    expect(patientOutDir(p({ out: 'course' }), 0, 1, '/out')).toBe('/out/course');
  });

  it('prefers an explicit `out` name for a set', () => {
    expect(patientOutDir(p({ out: 'remitting' }), 0, 2, '/out')).toBe('/out/remitting');
  });

  it('falls back to the pid', () => {
    expect(patientOutDir(p(), 1, 2, '/out')).toBe('/out/DEMO-A');
  });

  it('falls back to the patient index when there is no pid or out', () => {
    expect(patientOutDir(p({ pid: null }), 2, 3, '/out')).toBe('/out/patient-2');
  });
});

// ─── loadQuestionnaires ───────────────────────────────────────────────────────

describe('loadQuestionnaires', () => {
  it('loads a prod instrument by id and tags its configFile', () => {
    const q = phq9();
    expect(q.id).toBe('phq9');
    expect(q.configFile).toBe('phq9');
  });

  it('rejects an unknown instrument', () => {
    expect(() => load('not_an_instrument')).toThrow(/Cannot load config for instrument "not_an_instrument"/);
  });

  it('rejects a battery by name', () => {
    expect(() => load('clinical_intake')).toThrow(/batteries are not supported/);
  });
});

// ─── answerableItems / options ────────────────────────────────────────────────

describe('answerableItems', () => {
  it('returns the scored items and skips instructions', () => {
    expect(answerableItems(phq9()).map((i) => i.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('includes items excluded from the total — they are still answered', () => {
    // pc_ptsd5's `exposure` gate is in scoring.exclude but appears in the PDF.
    expect(answerableItems(pcPtsd5()).map((i) => i.id)).toEqual(['exposure', '1', '2', '3', '4', '5']);
  });

  it('rejects a branching instrument by name rather than mis-scoring it', () => {
    expect(() => answerableItems(load('cape42').get('cape42'))).toThrow(/contains a "if" node/);
  });

  it('rejects a scored item type it cannot answer', () => {
    const q = { id: 'fake', items: [{ id: 's', type: 'slider', min: 0, max: 10 }] };
    expect(() => answerableItems(q)).toThrow(/scored "slider" item \("s"\)/);
  });

  it('rejects an instrument with nothing scored', () => {
    expect(() => answerableItems({ id: 'empty', items: [{ id: 'i', type: 'instructions' }] })).toThrow(
      /no scored select\/binary items/
    );
  });
});

describe('optionValues', () => {
  it('resolves through the questionnaire default option set', () => {
    const q = phq9();
    expect(optionValues(answerableItems(q)[0], q)).toEqual([0, 1, 2, 3]);
  });

  it('resolves binary items', () => {
    const q = pcPtsd5();
    expect(optionValues(answerableItems(q)[0], q)).toEqual([1, 0]);
  });
});

describe('describeInstrument', () => {
  it('reports ids, prompts, options and excluded flags', () => {
    const rows = describeInstrument(pcPtsd5());
    expect(rows[0].id).toBe('exposure');
    expect(rows[0].type).toBe('binary');
    expect(rows[0].excluded).toBe(true);
    expect(rows[1].excluded).toBe(false);
    expect(rows[0].options).toEqual([
      { label: 'כן', value: 1 },
      { label: 'לא', value: 0 },
    ]);
  });
});

// ─── answersForTotal ──────────────────────────────────────────────────────────

describe('answersForTotal', () => {
  it('front-loads to hit the target exactly', () => {
    expect(answersForTotal(phq9(), 8)).toEqual({
      1: 3, 2: 3, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
    });
  });

  it('answers everything zero for a target of 0', () => {
    expect(answersForTotal(phq9(), 0)).toEqual(flatPhq9(0));
  });

  it('leaves excluded items out of the fill', () => {
    // `exposure` carries no score, so the greedy fill never assigns it.
    expect(answersForTotal(pcPtsd5(), 3)).toEqual({ 1: 1, 2: 1, 3: 1, 4: 0, 5: 0 });
  });

  it('refuses a target above the instrument maximum', () => {
    expect(() => answersForTotal(phq9(), 28)).toThrow(/Cannot reach total 28 for "phq9" \(short by 1\)/);
  });

  it('refuses a non-integer or negative target', () => {
    expect(() => answersForTotal(phq9(), 8.5)).toThrow(/non-negative integer/);
    expect(() => answersForTotal(phq9(), -1)).toThrow(/non-negative integer/);
  });
});

// ─── explicitAnswers ──────────────────────────────────────────────────────────

describe('explicitAnswers', () => {
  it('returns a copy of valid answers', () => {
    const provided = flatPhq9(1);
    const out = explicitAnswers(phq9(), provided);
    expect(out).toEqual(provided);
    expect(out).not.toBe(provided);
  });

  it('rejects an unknown item id', () => {
    const bad = { ...flatPhq9(1), 10: 1 };
    expect(() => explicitAnswers(phq9(), bad)).toThrow(/unknown item "10"/);
  });

  it('rejects a value outside the item option set', () => {
    const bad = { ...flatPhq9(1), 3: 4 };
    expect(() => explicitAnswers(phq9(), bad)).toThrow(/item "3" = 4 is not a legal option \(allowed: 0, 1, 2, 3\)/);
  });

  it('rejects unanswered scored items', () => {
    const partial = { 1: 1, 2: 1 };
    expect(() => explicitAnswers(phq9(), partial)).toThrow(/unanswered items: 3, 4, 5, 6, 7, 8, 9/);
  });

  it('requires excluded items to be answered too', () => {
    const missingExposure = { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 };
    expect(() => explicitAnswers(pcPtsd5(), missingExposure)).toThrow(/unanswered item: exposure/);
  });

  it('collects every problem in one throw and points at --describe', () => {
    let err;
    try {
      explicitAnswers(phq9(), { 1: 9, nope: 0 });
    } catch (e) {
      err = e;
    }
    expect(err.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown item "nope"'),
        expect.stringContaining('item "1" = 9 is not a legal option'),
        expect.stringContaining('unanswered items:'),
      ])
    );
    expect(err.message).toContain('--describe phq9');
  });

  it('rejects a non-object answers block', () => {
    expect(() => explicitAnswers(phq9(), [0, 1, 2])).toThrow(/must be an object keyed by item id/);
  });
});

// ─── resolveInstrumentAnswers ─────────────────────────────────────────────────

describe('resolveInstrumentAnswers', () => {
  it('treats a bare number as a target total', () => {
    const { answers, expectedTotal, derived } = resolveInstrumentAnswers(phq9(), 8);
    expect(expectedTotal).toBe(8);
    expect(derived).toBe(true);
    expect(Object.values(answers).reduce((a, b) => a + b, 0)).toBe(8);
  });

  it('treats { total } the same way', () => {
    expect(resolveInstrumentAnswers(phq9(), { total: 8 }).answers).toEqual(answersForTotal(phq9(), 8));
  });

  it('uses explicit answers verbatim, with no asserted total', () => {
    const { answers, expectedTotal, derived } = resolveInstrumentAnswers(phq9(), { answers: flatPhq9(2) });
    expect(answers).toEqual(flatPhq9(2));
    expect(expectedTotal).toBeNull();
    expect(derived).toBe(false);
  });

  it('carries an asserted total alongside explicit answers', () => {
    expect(resolveInstrumentAnswers(phq9(), { answers: flatPhq9(2), total: 18 }).expectedTotal).toBe(18);
  });

  it('rejects any other shape', () => {
    expect(() => resolveInstrumentAnswers(phq9(), 'severe')).toThrow(/expected a target total \(a number\) or/);
    expect(() => resolveInstrumentAnswers(phq9(), null)).toThrow(ScenarioError);
  });
});

// ─── buildSessionState ────────────────────────────────────────────────────────

describe('buildSessionState', () => {
  it('scores explicit answers with the real engine and fires real alerts', () => {
    const qs = load('phq9');
    // A moderate-severe presentation with passive suicidal ideation present.
    const answers = { 1: 3, 2: 3, 3: 2, 4: 3, 5: 1, 6: 2, 7: 2, 8: 1, 9: 1 };
    const state = buildSessionState(qs, { phq9: { answers } });

    expect(state.answers.phq9).toEqual(answers);
    expect(state.scores.phq9.total).toBe(18);
    expect(state.scores.phq9.category).toBe('בינוני-חמור');
    expect(state.alerts.phq9.map((a) => a.id)).toEqual(['suicidality']);
    expect(state.alerts.phq9[0].severity).toBe('critical');
    expect(state.questionnaireIds).toEqual({ phq9: 'phq9' });
  });

  it('keeps the suicidality alert quiet when item 9 is zero', () => {
    const state = buildSessionState(load('phq9'), { phq9: { answers: { ...flatPhq9(2), 9: 0 } } });
    expect(state.scores.phq9.total).toBe(16);
    expect(state.alerts.phq9).toEqual([]);
  });

  it('excludes the pc_ptsd5 gate from the total but keeps its answer', () => {
    const state = buildSessionState(load('pc_ptsd5'), {
      pc_ptsd5: { answers: { exposure: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0 } },
    });
    expect(state.scores.pc_ptsd5.total).toBe(4);
    expect(state.answers.pc_ptsd5.exposure).toBe(1);
  });

  it('fails when explicit answers contradict the asserted total', () => {
    expect(() =>
      buildSessionState(load('phq9'), { phq9: { answers: flatPhq9(1), total: 20 } })
    ).toThrow(/"phq9" scored 9, expected 20\. The supplied answers do not add up/);
  });

  it('handles several instruments in one session', () => {
    const qs = load('phq9', 'gad7');
    const state = buildSessionState(qs, { phq9: 10, gad7: 12 });
    expect(state.scores.phq9.total).toBe(10);
    expect(state.scores.gad7.total).toBe(12);
  });

  it('rejects an instrument that was never loaded', () => {
    expect(() => buildSessionState(load('phq9'), { gad7: 5 })).toThrow(/"gad7" not found in the loaded configs/);
  });
});

// ─── summarizeSession ─────────────────────────────────────────────────────────

describe('summarizeSession', () => {
  it('reports total, category and alerts', () => {
    const state = buildSessionState(load('phq9'), { phq9: { answers: { ...flatPhq9(3), 9: 1 } } });
    expect(summarizeSession(state)).toEqual(['phq9: 25 (חמור) ⚠ suicidality/critical']);
  });

  it('reports subscales when the instrument has them', () => {
    const state = buildSessionState(load('dass21'), { dass21: 21 });
    const [line] = summarizeSession(state);
    expect(line).toMatch(/^dass21: 21 \[/);
    expect(line).toContain('depression');
    expect(line).toContain('anxiety');
    expect(line).toContain('stress');
  });
});
