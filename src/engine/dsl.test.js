import { describe, it, expect } from 'vitest';
import {
  evaluate,
  DSLSyntaxError,
  DSLReferenceError,
  DSLTypeError,
  DSLArgumentError,
  DSLRuntimeError,
} from './dsl.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const itemCtx  = (item = {}, subscale = {})         => ({ item, subscale });
const batCtx   = (score = {}, subscale = {})         => ({ score, subscale });

// ─── Literals ────────────────────────────────────────────────────────────────

describe('literals', () => {
  it('evaluates an integer',         () => expect(evaluate('3',    {}, 'number')).toBe(3));
  it('evaluates a float',            () => expect(evaluate('3.5',  {}, 'number')).toBe(3.5));
  it('evaluates a negative literal', () => expect(evaluate('-2',   {}, 'number')).toBe(-2));
});

// ─── References ──────────────────────────────────────────────────────────────

describe('references', () => {
  it('resolves item.<id> with numeric id', () =>
    expect(evaluate('item.1', itemCtx({ '1': 3 }), 'number')).toBe(3));

  it('resolves item.<id> with underscore id', () =>
    expect(evaluate('item.sleep_disturbance', itemCtx({ 'sleep_disturbance': 2 }), 'number')).toBe(2));

  it('resolves item.<questionnaireId>.<itemId> (battery-level qualified reference)', () =>
    expect(evaluate(
      'item.diamond_sr.q11',
      { item: { diamond_sr: { q11: 1 } } },
      'number'
    )).toBe(1));

  it('resolves item.<questionnaireId>.<itemId> with numeric item id', () =>
    expect(evaluate(
      'item.phq9.9',
      { item: { phq9: { '9': 2 } } },
      'number'
    )).toBe(2));

  it('throws DSLReferenceError for missing qualified questionnaire', () =>
    expect(() => evaluate('item.missing_q.q1', { item: {} }, 'number'))
      .toThrow(DSLReferenceError));

  it('throws DSLReferenceError for missing qualified item id', () =>
    expect(() => evaluate('item.phq9.missing', { item: { phq9: {} } }, 'number'))
      .toThrow(DSLReferenceError));

  it('resolves subscale.<id> (current questionnaire)', () =>
    expect(evaluate('subscale.somatic', itemCtx({}, { somatic: 7 }), 'number')).toBe(7));

  it('resolves score.<questionnaireId>', () =>
    expect(evaluate('score.phq9', batCtx({ phq9: 14 }), 'number')).toBe(14));

  it('resolves subscale.<questionnaireId>.<subscaleId>', () =>
    expect(evaluate(
      'subscale.pcl5.intrusion',
      batCtx({}, { pcl5: { intrusion: 12 } }),
      'number'
    )).toBe(12));

  it('throws DSLReferenceError for missing item', () =>
    expect(() => evaluate('item.missing', itemCtx(), 'number'))
      .toThrow(DSLReferenceError));

  it('throws DSLReferenceError for missing score', () =>
    expect(() => evaluate('score.missing', batCtx(), 'number'))
      .toThrow(DSLReferenceError));

  it('throws DSLReferenceError for missing subscale (battery level)', () =>
    expect(() => evaluate('subscale.pcl5.missing', batCtx({}, { pcl5: {} }), 'number'))
      .toThrow(DSLReferenceError));
});

// ─── Arithmetic ───────────────────────────────────────────────────────────────

describe('arithmetic', () => {
  it('adds',      () => expect(evaluate('2 + 3',   {}, 'number')).toBe(5));
  it('subtracts', () => expect(evaluate('5 - 2',   {}, 'number')).toBe(3));
  it('multiplies',() => expect(evaluate('3 * 4',   {}, 'number')).toBe(12));
  it('divides',   () => expect(evaluate('10 / 4',  {}, 'number')).toBe(2.5));

  it('respects precedence: * before +', () =>
    expect(evaluate('2 + 3 * 4', {}, 'number')).toBe(14));

  it('respects parentheses', () =>
    expect(evaluate('(2 + 3) * 4', {}, 'number')).toBe(20));

  it('throws DSLRuntimeError on division by zero', () =>
    expect(() => evaluate('1 / 0', {}, 'number')).toThrow(DSLRuntimeError));
});

// ─── Comparisons ─────────────────────────────────────────────────────────────

describe('comparisons', () => {
  it('<',  () => expect(evaluate('2 < 3',  {}, 'boolean')).toBe(true));
  it('>',  () => expect(evaluate('3 > 2',  {}, 'boolean')).toBe(true));
  it('<=', () => expect(evaluate('3 <= 3', {}, 'boolean')).toBe(true));
  it('>=', () => expect(evaluate('3 >= 4', {}, 'boolean')).toBe(false));
  it('==', () => expect(evaluate('2 == 2', {}, 'boolean')).toBe(true));
  it('!=', () => expect(evaluate('2 != 3', {}, 'boolean')).toBe(true));

  it('evaluates item comparison', () =>
    expect(evaluate('item.phq9_9 >= 1', itemCtx({ phq9_9: 1 }), 'boolean')).toBe(true));

  it('evaluates score comparison', () =>
    expect(evaluate('score.phq9 >= 10', batCtx({ phq9: 14 }), 'boolean')).toBe(true));
});

