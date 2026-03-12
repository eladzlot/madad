// Router — minimal history-based router for browser back/forward support.
//
// Screens (in forward order):
//   'welcome'   → replaced onto history stack before welcome screen shows
//   'q'         → pushed on each item advance (including first item of each questionnaire)
//   'complete'  → pushed when session completes
//   'results'   → replaces 'complete' (one-way: patient cannot pop back to completion screen)
//
// Usage:
//   import { createRouter } from './router.js';
//   const router = createRouter();          // uses globalThis
//   router.onBack(handler);                 // called with screen string on back popstate
//   router.onForward(handler);              // called with screen string on forward popstate
//   router.push('q');                       // pushes a history entry
//   router.replace('results');              // replaces current entry
//   router.currentScreen();                 // returns current screen string
//   router.destroy();                       // removes popstate listener
//
// Back vs forward detection:
//   history doesn't expose an index, so we embed a monotonic position counter
//   in every state object. On popstate, comparing state.pos to _currentPos tells
//   us direction: lower = back, higher = forward.
//
// Design notes:
//   All back and forward navigation — in-app buttons, overscroll gesture, and the
//   browser's own buttons — is routed exclusively through history.back() /
//   history.forward() → popstate → the registered handler. The controller never
//   calls engine.back() or engine.advance() directly in response to shell nav
//   events; it always delegates to history, which drives the actual navigation.
//   This keeps the history stack in sync at all times.
//
//   The 'results' screen uses replace() so the completion screen entry is removed
//   from history; the patient cannot pop back to it once the session is locked.
//
// Testability:
//   Accepts an optional `win` parameter (default: globalThis) so tests can inject
//   a mock window without a DOM environment.

export function createRouter(win = globalThis) {
  let _backHandler    = null;
  let _forwardHandler = null;
  let _currentPos     = 0;

  function onPopState(e) {
    const state  = e.state ?? {};
    const screen = state.screen ?? 'welcome';
    const pos    = state.pos    ?? 0;

    if (pos < _currentPos) {
      _currentPos = pos;
      _backHandler?.(screen);
    } else if (pos > _currentPos) {
      _currentPos = pos;
      _forwardHandler?.(screen);
    }
    // pos === _currentPos: replaceState edge case — ignore
  }

  win.addEventListener('popstate', onPopState);

  function push(screen) {
    _currentPos++;
    win.history.pushState({ screen, pos: _currentPos }, '');
  }

  function replace(screen) {
    // Keep _currentPos unchanged — replace doesn't move in history.
    win.history.replaceState({ screen, pos: _currentPos }, '');
  }

  function currentScreen() {
    return win.history.state?.screen ?? 'welcome';
  }

  function onBack(handler) {
    _backHandler = handler;
  }

  function onForward(handler) {
    _forwardHandler = handler;
  }

  function destroy() {
    win.removeEventListener('popstate', onPopState);
    _backHandler    = null;
    _forwardHandler = null;
  }

  return { push, replace, currentScreen, onBack, onForward, destroy };
}
