// gestures.test.js — pure logic, no DOM environment needed
import { describe, it, expect, vi } from 'vitest';
import {
  attachSwipe,
  attachOverscroll,
  SWIPE_THRESHOLD,
  OVERSCROLL_THRESHOLD,
} from './gestures.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function touch(x, y) {
  return { clientX: x, clientY: y };
}

function makeEl(width = 300) {
  return {
    offsetWidth: width,
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      this._listeners[type] = (this._listeners[type] ?? []).filter(f => f !== fn);
    },
    dispatch(type, e) { (this._listeners[type] ?? []).forEach(fn => fn(e)); },
  };
}

function makeScrollEl({ scrollTop = 0, clientHeight = 600, scrollHeight = 600 } = {}) {
  const el = makeEl();
  el.scrollTop    = scrollTop;
  el.clientHeight = clientHeight;
  el.scrollHeight = scrollHeight;
  return el;
}

function touchEvent(touches, { cancelable = true } = {}) {
  return {
    touches,
    changedTouches: touches,
    cancelable,
    preventDefault: vi.fn(),
  };
}

// ── attachSwipe ───────────────────────────────────────────────────────────────

describe('attachSwipe', () => {
  it('fires onSwipeRight on rightward swipe past threshold', () => {
    const el = makeEl(300);
    const onSwipeRight = vi.fn();
    attachSwipe(el, { onSwipeRight, threshold: SWIPE_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(100, 200)]));
    el.dispatch('touchmove',  touchEvent([touch(250, 200)])); // lock axis
    el.dispatch('touchmove',  touchEvent([touch(300, 200)])); // dx=200 > 40% of 300
    el.dispatch('touchend',   touchEvent([touch(300, 200)]));

    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it('fires onSwipeLeft on leftward swipe past threshold', () => {
    const el = makeEl(300);
    const onSwipeLeft = vi.fn();
    attachSwipe(el, { onSwipeLeft, threshold: SWIPE_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(200, 200)]));
    el.dispatch('touchmove',  touchEvent([touch(50,  200)])); // lock axis
    el.dispatch('touchmove',  touchEvent([touch(0,   200)])); // dx=-200
    el.dispatch('touchend',   touchEvent([touch(0,   200)]));

    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('does not fire if swipe is below threshold', () => {
    const el = makeEl(300);
    const onSwipeRight = vi.fn();
    attachSwipe(el, { onSwipeRight, threshold: SWIPE_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(100, 200)]));
    el.dispatch('touchmove',  touchEvent([touch(130, 200)])); // lock
    el.dispatch('touchmove',  touchEvent([touch(150, 200)])); // dx=50 < 120 (40% of 300)
    el.dispatch('touchend',   touchEvent([touch(150, 200)]));

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not fire on vertical swipe', () => {
    const el = makeEl(300);
    const onSwipeRight = vi.fn();
    const onSwipeLeft  = vi.fn();
    attachSwipe(el, { onSwipeRight, onSwipeLeft });

    el.dispatch('touchstart', touchEvent([touch(150, 100)]));
    el.dispatch('touchmove',  touchEvent([touch(151, 200)])); // vertical lock
    el.dispatch('touchend',   touchEvent([touch(151, 300)]));

    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('calls onDrag with phase start/move/end', () => {
    const el = makeEl(300);
    const onDrag = vi.fn();
    attachSwipe(el, { onDrag });

    el.dispatch('touchstart', touchEvent([touch(100, 200)]));
    expect(onDrag).toHaveBeenCalledWith({ dx: 0, phase: 'start' });

    el.dispatch('touchmove', touchEvent([touch(150, 200)])); // lock axis
    el.dispatch('touchmove', touchEvent([touch(180, 200)]));
    expect(onDrag).toHaveBeenCalledWith(expect.objectContaining({ phase: 'move' }));

    el.dispatch('touchend', touchEvent([touch(180, 200)]));
    expect(onDrag).toHaveBeenCalledWith({ dx: 0, phase: 'end' });
  });

  it('does not fire twice on same swipe', () => {
    const el = makeEl(300);
    const onSwipeRight = vi.fn();
    attachSwipe(el, { onSwipeRight, threshold: SWIPE_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(0,   200)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 200)]));
    el.dispatch('touchmove',  touchEvent([touch(300, 200)]));
    el.dispatch('touchend',   touchEvent([touch(300, 200)]));

    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it('does not call preventDefault on non-cancelable touchmove', () => {
    const el = makeEl(300);
    attachSwipe(el, { onSwipeRight: vi.fn() });

    el.dispatch('touchstart', touchEvent([touch(0, 200)]));
    const moveEv = touchEvent([touch(150, 200)], { cancelable: false });
    el.dispatch('touchmove', moveEv);

    expect(moveEv.preventDefault).not.toHaveBeenCalled();
  });

  it('calls preventDefault on cancelable horizontal touchmove', () => {
    const el = makeEl(300);
    attachSwipe(el, { onSwipeRight: vi.fn() });

    el.dispatch('touchstart', touchEvent([touch(0, 200)]));
    el.dispatch('touchmove',  touchEvent([touch(20, 200)])); // lock horizontal
    const move = touchEvent([touch(80, 200)], { cancelable: true });
    el.dispatch('touchmove', move);

    expect(move.preventDefault).toHaveBeenCalled();
  });

  it('detach removes all listeners', () => {
    const el = makeEl(300);
    const onSwipeRight = vi.fn();
    const detach = attachSwipe(el, { onSwipeRight, threshold: SWIPE_THRESHOLD });
    detach();

    el.dispatch('touchstart', touchEvent([touch(0,   200)]));
    el.dispatch('touchmove',  touchEvent([touch(200, 200)]));
    el.dispatch('touchend',   touchEvent([touch(200, 200)]));

    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});

// ── attachOverscroll ──────────────────────────────────────────────────────────

describe('attachOverscroll', () => {
  it('fires onPullDown when pulling down at top', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 800 });
    const onPullDown = vi.fn();
    attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 100)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100 + OVERSCROLL_THRESHOLD + 1)]));

    expect(onPullDown).toHaveBeenCalledOnce();
  });

  it('does not fire onPullDown when not at top', () => {
    const el = makeScrollEl({ scrollTop: 100, clientHeight: 400, scrollHeight: 800 });
    const onPullDown = vi.fn();
    attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 100)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 200)]));

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it('fires onPullUp when pulling up at bottom', () => {
    const el = makeScrollEl({ scrollTop: 200, clientHeight: 600, scrollHeight: 800 });
    const onPullUp = vi.fn();
    attachOverscroll(el, { onPullUp, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 300)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 300 - OVERSCROLL_THRESHOLD - 1)]));

    expect(onPullUp).toHaveBeenCalledOnce();
  });

  it('does not fire onPullUp when not at bottom', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 800 });
    const onPullUp = vi.fn();
    attachOverscroll(el, { onPullUp, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 300)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100)]));

    expect(onPullUp).not.toHaveBeenCalled();
  });

  it('fires only once per gesture', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 800 });
    const onPullDown = vi.fn();
    attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 0)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 200)]));
    el.dispatch('touchend',   touchEvent([touch(150, 200)]));

    expect(onPullDown).toHaveBeenCalledOnce();
  });

  it('can fire again after touchend', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 800 });
    const onPullDown = vi.fn();
    attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 0)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100)]));
    el.dispatch('touchend',   touchEvent([touch(150, 100)]));

    el.dispatch('touchstart', touchEvent([touch(150, 0)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100)]));
    el.dispatch('touchend',   touchEvent([touch(150, 100)]));

    expect(onPullDown).toHaveBeenCalledTimes(2);
  });

  it('fires onPullDown on non-scrollable content', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 });
    const onPullDown = vi.fn();
    attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 100)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100 + OVERSCROLL_THRESHOLD + 1)]));

    expect(onPullDown).toHaveBeenCalledOnce();
  });

  it('fires onPullUp on non-scrollable content', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 });
    const onPullUp = vi.fn();
    attachOverscroll(el, { onPullUp, threshold: OVERSCROLL_THRESHOLD });

    el.dispatch('touchstart', touchEvent([touch(150, 300)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 300 - OVERSCROLL_THRESHOLD - 1)]));

    expect(onPullUp).toHaveBeenCalledOnce();
  });

  it('detach removes all listeners', () => {
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400, scrollHeight: 800 });
    const onPullDown = vi.fn();
    const detach = attachOverscroll(el, { onPullDown, threshold: OVERSCROLL_THRESHOLD });
    detach();

    el.dispatch('touchstart', touchEvent([touch(150, 0)]));
    el.dispatch('touchmove',  touchEvent([touch(150, 100)]));

    expect(onPullDown).not.toHaveBeenCalled();
  });
});
