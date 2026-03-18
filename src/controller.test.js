// @vitest-environment happy-dom
import '../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { createController } from './controller.js';

// item-* components don't need to be registered — controller just
// calls document.createElement(tag) and sets properties on the element.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findItem(container, tag = 'item-select') {
  return container.querySelector(tag);
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
      { id: 'q1', type: 'select', text: 'שאלה 1' },
      { id: 'q2', type: 'select', text: 'שאלה 2' },
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

// Mock router — records push/replace calls and lets tests fire popstate manually.
function makeRouter() {
  let _backHandler    = null;
  let _forwardHandler = null;
  return {
    push:          vi.fn(),
    replace:       vi.fn(),
    currentScreen: vi.fn(() => 'q'),
    onBack(fn)     { _backHandler    = fn; },
    onForward(fn)  { _forwardHandler = fn; },
    destroy:       vi.fn(),
    // test helpers: simulate browser back/forward arriving at given screen
    _fireBack(screen = 'q')    { _backHandler?.(screen); },
    _fireForward(screen = 'q') { _forwardHandler?.(screen); },
  };
}

function makeSetup(overrides = {}) {
  const questionnaire = overrides.questionnaire ?? makeQuestionnaire();
  const engine = overrides.engine ?? makeEngine(questionnaire, overrides.existingAnswers);
  let _callbacks = {};

  const createOrchestrator = vi.fn((_config, _source, callbacks) => {
    _callbacks = callbacks;
    return {
      start: vi.fn(() => _callbacks.onQuestionnaireStart(engine, questionnaire.id, questionnaire)),
      engineComplete: vi.fn(),
      engineCrossBack: vi.fn(),
      progress: vi.fn(() => ({ current: 1, total: 1 })),
      isComplete: vi.fn(() => false),
      sessionKey: vi.fn(() => questionnaire.id),
      currentEngine: vi.fn(() => engine),
      // expose for tests that need to fire session complete manually
      _fireSessionComplete: (sessionState = {}) => _callbacks.onSessionComplete(sessionState),
    };
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const router = overrides.router ?? makeRouter();
  const controller = createController(container, router);
  const config = {
    questionnaires: [questionnaire],
    batteries:      [],
  };
  const source = { sequence: [{ questionnaireId: questionnaire.id }] };
  controller.start(config, source, { createOrchestrator });
  const orchestrator = createOrchestrator.mock.results[0].value;

  return { container, controller, engine, orchestrator, questionnaire, router };
}

// ─── Mounting ─────────────────────────────────────────────────────────────────

describe('item mounting', () => {
  it('mounts item-select for first item on start', () => {
    const { container } = makeSetup();
    expect(container.querySelector('item-select')).toBeTruthy();
  });

  it('sets resolved item with inlined options on the component', () => {
    const { container } = makeSetup();
    const el = container.querySelector('item-select');
    expect(el.item.options).toHaveLength(4);
    expect(el.item.text).toBe('שאלה 1');
  });

  it('sets selected to null when no prior answer', () => {
    const { container } = makeSetup();
    expect(container.querySelector('item-select').selected).toBeNull();
  });

  it('sets selected from existing answers', () => {
    const { container } = makeSetup({ existingAnswers: { q1: 2 } });
    expect(container.querySelector('item-select').selected).toBe(2);
  });

  it('reuses same element when next item is same type', () => {
    const { container } = makeSetup();
    const first = container.querySelector('item-select');
    first.dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    expect(container.querySelector('item-select')).toBe(first);
  });
});

// ─── Answer + advance flow ────────────────────────────────────────────────────

describe('answer and advance', () => {
  it('calls engine.recordAnswer when answer event fires', () => {
    const { container, engine } = makeSetup();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 2 }, bubbles: true }));
    expect(engine.recordAnswer).toHaveBeenCalledWith('q1', 2);
  });

  it('updates selected on the element immediately on answer', () => {
    const { container } = makeSetup();
    const el = container.querySelector('item-select');
    el.dispatchEvent(new CustomEvent('answer', { detail: { value: 3 }, bubbles: true }));
    expect(el.selected).toBe(3);
  });

  it('calls engine.advance after 150ms delay on advance event', () => {
    vi.useFakeTimers();
    const { container, engine } = makeSetup();
    const callsBefore = engine.advance.mock.calls.length;
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    expect(engine.advance.mock.calls.length).toBe(callsBefore); // not yet
    vi.advanceTimersByTime(150);
    expect(engine.advance.mock.calls.length).toBe(callsBefore + 1);
    vi.useRealTimers();
  });

  it('mounts next item after advance', () => {
    vi.useFakeTimers();
    const { container } = makeSetup();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(container.querySelector('item-select').item.text).toBe('שאלה 2');
    vi.useRealTimers();
  });

  it('calls orchestrator.engineComplete when engine returns null', () => {
    vi.useFakeTimers();
    const { container, engine, orchestrator } = makeSetup();
    engine.advance.mockReturnValueOnce(null);
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(orchestrator.engineComplete).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('sets canGoForward on shell after answer is recorded', () => {
    const { container } = makeSetup();
    const shell = container.querySelector('app-shell');
    expect(shell.canGoForward).toBe(false);
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));
    expect(shell.canGoForward).toBe(true);
  });

  it('clears canGoForward immediately when advance fires — no flash', () => {
    vi.useFakeTimers();
    const { container } = makeSetup();
    const shell = container.querySelector('app-shell');
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));
    expect(shell.canGoForward).toBe(true);
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    expect(shell.canGoForward).toBe(false); // cleared immediately, not after 150ms
    vi.useRealTimers();
  });
});

