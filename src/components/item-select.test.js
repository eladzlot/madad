// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-select.js';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const item = {
  id: 'q1',
  text: 'How often have you felt down?',
  options: [
    { label: 'Not at all', value: 0 },
    { label: 'Several days', value: 1 },
    { label: 'More than half the days', value: 2 },
    { label: 'Nearly every day', value: 3 },
  ],
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-select></item-select>`);
  Object.assign(el, { item, selected: null, ...props });
  await el.updateComplete;
  return el;
}

function options(el) {
  return [...el.shadowRoot.querySelectorAll('.option')];
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });
});

// ─── Selected state ───────────────────────────────────────────────────────────

describe('selected state', () => {
  it('marks selected option with is-selected class', async () => {
    const el = await makeEl({ selected: 2 });
    const btns = options(el);
    expect(btns[2].classList.contains('is-selected')).toBe(true);
    expect(btns[0].classList.contains('is-selected')).toBe(false);
  });

  it('sets aria-checked on selected option', async () => {
    const el = await makeEl({ selected: 1 });
    const btns = options(el);
    expect(btns[1].getAttribute('aria-checked')).toBe('true');
    expect(btns[0].getAttribute('aria-checked')).toBe('false');
  });

  it('no option selected when selected is null', async () => {
    const el = await makeEl({ selected: null });
    options(el).forEach(b => expect(b.classList.contains('is-selected')).toBe(false));
  });
});

// ─── ARIA ─────────────────────────────────────────────────────────────────────

describe('ARIA', () => {
  it('radiogroup has aria-labelledby pointing to question', async () => {
    const el = await makeEl();
    const group = el.shadowRoot.querySelector('[role="radiogroup"]');
    const labelId = group.getAttribute('aria-labelledby');
    const labelEl = el.shadowRoot.getElementById(labelId);
    expect(labelEl.textContent).toBe(item.text);
  });

  it('each option has role=radio', async () => {
    const el = await makeEl();
    options(el).forEach(b => expect(b.getAttribute('role')).toBe('radio'));
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('events', () => {
  it('fires answer event with correct value on click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    options(el)[2].click();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ value: 2 });
  });

  it('fires advance event on click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    options(el)[0].click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fires both answer and advance on Enter', async () => {
    const el = await makeEl();
    const answerFn = vi.fn();
    const advanceFn = vi.fn();
    el.addEventListener('answer', answerFn);
    el.addEventListener('advance', advanceFn);
    const btn = options(el)[1];
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(answerFn).toHaveBeenCalledOnce();
    expect(advanceFn).toHaveBeenCalledOnce();
    expect(answerFn.mock.calls[0][0].detail).toEqual({ value: 1 });
  });

  it('fires answer but not advance on Space', async () => {
    const el = await makeEl();
    const answerFn = vi.fn();
    const advanceFn = vi.fn();
    el.addEventListener('answer', answerFn);
    el.addEventListener('advance', advanceFn);
    const btn = options(el)[0];
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(answerFn).toHaveBeenCalledOnce();
    expect(advanceFn).not.toHaveBeenCalled();
  });
});

// ─── Keyboard navigation ──────────────────────────────────────────────────────

describe('keyboard navigation', () => {
  it('ArrowDown moves focus to next option', async () => {
    const el = await makeEl();
    const btns = options(el);
    btns[0].focus();
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).toBe(btns[1]);
  });

  it('ArrowUp moves focus to previous option', async () => {
    const el = await makeEl();
    const btns = options(el);
    btns[2].focus();
    btns[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).toBe(btns[1]);
  });

  it('ArrowDown wraps from last to first', async () => {
    const el = await makeEl();
    const btns = options(el);
    btns[3].focus();
    btns[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
  });

  it('ArrowUp wraps from first to last', async () => {
    const el = await makeEl();
    const btns = options(el);
    btns[0].focus();
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).toBe(btns[3]);
  });
});

// ─── Property updates ─────────────────────────────────────────────────────────

describe('property reactivity', () => {
  it('updates selected highlight when selected property changes', async () => {
    const el = await makeEl({ selected: 0 });
    expect(options(el)[0].classList.contains('is-selected')).toBe(true);
    el.selected = 3;
    await el.updateComplete;
    expect(options(el)[0].classList.contains('is-selected')).toBe(false);
    expect(options(el)[3].classList.contains('is-selected')).toBe(true);
  });

  it('re-renders when item property changes', async () => {
    const el = await makeEl();
    expect(options(el)).toHaveLength(4);
    el.item = { ...item, options: item.options.slice(0, 2) };
    await el.updateComplete;
    expect(options(el)).toHaveLength(2);
  });
});


