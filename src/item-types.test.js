import { describe, it, expect } from 'vitest';
import { getType, isScored, isNumericAnswer, autoAdvances, isSkippable, canAdvance, tagForType } from './item-types.js';

// ── getType ───────────────────────────────────────────────────────────────────

describe('getType', () => {
  it('returns descriptor for known types', () => {
    expect(getType('likert').tag).toBe('item-likert');
    expect(getType('binary').tag).toBe('item-binary');
    expect(getType('instructions').tag).toBe('item-instructions');
  });

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
  it('returns true for likert and binary', () => {
    expect(isScored({ type: 'likert' })).toBe(true);
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
  it('returns true for likert and binary', () => {
    expect(isNumericAnswer({ type: 'likert' })).toBe(true);
    expect(isNumericAnswer({ type: 'binary' })).toBe(true);
  });

  it('returns false for instructions', () => {
    expect(isNumericAnswer({ type: 'instructions' })).toBe(false);
  });
});

// ── autoAdvances ──────────────────────────────────────────────────────────────

describe('autoAdvances', () => {
  it('returns true for likert and binary', () => {
    expect(autoAdvances({ type: 'likert' })).toBe(true);
    expect(autoAdvances({ type: 'binary' })).toBe(true);
  });

  it('returns false for instructions (fires advance directly, no answer event)', () => {
    expect(autoAdvances({ type: 'instructions' })).toBe(false);
  });
});

// ── isSkippable ───────────────────────────────────────────────────────────────

describe('isSkippable', () => {
  it('likert and binary are not skippable by default', () => {
    expect(isSkippable({ type: 'likert' })).toBe(false);
    expect(isSkippable({ type: 'binary' })).toBe(false);
  });

  it('instructions are skippable (never need an answer)', () => {
    expect(isSkippable({ type: 'instructions' })).toBe(true);
  });

  it('required: true overrides skippable default', () => {
    expect(isSkippable({ type: 'instructions', required: true })).toBe(false);
  });

  it('required: false overrides non-skippable default', () => {
    expect(isSkippable({ type: 'likert', required: false })).toBe(true);
    expect(isSkippable({ type: 'binary', required: false })).toBe(true);
  });
});

// ── canAdvance ────────────────────────────────────────────────────────────────

describe('canAdvance', () => {
  it('instructions always return true', () => {
    expect(canAdvance({ type: 'instructions' }, null)).toBe(true);
    expect(canAdvance({ type: 'instructions' }, undefined)).toBe(true);
  });

  it('likert requires a non-null answer', () => {
    expect(canAdvance({ type: 'likert' }, null)).toBe(false);
    expect(canAdvance({ type: 'likert' }, undefined)).toBe(false);
    expect(canAdvance({ type: 'likert' }, 0)).toBe(true);   // 0 is a valid answer
    expect(canAdvance({ type: 'likert' }, 3)).toBe(true);
  });

  it('binary requires a non-null answer', () => {
    expect(canAdvance({ type: 'binary' }, null)).toBe(false);
    expect(canAdvance({ type: 'binary' }, 1)).toBe(true);
    expect(canAdvance({ type: 'binary' }, 0)).toBe(true);   // 0 = "No" is valid
  });

  it('required: false makes any item skippable', () => {
    expect(canAdvance({ type: 'likert', required: false }, null)).toBe(true);
    expect(canAdvance({ type: 'binary', required: false }, null)).toBe(true);
  });

  it('required: true makes instructions require an answer', () => {
    expect(canAdvance({ type: 'instructions', required: true }, null)).toBe(false);
  });
});

// ── tagForType ────────────────────────────────────────────────────────────────

describe('tagForType', () => {
  it('returns correct tags for existing types', () => {
    expect(tagForType('likert')).toBe('item-likert');
    expect(tagForType('binary')).toBe('item-binary');
    expect(tagForType('instructions')).toBe('item-instructions');
  });

  it('falls back to item-likert for unknown types', () => {
    expect(tagForType('unknown')).toBe('item-likert');
  });
});
