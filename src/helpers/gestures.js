/**
 * gestures.js — touch/pointer gesture utilities
 *
 * Two exported functions:
 *
 *   attachSwipe(element, options) → detach()
 *     Horizontal swipe on element. Used for binary items.
 *     options: { onSwipeRight, onSwipeLeft, onDrag, threshold }
 *
 *   attachOverscroll(scrollEl, options) → detach()
 *     Fires when user pulls past scroll boundary. Used for back/forward nav.
 *     options: { onPullDown, onPullUp, threshold }
 *
 * Both return a detach() function to remove listeners.
 *
 * Constants:
 *   SWIPE_THRESHOLD      — fraction of element width to commit (0.4 = 40%)
 *   OVERSCROLL_THRESHOLD — px past scroll boundary to commit (60px)
 */

export const SWIPE_THRESHOLD      = 0.4;
export const OVERSCROLL_THRESHOLD = 60;

// ── Utilities ─────────────────────────────────────────────────────────────────

function getTouch(e) {
  return e.touches?.[0] ?? e.changedTouches?.[0] ?? null;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── attachSwipe ───────────────────────────────────────────────────────────────

/**
 * Attach horizontal swipe gesture to element.
 *
 * options:
 *   onSwipeRight()          — committed swipe to the right
 *   onSwipeLeft()           — committed swipe to the left
 *   onDrag({ dx, phase })   — called on every move; phase = 'start'|'move'|'end'
 *   threshold               — fraction of width to commit (default SWIPE_THRESHOLD)
 */
export function attachSwipe(element, options = {}) {
  const {
    onSwipeRight,
    onSwipeLeft,
    onDrag,
    threshold = SWIPE_THRESHOLD,
  } = options;

  let startX = null;
  let startY = null;
  let tracking = false;
  let committed = false;
  let lockedAxis = null; // 'h' | 'v' | null

  function onStart(e) {
    const touch = getTouch(e);
    if (!touch) return;
    startX    = touch.clientX;
    startY    = touch.clientY;
    tracking  = true;
    committed = false;
    lockedAxis = null;
    onDrag?.({ dx: 0, phase: 'start' });
  }

  function onMove(e) {
    if (!tracking) return;
    const touch = getTouch(e);
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Lock axis on first significant movement
    if (!lockedAxis) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      }
      return;
    }

    if (lockedAxis === 'v') return; // vertical scroll — don't interfere

    if (e.cancelable) e.preventDefault(); // prevent scroll while swiping horizontally
    onDrag?.({ dx, phase: 'move' });
  }

  function onEnd(e) {
    if (!tracking || lockedAxis !== 'h') {
      tracking = false;
      return;
    }
    tracking = false;

    const touch = getTouch(e);
    const dx = touch ? touch.clientX - startX : 0;
    const width = element.offsetWidth || 300;
    const ratio = Math.abs(dx) / width;

    onDrag?.({ dx: 0, phase: 'end' });

    if (!committed && ratio >= threshold) {
      committed = true;
      if (dx > 0) onSwipeRight?.();
      else        onSwipeLeft?.();
    }
  }

  function onCancel() {
    if (!tracking) return;
    tracking = false;
    onDrag?.({ dx: 0, phase: 'end' });
  }

  element.addEventListener('touchstart', onStart, { passive: true });
  element.addEventListener('touchmove',  onMove,  { passive: false });
  element.addEventListener('touchend',   onEnd,   { passive: true });
  element.addEventListener('touchcancel',onCancel,{ passive: true });

  return function detach() {
    element.removeEventListener('touchstart', onStart);
    element.removeEventListener('touchmove',  onMove);
    element.removeEventListener('touchend',   onEnd);
    element.removeEventListener('touchcancel',onCancel);
  };
}

// ── attachOverscroll ──────────────────────────────────────────────────────────

/**
 * Attach overscroll detection to a scrollable element.
 *
 * Fires onPullDown when user pulls down past the top boundary,
 * fires onPullUp when user pulls up past the bottom boundary.
 *
 * options:
 *   onPullDown()   — user pulled down past top (= go back)
 *   onPullUp()     — user pulled up past bottom (= go forward)
 *   threshold      — px past boundary required (default OVERSCROLL_THRESHOLD)
 */
export function attachOverscroll(scrollEl, options = {}) {
  const {
    onPullDown,
    onPullUp,
    threshold = OVERSCROLL_THRESHOLD,
  } = options;

  let startY       = null;
  let startScrollY = null;
  let fired        = false;

  function atTop() { return scrollEl.scrollTop <= 0; }
  function atBottom() {
    const scrollable = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
    if (!scrollable) return true; // non-scrollable content — always "at bottom"
    return scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
  }

  function onStart(e) {
    const touch = getTouch(e);
    if (!touch) return;
    startY       = touch.clientY;
    startScrollY = scrollEl.scrollTop;
    fired        = false;
  }

  function onMove(e) {
    if (startY === null) return;
    const touch = getTouch(e);
    if (!touch) return;

    const dy = touch.clientY - startY; // positive = pulling down

    if (dy > threshold && atTop() && onPullDown) {
      if (!fired) { fired = true; onPullDown(); }
    } else if (dy < -threshold && atBottom() && onPullUp) {
      if (!fired) { fired = true; onPullUp(); }
    }
  }

  function onEnd() {
    startY       = null;
    startScrollY = null;
    fired        = false;
  }

  scrollEl.addEventListener('touchstart', onStart, { passive: true });
  scrollEl.addEventListener('touchmove',  onMove,  { passive: true });
  scrollEl.addEventListener('touchend',   onEnd,   { passive: true });
  scrollEl.addEventListener('touchcancel',onEnd,   { passive: true });

  return function detach() {
    scrollEl.removeEventListener('touchstart', onStart);
    scrollEl.removeEventListener('touchmove',  onMove);
    scrollEl.removeEventListener('touchend',   onEnd);
    scrollEl.removeEventListener('touchcancel',onEnd);
  };
}
