// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-binary.js';

const item = {
  id: 'q1',
  type: 'binary',
  text: 'האם ישנת טוב?',
  options: [
    { label: 'כן', value: true },
    { label: 'לא', value: false },
  ],
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-binary></item-binary>`);
  Object.assign(el, { item, ...props });
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });

  it('renders nothing when item has no options (validator guarantees this never happens at runtime)', async () => {
    const noOptionsItem = { id: 'q1', type: 'binary', text: 'Did this happen?' };
    const el = await makeEl({ item: noOptionsItem });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });

});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('accessibility', () => {
  it('question has an id for aria-labelledby', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.question').id).toBe('binary-question');
  });

  it('buttons container has role="group"', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.buttons').getAttribute('role')).toBe('group');
  });

  it('buttons container is labelled by the question', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.buttons').getAttribute('aria-labelledby')).toBe('binary-question');
  });

  it('buttons have aria-pressed="false" when nothing is selected', async () => {
    const el = await makeEl({ selected: null });
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[0].getAttribute('aria-pressed')).toBe('false');
    expect(btns[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('selected button has aria-pressed="true"', async () => {
    const el = await makeEl({ selected: true });
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('aria-pressed updates when selected property changes', async () => {
    const el = await makeEl({ selected: null });
    el.selected = false;
    await el.updateComplete;
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[0].getAttribute('aria-pressed')).toBe('false');
    expect(btns[1].getAttribute('aria-pressed')).toBe('true');
  });
});



describe('selection state', () => {
  it('no button is selected when selected is null', async () => {
    const el = await makeEl({ selected: null });
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[0].classList.contains('selected')).toBe(false);
    expect(btns[1].classList.contains('selected')).toBe(false);
  });

  it('marks first button selected when selected matches first value', async () => {
    const el = await makeEl({ selected: true });
    expect(el.shadowRoot.querySelectorAll('.opt-btn')[0].classList.contains('selected')).toBe(true);
  });

  it('marks second button selected when selected matches second value', async () => {
    const el = await makeEl({ selected: false });
    expect(el.shadowRoot.querySelectorAll('.opt-btn')[1].classList.contains('selected')).toBe(true);
  });

  it('adds has-selection class to buttons container when selected is set', async () => {
    const el = await makeEl({ selected: true });
    expect(el.shadowRoot.querySelector('.buttons').classList.contains('has-selection')).toBe(true);
  });

  it('no has-selection class when selected is null', async () => {
    const el = await makeEl({ selected: null });
    expect(el.shadowRoot.querySelector('.buttons').classList.contains('has-selection')).toBe(false);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('events', () => {
  it('fires answer with first option value on first button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    el.shadowRoot.querySelectorAll('.opt-btn')[0].click();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ value: true });
  });

  it('fires answer with second option value on second button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    el.shadowRoot.querySelectorAll('.opt-btn')[1].click();
    expect(handler.mock.calls[0][0].detail).toEqual({ value: false });
  });

  it('fires advance immediately after answer', async () => {
    const el = await makeEl();
    const answerHandler = vi.fn();
    const advanceHandler = vi.fn();
    el.addEventListener('answer', answerHandler);
    el.addEventListener('advance', advanceHandler);
    el.shadowRoot.querySelectorAll('.opt-btn')[0].click();
    expect(answerHandler).toHaveBeenCalledOnce();
    expect(advanceHandler).toHaveBeenCalledOnce();
  });

  it('fires advance with no detail', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    el.shadowRoot.querySelectorAll('.opt-btn')[0].click();
    expect(handler.mock.calls[0][0].detail).toBeNull();
  });
});

// ─── Reactivity ───────────────────────────────────────────────────────────────

describe('reactivity', () => {
  it('updates selected button when selected property changes', async () => {
    const el = await makeEl({ selected: null });
    el.selected = false;
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.opt-btn')[1].classList.contains('selected')).toBe(true);
  });

  it('updates question text when item changes', async () => {
    const el = await makeEl();
    el.item = { ...item, text: 'שאלה חדשה' };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.question').textContent).toBe('שאלה חדשה');
  });
});

// ─── Swipe gestures ───────────────────────────────────────────────────────────

// Helper: simulate a horizontal swipe on element
function swipe(el, { startX = 150, endX, y = 200 } = {}) {
  const mkTouch = (x) => ({ clientX: x, clientY: y });
  const mkEv = (type, x) => Object.assign(
    new Event(type, { bubbles: true }),
    { touches: [mkTouch(x)], changedTouches: [mkTouch(x)], preventDefault: () => {} }
  );
  el.dispatchEvent(mkEv('touchstart', startX));
  // first move to lock axis
  el.dispatchEvent(mkEv('touchmove', startX + Math.sign(endX - startX) * 20));
  el.dispatchEvent(mkEv('touchmove', endX));
  el.dispatchEvent(mkEv('touchend',  endX));
}

describe('swipe gestures', () => {
  it('swipe right past threshold fires answer with first option value', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    // 300px element, 40% threshold = 120px. Swipe 200px right.
    swipe(el, { startX: 0, endX: 200 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ value: true });
  });

  it('swipe left past threshold fires answer with second option value', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    swipe(el, { startX: 200, endX: 0 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ value: false });
  });

  it('swipe right also fires advance', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    swipe(el, { startX: 0, endX: 200 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('swipe below threshold does not fire answer', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    // Only 30px — well below 40% of any reasonable width
    swipe(el, { startX: 150, endX: 180 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('drag phase updates _dragDx and _dragPhase', async () => {
    const el = await makeEl();
    const mkTouch = (x) => ({ clientX: x, clientY: 200 });
    const mkEv = (type, x) => Object.assign(
      new Event(type, { bubbles: true }),
      { touches: [mkTouch(x)], changedTouches: [mkTouch(x)], preventDefault: () => {} }
    );
    el.dispatchEvent(mkEv('touchstart', 100));
    el.dispatchEvent(mkEv('touchmove',  120)); // lock axis
    el.dispatchEvent(mkEv('touchmove',  160));
    await el.updateComplete;
    expect(el._dragPhase).toBe('move');
    expect(el._dragDx).toBe(60);
  });

  it('drag-commit class applied to first button when dragging right past threshold', async () => {
    const el = await makeEl();
    el._dragDx    = 200;
    el._dragPhase = 'move';
    await el.updateComplete;
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[0].classList.contains('drag-commit')).toBe(true);
    expect(btns[1].classList.contains('drag-commit')).toBe(false);
  });

  it('drag-commit class applied to second button when dragging left past threshold', async () => {
    const el = await makeEl();
    el._dragDx    = -200;
    el._dragPhase = 'move';
    await el.updateComplete;
    const btns = el.shadowRoot.querySelectorAll('.opt-btn');
    expect(btns[1].classList.contains('drag-commit')).toBe(true);
    expect(btns[0].classList.contains('drag-commit')).toBe(false);
  });
});
