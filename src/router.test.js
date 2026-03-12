import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRouter } from './router.js';

// ── Mock window ───────────────────────────────────────────────────────────────
// Simulates the minimal window/history surface the router uses.
// history.back() and history.forward() fire popstate synchronously with the
// adjacent state, mirroring real browser behaviour for unit tests.

function makeWindow() {
  const stack = [{ screen: null, pos: 0 }]; // blank initial entry
  let pos = 0;
  const _listeners = {};

  const history = {
    get state() { return stack[pos]; },
    pushState(state) {
      stack.splice(pos + 1); // drop any forward entries
      stack.push(state);
      pos = stack.length - 1;
    },
    replaceState(state) {
      stack[pos] = state;
    },
    back() {
      if (pos <= 0) return;
      pos--;
      (_listeners['popstate'] ?? []).forEach(fn => fn({ state: stack[pos] }));
    },
    forward() {
      if (pos >= stack.length - 1) return;
      pos++;
      (_listeners['popstate'] ?? []).forEach(fn => fn({ state: stack[pos] }));
    },
  };

  return {
    history,
    addEventListener(type, fn) {
      (_listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      _listeners[type] = (_listeners[type] ?? []).filter(f => f !== fn);
    },
    _firePopState(state) {
      (_listeners['popstate'] ?? []).forEach(fn => fn({ state }));
    },
    _listenerCount(type) {
      return (_listeners[type] ?? []).length;
    },
  };
}

// ── push / replace / currentScreen ───────────────────────────────────────────

describe('push', () => {
  it('currentScreen() returns pushed screen', () => {
    const win = makeWindow();
    const router = createRouter(win);
    router.push('q');
    expect(router.currentScreen()).toBe('q');
  });

  it('successive pushes update currentScreen', () => {
    const win = makeWindow();
    const router = createRouter(win);
    router.push('q');
    router.push('q');
    router.push('complete');
    expect(router.currentScreen()).toBe('complete');
  });
});

describe('replace', () => {
  it('currentScreen() returns replaced screen', () => {
    const win = makeWindow();
    const router = createRouter(win);
    router.push('complete');
    router.replace('results');
    expect(router.currentScreen()).toBe('results');
  });

  it('replace does not grow the stack — back skips the replaced entry', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const handler = vi.fn();
    router.onBack(handler);

    router.replace('welcome'); // pos 0
    router.push('complete');   // pos 1
    router.replace('results'); // still pos 1, screen changed

    win.history.back(); // should land on 'welcome' at pos 0
    expect(handler).toHaveBeenCalledWith('welcome');
  });
});

describe('currentScreen default', () => {
  it('returns "welcome" before any push/replace', () => {
    const win = makeWindow();
    const router = createRouter(win);
    expect(router.currentScreen()).toBe('welcome');
  });
});

// ── onBack ────────────────────────────────────────────────────────────────────

describe('onBack', () => {
  it('calls handler with screen from previous history state', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const handler = vi.fn();
    router.onBack(handler);

    router.push('q');  // pos 1
    router.push('q');  // pos 2
    win.history.back(); // → pos 1, screen 'q'

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('q');
  });

  it('passes "welcome" when popping to the initial entry', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const handler = vi.fn();
    router.onBack(handler);

    router.push('q');
    win.history.back();

    expect(handler).toHaveBeenCalledWith('welcome');
  });

  it('fires handler for each back step', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const screens = [];
    router.onBack(s => screens.push(s));

    router.replace('welcome'); // pos 0
    router.push('q');          // pos 1
    router.push('q');          // pos 2
    router.push('complete');   // pos 3

    win.history.back(); // → pos 2, 'q'
    win.history.back(); // → pos 1, 'q'
    win.history.back(); // → pos 0, 'welcome'

    expect(screens).toEqual(['q', 'q', 'welcome']);
  });

  it('does not call back handler on forward navigation', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const backHandler = vi.fn();
    router.onBack(backHandler);

    router.push('q');
    router.push('q');
    win.history.back();
    backHandler.mockClear();

    win.history.forward();
    expect(backHandler).not.toHaveBeenCalled();
  });
});

// ── onForward ─────────────────────────────────────────────────────────────────

describe('onForward', () => {
  it('calls forward handler with screen when browser goes forward', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const handler = vi.fn();
    router.onForward(handler);

    router.push('q');   // pos 1
    router.push('q');   // pos 2
    win.history.back(); // → pos 1
    win.history.forward(); // → pos 2, 'q'

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('q');
  });

  it('does not call forward handler on back navigation', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const fwdHandler = vi.fn();
    router.onForward(fwdHandler);

    router.push('q');
    win.history.back();

    expect(fwdHandler).not.toHaveBeenCalled();
  });

  it('fires forward handler for each forward step', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const screens = [];
    router.onForward(s => screens.push(s));

    router.replace('welcome'); // pos 0
    router.push('q');          // pos 1
    router.push('q');          // pos 2
    router.push('complete');   // pos 3

    win.history.back();
    win.history.back();
    win.history.back();
    win.history.forward(); // → pos 1 'q'
    win.history.forward(); // → pos 2 'q'
    win.history.forward(); // → pos 3 'complete'

    expect(screens).toEqual(['q', 'q', 'complete']);
  });

  it('back and forward handlers fire independently', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const back    = vi.fn();
    const forward = vi.fn();
    router.onBack(back);
    router.onForward(forward);

    router.push('q');
    win.history.back();
    win.history.forward();

    expect(back).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();
  });
});

// ── replace does not trigger back or forward ──────────────────────────────────

describe('replace', () => {
  it('replaceState does not trigger back or forward handler', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const back    = vi.fn();
    const forward = vi.fn();
    router.onBack(back);
    router.onForward(forward);

    router.push('complete');
    router.replace('results'); // same pos, different screen

    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('destroy', () => {
  it('removes popstate listener — handlers not called after destroy', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const back    = vi.fn();
    const forward = vi.fn();
    router.onBack(back);
    router.onForward(forward);

    router.push('q');
    router.destroy();

    win.history.back();
    win.history.forward();

    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });

  it('removes exactly one listener on destroy', () => {
    const win = makeWindow();
    const router = createRouter(win);
    expect(win._listenerCount('popstate')).toBe(1);
    router.destroy();
    expect(win._listenerCount('popstate')).toBe(0);
  });

  it('clears handlers on destroy — no throw on subsequent popstate', () => {
    const win = makeWindow();
    const router = createRouter(win);
    router.onBack(vi.fn());
    router.onForward(vi.fn());
    router.destroy();
    expect(() => win._firePopState({ screen: 'q', pos: 1 })).not.toThrow();
  });
});

// ── handler replacement ───────────────────────────────────────────────────────

describe('handler replacement', () => {
  it('replaces back handler when onBack is called twice', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const first  = vi.fn();
    const second = vi.fn();
    router.onBack(first);
    router.onBack(second);

    router.push('q');
    win.history.back();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('replaces forward handler when onForward is called twice', () => {
    const win = makeWindow();
    const router = createRouter(win);
    const first  = vi.fn();
    const second = vi.fn();
    router.onForward(first);
    router.onForward(second);

    router.push('q');
    win.history.back();
    win.history.forward();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