// ─── Router integration ───────────────────────────────────────────────────────

describe('router push on advance', () => {
  it('pushes "q" when the first item is mounted at session start', () => {
    const { router } = makeSetup();
    expect(router.push).toHaveBeenCalledWith('q');
  });

  it('pushes "q" on each item advance', () => {
    vi.useFakeTimers();
    const { container, router } = makeSetup();
    const countBefore = router.push.mock.calls.filter(c => c[0] === 'q').length;
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    const countAfter = router.push.mock.calls.filter(c => c[0] === 'q').length;
    expect(countAfter).toBe(countBefore + 1);
    vi.useRealTimers();
  });

  it('pushes "complete" when session completes', () => {
    const { orchestrator, router } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(router.push).toHaveBeenCalledWith('complete');
  });

  it('replaces with "results" on view-results — not push', () => {
    const { container, orchestrator, router } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));
    expect(router.replace).toHaveBeenCalledWith('results');
    // push should NOT have been called with 'results'
    expect(router.push).not.toHaveBeenCalledWith('results');
  });
});

describe('router back — shell back event calls history.back()', () => {
  it('shell back event triggers history.back() not engine.back() directly', () => {
    // The shell fires a 'back' event; controller should call history.back().
    // We verify engine.back() is NOT called synchronously on the 'back' event —
    // it only runs after popstate fires.
    const { container, engine } = makeSetup();
    // Advance to second item so canGoBack is true
    vi.useFakeTimers();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    vi.useRealTimers();

    const backCallsBefore = engine.back.mock.calls.length;
    // Fire the shell 'back' event (what the back button / gesture emits)
    container.querySelector('app-shell')
      .dispatchEvent(new CustomEvent('back', { bubbles: true }));
    // engine.back() must NOT have been called yet — history.back() was called instead
    expect(engine.back.mock.calls.length).toBe(backCallsBefore);
  });

  it('engine.back() is called after popstate fires via router._fireBack', () => {
    const { container, engine, router } = makeSetup();
    vi.useFakeTimers();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    vi.useRealTimers();

    // Simulate popstate arriving (what history.back() would trigger)
    router._fireBack('q');
    expect(engine.back).toHaveBeenCalledOnce();
  });

  it('mounts previous item after popstate back', () => {
    const { container, router } = makeSetup();
    vi.useFakeTimers();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('advance', { bubbles: true }));
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    expect(container.querySelector('item-select').item.text).toBe('שאלה 2');

    router._fireBack('q');
    expect(container.querySelector('item-select').item.text).toBe('שאלה 1');
  });

  it('calls orchestrator.engineCrossBack when at first item and popstate fires', () => {
    const { router, orchestrator, engine } = makeSetup();
    // engine is at first item (canGoBack returns false)
    engine.canGoBack.mockReturnValue(false);
    router._fireBack('q');
    expect(orchestrator.engineCrossBack).toHaveBeenCalledOnce();
  });
});

describe('router back — welcome screen', () => {
  it('does not call engine.back when popstate fires with screen "welcome"', () => {
    const { router, engine } = makeSetup();
    router._fireBack('welcome');
    expect(engine.back).not.toHaveBeenCalled();
  });
});

describe('router back — completion screen', () => {
  it('removes completion-screen when popstate fires from completion screen', () => {
    const { container, orchestrator, router } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(container.querySelector('completion-screen')).toBeTruthy();

    router._fireBack('q');
    expect(container.querySelector('completion-screen')).toBeNull();
  });

  it('re-enables gestures when popping back from completion screen', () => {
    const { container, orchestrator, router } = makeSetup();
    orchestrator._fireSessionComplete();
    const shell = container.querySelector('app-shell');
    // gesturesEnabled is false briefly after session complete
    shell.gesturesEnabled = false;

    router._fireBack('q');
    expect(shell.gesturesEnabled).toBe(true);
  });
});

