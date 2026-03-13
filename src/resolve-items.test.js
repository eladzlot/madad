import { describe, it, expect } from 'vitest';
import { resolveItems, ItemResolutionError } from './resolve-items.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeQ = (id) => ({ id, title: id, items: [], scoring: { method: 'none' }, alerts: [] });
const makeBattery = (id, sequence) => ({ id, title: id, sequence });
const makeConfig = ({ questionnaires = [], batteries = [] } = {}) => ({ questionnaires, batteries });

// ─── Basic resolution ─────────────────────────────────────────────────────────

describe('basic resolution', () => {
  it('resolves a single questionnaire token', () => {
    const config = makeConfig({ questionnaires: [makeQ('phq9')] });
    expect(resolveItems(['phq9'], config)).toEqual([{ questionnaireId: 'phq9' }]);
  });

  it('resolves multiple tokens in order', () => {
    const config = makeConfig({ questionnaires: [makeQ('phq9'), makeQ('gad7'), makeQ('pcl5')] });
    expect(resolveItems(['phq9', 'gad7', 'pcl5'], config)).toEqual([
      { questionnaireId: 'phq9' },
      { questionnaireId: 'gad7' },
      { questionnaireId: 'pcl5' },
    ]);
  });

  it('returns empty array for empty tokens', () => {
    expect(resolveItems([], makeConfig())).toEqual([]);
  });
});

// ─── Battery expansion ────────────────────────────────────────────────────────

describe('battery expansion', () => {
  it('expands a battery token into its sequence', () => {
    const battery = makeBattery('intake', [{ questionnaireId: 'phq9' }, { questionnaireId: 'gad7' }]);
    const config = makeConfig({ questionnaires: [makeQ('phq9'), makeQ('gad7')], batteries: [battery] });
    expect(resolveItems(['intake'], config)).toEqual([
      { questionnaireId: 'phq9' },
      { questionnaireId: 'gad7' },
    ]);
  });

  it('mixes batteries and questionnaires in token list', () => {
    const battery = makeBattery('intake', [{ questionnaireId: 'phq9' }]);
    const config = makeConfig({ questionnaires: [makeQ('phq9'), makeQ('gad7')], batteries: [battery] });
    expect(resolveItems(['intake', 'gad7'], config)).toEqual([
      { questionnaireId: 'phq9' },
      { questionnaireId: 'gad7' },
    ]);
  });

  it('preserves if-node control flow when expanding battery', () => {
    const battery = makeBattery('b', [
      { questionnaireId: 'phq9' },
      { type: 'if', condition: 'score.phq9 >= 10', then: [{ questionnaireId: 'pcl5' }], else: [] },
    ]);
    const config = makeConfig({ questionnaires: [makeQ('phq9'), makeQ('pcl5')], batteries: [battery] });
    const seq = resolveItems(['b'], config);
    expect(seq).toHaveLength(2);
    expect(seq[1]).toMatchObject({ type: 'if', condition: 'score.phq9 >= 10' });
    expect(seq[1].then).toEqual([{ questionnaireId: 'pcl5' }]);
  });

  it('preserves randomize-node when expanding battery', () => {
    const battery = makeBattery('b', [{ type: 'randomize', ids: [{ questionnaireId: 'phq9' }, { questionnaireId: 'gad7' }] }]);
    const config = makeConfig({ questionnaires: [makeQ('phq9'), makeQ('gad7')], batteries: [battery] });
    const seq = resolveItems(['b'], config);
    expect(seq[0].type).toBe('randomize');
    expect(seq[0].ids).toHaveLength(2);
  });

  it('preserves instanceId on refs within battery', () => {
    const battery = makeBattery('b', [{ questionnaireId: 'phq9', instanceId: 'phq9_pre' }]);
    const config = makeConfig({ questionnaires: [makeQ('phq9')], batteries: [battery] });
    expect(resolveItems(['b'], config)[0]).toEqual({ questionnaireId: 'phq9', instanceId: 'phq9_pre' });
  });
});

// ─── Not found ────────────────────────────────────────────────────────────────

describe('not found', () => {
  it('throws ItemResolutionError for unknown token', () => {
    expect(() => resolveItems(['unknown'], makeConfig())).toThrow(ItemResolutionError);
  });

  it('error message names the token', () => {
    let err;
    try { resolveItems(['missing_q'], makeConfig()); } catch (e) { err = e; }
    expect(err.message).toContain('missing_q');
    expect(err.token).toBe('missing_q');
  });

  it('throws for battery referencing a questionnaire not in config', () => {
    const battery = makeBattery('b', [{ questionnaireId: 'ghost' }]);
    const config = makeConfig({ batteries: [battery] });
    expect(() => resolveItems(['b'], config)).toThrow(ItemResolutionError);
  });

  it('error for missing battery-internal ref names the internal qid', () => {
    const battery = makeBattery('b', [{ questionnaireId: 'ghost' }]);
    const config = makeConfig({ batteries: [battery] });
    let err;
    try { resolveItems(['b'], config); } catch (e) { err = e; }
    expect(err.token).toBe('ghost');
  });
});

// ─── Cross-entity collision ───────────────────────────────────────────────────

describe('cross-entity collision (token is both questionnaire and battery)', () => {
  it('throws ItemResolutionError', () => {
    const config = makeConfig({
      questionnaires: [makeQ('foo')],
      batteries: [makeBattery('foo', [])],
    });
    expect(() => resolveItems(['foo'], config)).toThrow(ItemResolutionError);
  });

  it('error message indicates both-type collision', () => {
    const config = makeConfig({ questionnaires: [makeQ('foo')], batteries: [makeBattery('foo', [])] });
    let err;
    try { resolveItems(['foo'], config); } catch (e) { err = e; }
    expect(err.message).toMatch(/both a questionnaire and a battery/);
  });
});

// ─── ItemResolutionError shape ────────────────────────────────────────────────

describe('ItemResolutionError', () => {
  it('is instanceof Error and ItemResolutionError', () => {
    let err;
    try { resolveItems(['x'], makeConfig()); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ItemResolutionError);
    expect(err.name).toBe('ItemResolutionError');
  });

  it('exposes the failing token', () => {
    let err;
    try { resolveItems(['my_token'], makeConfig()); } catch (e) { err = e; }
    expect(err.token).toBe('my_token');
  });
});