// ─── Boolean operators ────────────────────────────────────────────────────────

describe('boolean operators', () => {
  it('&&  true  && true  → true',  () => expect(evaluate('2 > 1 && 3 > 2', {}, 'boolean')).toBe(true));
  it('&&  true  && false → false', () => expect(evaluate('2 > 1 && 3 > 4', {}, 'boolean')).toBe(false));
  it('||  false || true  → true',  () => expect(evaluate('2 > 3 || 3 > 2', {}, 'boolean')).toBe(true));
  it('||  false || false → false', () => expect(evaluate('2 > 3 || 3 > 4', {}, 'boolean')).toBe(false));
  it('!   !true → false',          () => expect(evaluate('!(2 > 1)',        {}, 'boolean')).toBe(false));
  it('!   !false → true',          () => expect(evaluate('!(2 > 3)',        {}, 'boolean')).toBe(true));

  it('short-circuits && on false left', () => {
    // if right side were evaluated it would throw a reference error
    expect(evaluate('1 > 2 && item.missing > 0', {}, 'boolean')).toBe(false);
  });

  it('short-circuits || on true left', () => {
    expect(evaluate('1 < 2 || item.missing > 0', {}, 'boolean')).toBe(true);
  });

  it('compound: score.phq9 >= 15 && (item.phq9_9 >= 1 || subscale.somatic >= 6)', () =>
    expect(evaluate(
      'score.phq9 >= 15 && (item.phq9_9 >= 1 || subscale.somatic >= 6)',
      { score: { phq9: 17 }, item: { phq9_9: 0 }, subscale: { somatic: 7 } },
      'boolean'
    )).toBe(true));
});

// ─── Functions ────────────────────────────────────────────────────────────────

describe('sum', () => {
  it('sums single value',    () => expect(evaluate('sum(3)',       {}, 'number')).toBe(3));
  it('sums multiple values', () => expect(evaluate('sum(1, 2, 3)', {}, 'number')).toBe(6));
  it('sums references',      () =>
    expect(evaluate('sum(item.a, item.b)', itemCtx({ a: 4, b: 6 }), 'number')).toBe(10));
  it('throws with 0 args',   () =>
    expect(() => evaluate('sum()', {}, 'number')).toThrow(DSLArgumentError));
});

describe('avg', () => {
  it('averages values',    () => expect(evaluate('avg(2, 4, 6)', {}, 'number')).toBe(4));
  it('throws with 0 args', () => expect(() => evaluate('avg()', {}, 'number')).toThrow(DSLArgumentError));
});

describe('min', () => {
  it('returns minimum', () => expect(evaluate('min(5, 3, 8)', {}, 'number')).toBe(3));
});

describe('max', () => {
  it('returns maximum', () => expect(evaluate('max(5, 3, 8)', {}, 'number')).toBe(8));
});

describe('if function', () => {
  it('returns then branch when true',  () =>
    expect(evaluate('if(2 > 1, 10, 20)', {}, 'number')).toBe(10));

  it('returns else branch when false', () =>
    expect(evaluate('if(2 > 3, 10, 20)', {}, 'number')).toBe(20));

  it('works with references', () =>
    expect(evaluate(
      'if(subscale.intrusion > 10, sum(subscale.intrusion, subscale.avoidance), 0)',
      itemCtx({}, { intrusion: 12, avoidance: 8 }),
      'number'
    )).toBe(20));

  it('throws with wrong arg count', () =>
    expect(() => evaluate('if(2 > 1, 10)', {}, 'number')).toThrow(DSLArgumentError));

  it('throws if condition is not boolean', () =>
    expect(() => evaluate('if(1, 10, 20)', {}, 'number')).toThrow(DSLTypeError));

  it('throws if branches return different types', () =>
    expect(() => evaluate('if(1 > 0, 10, 1 > 0)', {}, 'number')).toThrow(DSLTypeError));

  it('unknown function throws DSLSyntaxError', () =>
    expect(() => evaluate('foo(1, 2)', {}, 'number')).toThrow(DSLSyntaxError));
});

// ─── count() ─────────────────────────────────────────────────────────────────

