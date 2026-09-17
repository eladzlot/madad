import { describe, it, expect } from 'vitest';
import { createQuestionnaireTimer } from './questionnaire-timer.js';

const T0 = Date.parse('2026-09-17T10:00:00Z');

function makeTimer() {
  let now = T0;
  const timer = createQuestionnaireTimer({ clock: () => now });
  return { timer, tick: ms => { now += ms; } };
}

describe('createQuestionnaireTimer', () => {
  it('records startedAt as an ISO timestamp of creation', () => {
    const { timer } = makeTimer();
    expect(timer.snapshot().startedAt).toBe('2026-09-17T10:00:00.000Z');
  });

  it('accrues wall and focus equally while visible', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    tick(5000);
    expect(timer.snapshot().questionnaires.phq9).toEqual({ wallMs: 5000, focusMs: 5000, visits: 1 });
  });

  it('counts a hidden span towards wall but not focus', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    tick(1000);
    timer.hide();
    tick(3000);
    timer.show();
    tick(1000);
    expect(timer.snapshot().questionnaires.phq9).toEqual({ wallMs: 5000, focusMs: 2000, visits: 1 });
  });

  it('splits a hidden span across an enter() between two questionnaires', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    timer.hide();
    tick(2000);
    timer.enter('gad7');
    tick(3000);
    timer.show();
    tick(1000);
    const q = timer.snapshot().questionnaires;
    expect(q.phq9).toEqual({ wallMs: 2000, focusMs: 0, visits: 1 });
    expect(q.gad7).toEqual({ wallMs: 4000, focusMs: 1000, visits: 1 });
  });

  it('ignores a repeated hide() and a show() without a hide()', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    timer.show();
    tick(1000);
    timer.hide();
    tick(1000);
    timer.hide();
    tick(1000);
    timer.show();
    expect(timer.snapshot().questionnaires.phq9).toEqual({ wallMs: 3000, focusMs: 1000, visits: 1 });
  });

  it('accrues nothing while no questionnaire is current (welcome, results)', () => {
    const { timer, tick } = makeTimer();
    tick(1000);                  // before the first questionnaire
    timer.enter('phq9');
    tick(2000);
    timer.enter(null);           // results screen
    tick(10_000);
    const snap = timer.snapshot();
    expect(snap.questionnaires).toEqual({ phq9: { wallMs: 2000, focusMs: 2000, visits: 1 } });
  });

  it('re-entering a questionnaire adds to the same bucket and bumps visits', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    tick(2000);
    timer.enter(null);
    tick(500);
    timer.enter('phq9');
    tick(1000);
    expect(timer.snapshot().questionnaires.phq9).toEqual({ wallMs: 3000, focusMs: 3000, visits: 2 });
  });

  it('snapshot() is non-destructive', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    tick(1000);
    const a = timer.snapshot();
    tick(1000);
    const b = timer.snapshot();
    expect(a.questionnaires.phq9.wallMs).toBe(1000);
    expect(b.questionnaires.phq9.wallMs).toBe(2000);
  });

  it('clamps a clock that steps backwards to zero', () => {
    const { timer, tick } = makeTimer();
    timer.enter('phq9');
    tick(-5000);
    timer.enter('gad7');
    tick(1000);
    const q = timer.snapshot().questionnaires;
    expect(q.phq9.wallMs).toBe(0);
    expect(q.gad7.wallMs).toBe(1000);
  });

  it('survives a JSON round-trip with integer milliseconds', () => {
    let now = T0;
    const timer = createQuestionnaireTimer({ clock: () => now });
    timer.enter('phq9');
    now += 1234.56;
    const snap = JSON.parse(JSON.stringify(timer.snapshot()));
    expect(Number.isInteger(snap.questionnaires.phq9.wallMs)).toBe(true);
    expect(snap.questionnaires.phq9.wallMs).toBe(1235);
  });
});
