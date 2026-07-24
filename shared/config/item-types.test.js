import { describe, it, expect } from 'vitest';
import {
  isScored, autoAdvances, isSkippable, canAdvance, answerShape, isKnownType,
  ratedTextTextKey, RATED_TEXT_TEXT_SUFFIX, tagForType,
} from './item-types.js';

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

// ── answerShape ───────────────────────────────────────────────────────────────

describe('answerShape', () => {
  it('returns the declared shape per type', () => {
    expect(answerShape('select')).toBe('scalar');
    expect(answerShape('slider')).toBe('scalar');
    expect(answerShape('multiselect')).toBe('array');
  });

  it('returns undefined for unknown types', () => {
    expect(answerShape('nope')).toBeUndefined();
  });
});

// ── isKnownType ───────────────────────────────────────────────────────────────

describe('isKnownType', () => {
  it('is true for registered types, false otherwise', () => {
    expect(isKnownType('select')).toBe(true);
    expect(isKnownType('multiselect')).toBe(true);
    expect(isKnownType('instructions')).toBe(true);
    expect(isKnownType('rated_text')).toBe(true);
    expect(isKnownType('if')).toBe(false);       // control-flow, not an item type
    expect(isKnownType('nope')).toBe(false);
  });
});

// ── rated_text ────────────────────────────────────────────────────────────────

describe('rated_text', () => {
  it('is a known, scalar, scored type with its own tag', () => {
    expect(isKnownType('rated_text')).toBe(true);
    expect(answerShape('rated_text')).toBe('scalar');
    expect(isScored({ type: 'rated_text' })).toBe(true);
    expect(tagForType('rated_text')).toBe('item-rated-text');
  });

  it('does not auto-advance (requires explicit submit)', () => {
    expect(autoAdvances({ type: 'rated_text' })).toBe(false);
  });

  it('requires the rating by default, honours required override', () => {
    // skippableDefault is false — like a required slider (the rating gates)
    expect(isSkippable({ type: 'rated_text' })).toBe(false);
    expect(isSkippable({ type: 'rated_text', required: false })).toBe(true);
    expect(canAdvance({ type: 'rated_text' }, null)).toBe(false);
    expect(canAdvance({ type: 'rated_text' }, 0)).toBe(true);   // 0 is a valid rating
    expect(canAdvance({ type: 'rated_text', required: false }, null)).toBe(true);
  });

  it('ratedTextTextKey derives the sidecar key from the item id', () => {
    expect(RATED_TEXT_TEXT_SUFFIX).toBe('__text');
    expect(ratedTextTextKey('p1')).toBe('p1__text');
    expect(ratedTextTextKey('stuck_point')).toBe('stuck_point__text');
  });
});