describe('count()', () => {
  it('returns array length for a multiselect answer', () =>
    expect(evaluate('count(item.symptoms)', itemCtx({ symptoms: [1, 3] }), 'number')).toBe(2));

  it('returns 0 for empty array', () =>
    expect(evaluate('count(item.symptoms)', itemCtx({ symptoms: [] }), 'number')).toBe(0));

  it('returns 0 for null answer', () =>
    expect(evaluate('count(item.symptoms)', itemCtx({ symptoms: null }), 'number')).toBe(0));

  it('returns 1 for a non-null scalar (defensive)', () =>
    expect(evaluate('count(item.q1)', itemCtx({ q1: 2 }), 'number')).toBe(1));

  it('can be used in a comparison', () =>
    expect(evaluate('count(item.symptoms) >= 2', itemCtx({ symptoms: [1, 2, 3] }), 'boolean')).toBe(true));

  it('throws DSLArgumentError with wrong arg count', () =>
    expect(() => evaluate('count(item.a, item.b)', itemCtx({ a: [], b: [] }), 'number'))
      .toThrow(DSLArgumentError));
});

// ─── checked() ───────────────────────────────────────────────────────────────

describe('checked()', () => {
  it('returns true when 1-based index is in selection', () =>
    expect(evaluate('checked(item.symptoms, 2)', itemCtx({ symptoms: [1, 2, 3] }), 'boolean')).toBe(true));

  it('returns false when index is not in selection', () =>
    expect(evaluate('checked(item.symptoms, 4)', itemCtx({ symptoms: [1, 2, 3] }), 'boolean')).toBe(false));

  it('returns false for empty array', () =>
    expect(evaluate('checked(item.symptoms, 1)', itemCtx({ symptoms: [] }), 'boolean')).toBe(false));

  it('returns false for null answer (not answered)', () =>
    expect(evaluate('checked(item.symptoms, 1)', itemCtx({ symptoms: null }), 'boolean')).toBe(false));

  it('can be combined with logical operators', () =>
    expect(evaluate(
      'checked(item.symptoms, 1) && checked(item.symptoms, 3)',
      itemCtx({ symptoms: [1, 3] }),
      'boolean'
    )).toBe(true));

  it('throws DSLArgumentError with wrong arg count', () =>
    expect(() => evaluate('checked(item.a)', itemCtx({ a: [1] }), 'boolean'))
      .toThrow(DSLArgumentError));

  it('throws DSLArgumentError when second arg is not a positive integer', () =>
    expect(() => evaluate('checked(item.a, 0)', itemCtx({ a: [1] }), 'boolean'))
      .toThrow(DSLArgumentError));

  it('throws DSLArgumentError when second arg is a float', () =>
    expect(() => evaluate('checked(item.a, 1.5)', itemCtx({ a: [1] }), 'boolean'))
      .toThrow(DSLArgumentError));
});

describe('return type enforcement', () => {
  it('throws DSLTypeError when number expected but boolean returned', () =>
    expect(() => evaluate('2 > 1', {}, 'number')).toThrow(DSLTypeError));

  it('throws DSLTypeError when boolean expected but number returned', () =>
    expect(() => evaluate('42', {}, 'boolean')).toThrow(DSLTypeError));

  it('does not throw when expected is omitted', () =>
    expect(() => evaluate('42', {}, undefined)).not.toThrow());
});

// ─── Syntax errors ────────────────────────────────────────────────────────────

describe('syntax errors', () => {
  it('throws on unknown character', () =>
    expect(() => evaluate('item.x @ 2', itemCtx({ x: 1 }), 'boolean')).toThrow(DSLSyntaxError));

  it('throws on unclosed parenthesis', () =>
    expect(() => evaluate('(2 + 3', {}, 'number')).toThrow(DSLSyntaxError));

  it('throws on trailing tokens', () =>
    expect(() => evaluate('2 + 3 4', {}, 'number')).toThrow(DSLSyntaxError));

  it('throws on bare identifier', () =>
    expect(() => evaluate('foo', {}, 'number')).toThrow(DSLSyntaxError));
});

// ─── Real-world expressions from the spec ─────────────────────────────────────

describe('spec examples', () => {
  it('PHQ-9 suicidality alert', () =>
    expect(evaluate('item.phq9_9 >= 1', itemCtx({ phq9_9: 1 }), 'boolean')).toBe(true));

  it('battery condition: score.phq9 >= 10 || score.gad7 >= 8', () =>
    expect(evaluate(
      'score.phq9 >= 10 || score.gad7 >= 8',
      batCtx({ phq9: 7, gad7: 9 }),
      'boolean'
    )).toBe(true));

  it('negation: !(item.pcl5_1 == 0)', () =>
    expect(evaluate('!(item.pcl5_1 == 0)', itemCtx({ pcl5_1: 1 }), 'boolean')).toBe(true));

  it('high risk combined alert', () =>
    expect(evaluate(
      'score.phq9 >= 15 && item.phq9_9 >= 1',
      { score: { phq9: 17 }, item: { phq9_9: 2 } },
      'boolean'
    )).toBe(true));
});
