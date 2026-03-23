import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './composer-state.js';
import { initHandlers, handleToggle, handleReset } from './composer-handlers.js';

// Wire up a mock render function
const mockRender = vi.fn();
initHandlers(mockRender);

beforeEach(() => {
  state.selected  = [];
  state.pid       = '';
  state.query     = '';
  state.warnings  = [];
  state.currentUrl = null;
  mockRender.mockClear();
});

// ── handleToggle ──────────────────────────────────────────────────────────────

describe('handleToggle', () => {
  it('adds id to selected when checked', () => {
    handleToggle('phq9', true);
    expect(state.selected).toContain('phq9');
  });

  it('removes id from selected when unchecked', () => {
    state.selected = ['phq9'];
    handleToggle('phq9', false);
    expect(state.selected).not.toContain('phq9');
  });

  it('does not duplicate if id already selected', () => {
    state.selected = ['phq9'];
    handleToggle('phq9', true);
    expect(state.selected.filter(x => x === 'phq9')).toHaveLength(1);
  });

  it('preserves other selections when removing one', () => {
    state.selected = ['phq9', 'gad7', 'pcl5'];
    handleToggle('gad7', false);
    expect(state.selected).toEqual(['phq9', 'pcl5']);
  });

  it('appends to end of selection order', () => {
    handleToggle('phq9', true);
    handleToggle('gad7', true);
    handleToggle('pcl5', true);
    expect(state.selected).toEqual(['phq9', 'gad7', 'pcl5']);
  });

  it('calls render after toggle on', () => {
    handleToggle('phq9', true);
    expect(mockRender).toHaveBeenCalledOnce();
  });

  it('calls render after toggle off', () => {
    state.selected = ['phq9'];
    handleToggle('phq9', false);
    expect(mockRender).toHaveBeenCalledOnce();
  });
});

// ── handleReset ───────────────────────────────────────────────────────────────

describe('handleReset', () => {
  it('clears selected', () => {
    state.selected = ['phq9', 'gad7'];
    handleReset();
    expect(state.selected).toEqual([]);
  });

  it('clears pid', () => {
    state.pid = 'TRC-001';
    handleReset();
    expect(state.pid).toBe('');
  });

  it('clears query', () => {
    state.query = 'phq';
    handleReset();
    expect(state.query).toBe('');
  });

  it('calls render after reset', () => {
    handleReset();
    expect(mockRender).toHaveBeenCalledOnce();
  });

  it('is safe to call when state is already empty', () => {
    expect(() => handleReset()).not.toThrow();
    expect(mockRender).toHaveBeenCalledOnce();
  });
});
