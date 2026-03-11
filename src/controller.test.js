// @vitest-environment happy-dom
import '../tests/setup-dom.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createController } from './controller.js';

// item-* components don't need to be registered — controller just
// calls document.createElement(tag) and sets properties on the element.

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Items mount inside <app-shell> which uses a slot — they're in container's light DOM
function findItem(container, tag = 'item-likert') {
  return container.querySelector(tag);
}

function findShell(container) {
  return container.querySelector('app-shell');
}

function makeQuestionnaire(id = 'phq9') {
  return {
    id,
    title: 'PHQ-9',
    optionSets: {
      freq: [
        { label: 'כלל לא', value: 0 },
        { label: 'כמה ימים', value: 1 },
        { label: 'יותר ממחצית', value: 2 },
        { label: 'כמעט כל יום', value: 3 },
      ],
    },
    defaultOptionSetId: 'freq',
    items: [
      { id: 'q1', type: 'likert', text: 'שאלה 1' },
      { id: 'q2', type: 'likert', text: 'שאלה 2' },
    ],
    scoring: { method: 'none' },
    alerts: [],
  };
}

function makeEngine(questionnaire, existingAnswers = {}) {
  const items = questionnaire.items.slice();
  let index = -1;
  const _answers = { ...existingAnswers };

  return {
    advance: vi.fn(() => {
      index++;
      if (index >= items.length) return null;
      return items[index];
    }),
    back: vi.fn(() => {
      index = Math.max(0, index - 1);
      return items[index];
    }),
    recordAnswer: vi.fn((id, val) => { _answers[id] = val; }),
    currentItem: vi.fn(() => index >= 0 && index < items.length ? items[index] : null),
    answers: vi.fn(() => ({ ..._answers })),
    canGoBack: vi.fn(() => index > 0),
    isComplete: vi.fn(() => index >= items.length),
    progress: vi.fn(() => ({ current: index + 1, total: items.length })),
    scoreResult: vi.fn(() => null),
    alertResults: vi.fn(() => null),
  };
}

function makeSetup(overrides = {}) {
  const questionnaire = overrides.questionnaire ?? makeQuestionnaire();
  const engine = overrides.engine ?? makeEngine(questionnaire, overrides.existingAnswers);
  let _callbacks = {};

  const createOrchestrator = vi.fn((_config, _batteryId, callbacks) => {
    _callbacks = callbacks;
    return {
      start: vi.fn(() => _callbacks.onQuestionnaireStart(engine, questionnaire.id, questionnaire)),
      engineComplete: vi.fn(),
      engineCrossBack: vi.fn(),
      progress: vi.fn(() => ({ current: 1, total: 1 })),
      isComplete: vi.fn(() => false),
      sessionKey: vi.fn(() => questionnaire.id),
      // expose for tests that need to fire session complete manually
      _fireSessionComplete: () => _callbacks.onSessionComplete({}),
    };
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const controller = createController(container);
  const config = { questionnaires: [questionnaire], batteries: [{ id: 'b', sequence: [] }] };
  controller.start(config, 'b', { createOrchestrator });
  const orchestrator = createOrchestrator.mock.results[0].value;

  return { container, controller, engine, orchestrator, questionnaire };
}

// ─── Mounting ─────────────────────────────────────────────────────────────────

describe('item mounting', () => {
  it('mounts item-likert for first item on start', () => {
    const { container } = makeSetup();
    expect(container.querySelector('item-likert')).toBeTruthy();
  });

  it('sets resolved item with inlined options on the component', () => {
    const { container } = makeSetup();
    const el = container.querySelector('item-likert');
    expect(el.item.options).toHaveLength(4);
    expect(el.item.text).toBe('שאלה 1');
  });

  it('sets selected to null when no prior answer', () => {
    const { container } = makeSetup();
    expect(container.querySelector('item-likert').selected).toBeNull();
  });

  it('sets selected from existing answers', () => {
    const { container } = makeSetup({ existingAnswers: { q1: 2 } });
    expect(container.querySelector('item-likert').selected).toBe(2);
  });

  it('reuses same element when next item is same type', () => {
    const { container } = makeSetup();
    const first = container.querySelector('item-likert');
    first.dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    expect(container.querySelector('item-likert')).toBe(first);
  });
});

// ─── Answer + advance flow ────────────────────────────────────────────────────

describe('answer and advance', () => {
  it('calls engine.recordAnswer when answer event fires', () => {
    const { container, engine } = makeSetup();
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 2 }, bubbles: true }));
    expect(engine.recordAnswer).toHaveBeenCalledWith('q1', 2);
  });

  it('updates selected on the element immediately on answer', () => {
    const { container } = makeSetup();
    const el = container.querySelector('item-likert');
    el.dispatchEvent(new CustomEvent('answer', { detail: { value: 3 }, bubbles: true }));
    expect(el.selected).toBe(3);
  });

  it('calls engine.advance after 150ms delay on advance event', () => {
    vi.useFakeTimers();
    const { container, engine } = makeSetup();
    const callsBefore = engine.advance.mock.calls.length;
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    expect(engine.advance.mock.calls.length).toBe(callsBefore); // not yet
    vi.advanceTimersByTime(150);
    expect(engine.advance.mock.calls.length).toBe(callsBefore + 1);
    vi.useRealTimers();
  });

  it('mounts next item after advance', () => {
    vi.useFakeTimers();
    const { container } = makeSetup();
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(container.querySelector('item-likert').item.text).toBe('שאלה 2');
    vi.useRealTimers();
  });

  it('calls orchestrator.engineComplete when engine returns null', () => {
    vi.useFakeTimers();
    const { container, engine, orchestrator } = makeSetup();
    engine.advance.mockReturnValueOnce(null);
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(orchestrator.engineComplete).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('sets canGoForward on shell after answer is recorded', () => {
    const { container } = makeSetup();
    const shell = container.querySelector('app-shell');
    expect(shell.canGoForward).toBe(false);
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));
    expect(shell.canGoForward).toBe(true);
  });

  it('clears canGoForward immediately when advance fires — no flash', () => {
    vi.useFakeTimers();
    const { container } = makeSetup();
    const shell = container.querySelector('app-shell');
    // Record an answer so canGoForward becomes true
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));
    expect(shell.canGoForward).toBe(true);
    // Fire advance — canGoForward should clear before the timeout fires
    container.querySelector('item-likert')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    expect(shell.canGoForward).toBe(false); // cleared immediately, not after 150ms
    vi.useRealTimers();
  });
});

// ─── Session complete ─────────────────────────────────────────────────────────

describe('session complete', () => {
  it('removes item component on session complete', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(findItem(container)).toBeNull();
  });

  it('shows completion message on session complete', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(container.textContent).toContain('הסשן הושלם');
  });
});