describe('router back — results screen (locked)', () => {
  it('does not call engine.back after session is locked', () => {
    const { container, orchestrator, router, engine } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));

    // Session is now locked — popstate should be ignored
    router._fireBack('complete');
    expect(engine.back).not.toHaveBeenCalled();
  });
});

// ─── Router forward ───────────────────────────────────────────────────────────

describe('router forward — shell forward event calls history.forward()', () => {
  it('shell forward event does not call engine.advance() synchronously', () => {
    const { container, engine } = makeSetup();
    // Answer the first item so forward button is enabled
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));

    const advanceBefore = engine.advance.mock.calls.length;
    container.querySelector('app-shell')
      .dispatchEvent(new CustomEvent('forward', { bubbles: true }));
    // engine.advance() must NOT have been called yet — history.forward() was called instead
    expect(engine.advance.mock.calls.length).toBe(advanceBefore);
  });

  it('shell forward event on skippable unanswered item calls onAdvance() directly', () => {
    vi.useFakeTimers();
    const questionnaire = makeQuestionnaire();
    questionnaire.items = [
      { id: 't1', type: 'text', text: 'הערות' },  // text is skippable by default
      { id: 'q1', type: 'select', text: 'שאלה 1' },
    ];
    const engine = makeEngine(questionnaire);
    // No answer recorded for the text item
    engine.answers.mockReturnValue({});
    const { container } = makeSetup({ questionnaire, engine });

    const advanceBefore = engine.advance.mock.calls.length;
    container.querySelector('app-shell')
      .dispatchEvent(new CustomEvent('forward', { bubbles: true }));
    vi.advanceTimersByTime(200);

    // engine.advance() must have been called — onAdvance() triggered directly
    expect(engine.advance.mock.calls.length).toBeGreaterThan(advanceBefore);
    vi.useRealTimers();
  });
});

describe('router forward — popstate forward advances to next item', () => {
  it('engine.advance() is called after _fireForward("q")', () => {
    vi.useFakeTimers();
    const { container, engine, router } = makeSetup();
    // Answer first item
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));

    const advanceBefore = engine.advance.mock.calls.length;
    router._fireForward('q');
    vi.advanceTimersByTime(150);

    expect(engine.advance.mock.calls.length).toBe(advanceBefore + 1);
    vi.useRealTimers();
  });

  it('advances through instruction items without requiring an answer', () => {
    vi.useFakeTimers();
    const questionnaire = makeQuestionnaire();
    questionnaire.items = [
      { id: 'intro', type: 'instructions', text: 'הוראות' },
      { id: 'q1', type: 'select', text: 'שאלה 1' },
    ];
    const engine = makeEngine(questionnaire);
    const { router } = makeSetup({ questionnaire, engine });
    // engine is on the instructions item — no answer recorded
    engine.answers.mockReturnValue({});

    const advanceBefore = engine.advance.mock.calls.length;
    router._fireForward('q');
    vi.advanceTimersByTime(0); // instructions use 0 delay

    expect(engine.advance.mock.calls.length).toBe(advanceBefore + 1);
    vi.useRealTimers();
  });

  it('does not advance if current item has no answer', () => {
    vi.useFakeTimers();
    const { engine, router } = makeSetup();
    // No answer recorded — engine.answers() returns empty
    engine.answers.mockReturnValue({});

    const advanceBefore = engine.advance.mock.calls.length;
    router._fireForward('q');
    vi.advanceTimersByTime(150);

    expect(engine.advance.mock.calls.length).toBe(advanceBefore);
    vi.useRealTimers();
  });

  it('mounts next item after forward popstate', () => {
    vi.useFakeTimers();
    const { container, engine, router } = makeSetup();
    // Answer first item so forward is valid
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 2 }, bubbles: true }));
    // Make engine return the second item on next advance
    engine.advance.mockReturnValueOnce({ id: 'q2', type: 'select', text: 'שאלה 2', options: [] });

    router._fireForward('q');
    vi.advanceTimersByTime(150);

    expect(container.querySelector('item-select').item.text).toBe('שאלה 2');
    vi.useRealTimers();
  });

  it('does not push a new history entry on forward popstate advance', () => {
    vi.useFakeTimers();
    const { container, router } = makeSetup();
    container.querySelector('item-select')
      .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));

    const pushCountBefore = router.push.mock.calls.length;
    router._fireForward('q');
    vi.advanceTimersByTime(150);

    // push should NOT have been called — we're replaying existing history
    expect(router.push.mock.calls.length).toBe(pushCountBefore);
    vi.useRealTimers();
  });
});

