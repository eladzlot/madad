import { describe, it, expect } from 'vitest';
import { getType, isScored, isNumericAnswer, autoAdvances, isSkippable, canAdvance } from './item-types.js';

// ── getType ───────────────────────────────────────────────────────────────────

describe('getType', () => {
  it('throws for unknown types', () => {
    expect(() => getType('unknown')).toThrow('unknown item type "unknown"');
  });

  it('throws with useful message for control nodes', () => {
    expect(() => getType('if')).toThrow('control node');
    expect(() => getType('randomize')).toThrow('control node');
  });
});

// ── isScored ──────────────────────────────────────────────────────────────────

describe('isScored', () => {
  it('returns true for select and binary', () => {
    expect(isScored({ type: 'select' })).toBe(true);
    expect(isScored({ type: 'binary' })).toBe(true);
  });

  it('returns false for instructions', () => {
    expect(isScored({ type: 'instructions' })).toBe(false);
  });

  it('returns false for unknown types', () => {
    expect(isScored({ type: 'unknown' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isScored(null)).toBe(false);
    expect(isScored(undefined)).toBe(false);
  });
});

// ── isNumericAnswer ───────────────────────────────────────────────────────────

describe('isNumericAnswer', () => {
  it('returns true for select and binary', () => {
    expect(isNumericAnswer({ type: 'select' })).toBe(true);
    expect(isNumericAnswer({ type: 'binary' })).toBe(true);
  });

  it('returns false for instructions', () => {
    expect(isNumericAnswer({ type: 'instructions' })).toBe(false);
  });
});

// ── autoAdvances ──────────────────────────────────────────────────────────────

describe('autoAdvances', () => {
  it('returns true for select and binary', () => {
    expect(autoAdvances({ type: 'select' })).toBe(true);
    expect(autoAdvances({ type: 'binary' })).toBe(true);
  });

  it('returns false for instructions (fires advance directly, no answer event)', () => {
    expect(autoAdvances({ type: 'instructions' })).toBe(false);
  });
});

// ── isSkippable ───────────────────────────────────────────────────────────────

describe('isSkippable', () => {
  it('select and binary are not skippable by default', () => {
    expect(isSkippable({ type: 'select' })).toBe(false);
    expect(isSkippable({ type: 'binary' })).toBe(false);
  });

  it('instructions are skippable (never need an answer)', () => {
    expect(isSkippable({ type: 'instructions' })).toBe(true);
  });

  it('required: true overrides skippable default', () => {
    expect(isSkippable({ type: 'instructions', required: true })).toBe(false);
  });

  it('required: false overrides non-skippable default', () => {
    expect(isSkippable({ type: 'select', required: false })).toBe(true);
    expect(isSkippable({ type: 'binary', required: false })).toBe(true);
  });
});

// ── canAdvance ────────────────────────────────────────────────────────────────

describe('canAdvance', () => {
  it('instructions always return true', () => {
    expect(canAdvance({ type: 'instructions' }, null)).toBe(true);
    expect(canAdvance({ type: 'instructions' }, undefined)).toBe(true);
  });

  it('select requires a non-null answer', () => {
    expect(canAdvance({ type: 'select' }, null)).toBe(false);
    expect(canAdvance({ type: 'select' }, undefined)).toBe(false);
    expect(canAdvance({ type: 'select' }, 0)).toBe(true);   // 0 is a valid answer
    expect(canAdvance({ type: 'select' }, 3)).toBe(true);
  });

  it('binary requires a non-null answer', () => {
    expect(canAdvance({ type: 'binary' }, null)).toBe(false);
    expect(canAdvance({ type: 'binary' }, 1)).toBe(true);
    expect(canAdvance({ type: 'binary' }, 0)).toBe(true);   // 0 = "No" is valid
  });

  it('required: false makes any item skippable', () => {
    expect(canAdvance({ type: 'select', required: false }, null)).toBe(true);
    expect(canAdvance({ type: 'binary', required: false }, null)).toBe(true);
  });

  it('required: true makes instructions require an answer', () => {
    expect(canAdvance({ type: 'instructions', required: true }, null)).toBe(false);
  });

  it('multiselect: [] is valid by default (skippable)', () => {
    expect(canAdvance({ type: 'multiselect' }, [])).toBe(true);
    expect(canAdvance({ type: 'multiselect' }, null)).toBe(true);
  });

  it('multiselect required:true: [] is not valid, must have selection', () => {
    expect(canAdvance({ type: 'multiselect', required: true }, [])).toBe(false);
    expect(canAdvance({ type: 'multiselect', required: true }, [1])).toBe(true);
    expect(canAdvance({ type: 'multiselect', required: true }, null)).toBe(false);
  });
});