describe('router forward — completion screen', () => {
  it('mounts completion-screen when forward popstate arrives with "complete"', () => {
    const { container, orchestrator, router } = makeSetup();
    orchestrator._fireSessionComplete();
    // Simulate patient going back from completion screen then forward again
    router._fireBack('q');
    router._fireForward('complete');
    expect(container.querySelector('completion-screen')).toBeTruthy();
  });

  it('does not advance engine when forward popstate is "complete"', () => {
    vi.useFakeTimers();
    const { orchestrator, engine, router } = makeSetup();
    orchestrator._fireSessionComplete();
    router._fireBack('q');

    const advanceBefore = engine.advance.mock.calls.length;
    router._fireForward('complete');
    vi.advanceTimersByTime(150);

    expect(engine.advance.mock.calls.length).toBe(advanceBefore);
    vi.useRealTimers();
  });
});

describe('router forward — locked (results screen)', () => {
  it('does not advance after session is locked', () => {
    vi.useFakeTimers();
    const { container, orchestrator, router, engine } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));

    const advanceBefore = engine.advance.mock.calls.length;
    router._fireForward('q');
    vi.advanceTimersByTime(150);

    expect(engine.advance.mock.calls.length).toBe(advanceBefore);
    vi.useRealTimers();
  });
});

// ─── Option resolution regression ────────────────────────────────────────────

describe('option resolution (binary via optionSetId)', () => {
  it('resolves options from optionSetId for binary items', () => {
    const questionnaire = makeQuestionnaire();
    questionnaire.optionSets.yesno = [
      { label: 'כן', value: 1 },
      { label: 'לא', value: 0 },
    ];
    questionnaire.items = [
      { id: 'b1', type: 'binary', text: 'שאלה', optionSetId: 'yesno' },
    ];
    const engine = makeEngine(questionnaire);
    const { container } = makeSetup({ questionnaire, engine });
    const el = container.querySelector('item-binary');
    expect(el).toBeTruthy();
    expect(el.item.options).toHaveLength(2);
    expect(el.item.options[0].label).toBe('כן');
  });

  it('does not crash when binary button is clicked after optionSetId resolution', () => {
    const questionnaire = makeQuestionnaire();
    questionnaire.optionSets.yesno = [
      { label: 'כן', value: 1 },
      { label: 'לא', value: 0 },
    ];
    questionnaire.items = [
      { id: 'b1', type: 'binary', text: 'שאלה', optionSetId: 'yesno' },
    ];
    const engine = makeEngine(questionnaire);
    const { container } = makeSetup({ questionnaire, engine });
    expect(() => {
      container.querySelector('item-binary')
        .dispatchEvent(new CustomEvent('answer', { detail: { value: 1 }, bubbles: true }));
    }).not.toThrow();
    expect(engine.recordAnswer).toHaveBeenCalledWith('b1', 1);
  });
});

// ─── Session complete ─────────────────────────────────────────────────────────

describe('session complete', () => {
  it('removes item component on session complete', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(findItem(container)).toBeNull();
  });

  it('mounts completion-screen on session complete', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    expect(container.querySelector('completion-screen')).toBeTruthy();
  });

  it('keeps canGoBack true on completion screen — patient can still go back', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    const shell = container.querySelector('app-shell');
    expect(shell.canGoBack).toBe(true);
  });

  it('mounts results-screen after view-results event', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));
    expect(container.querySelector('results-screen')).toBeTruthy();
  });

  it('removes completion-screen when results-screen mounts', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));
    expect(container.querySelector('completion-screen')).toBeNull();
  });

  it('disables canGoBack after view-results', () => {
    const { container, orchestrator } = makeSetup();
    orchestrator._fireSessionComplete();
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));
    const shell = container.querySelector('app-shell');
    expect(shell.canGoBack).toBe(false);
  });

  it('passes results array to results-screen', () => {
    const { container, orchestrator, questionnaire } = makeSetup();
    const scores = { [questionnaire.id]: { total: 14, subscales: {}, category: null } };
    orchestrator._fireSessionComplete({ scores });
    container.querySelector('completion-screen')
      .dispatchEvent(new CustomEvent('view-results', { bubbles: true }));
    const resultsEl = container.querySelector('results-screen');
    expect(resultsEl.results).toHaveLength(1);
    expect(resultsEl.results[0].total).toBe(14);
  });
});
