// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-text.js';

const item = {
  id: 'q1',
  type: 'text',
  text: 'הערות נוספות',
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-text></item-text>`);
  Object.assign(el, { item, selected: null, ...props });
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders question text', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.question').textContent).toBe(item.text);
  });

  it('renders a single-line input by default', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('input')).not.toBeNull();
    expect(el.shadowRoot.querySelector('textarea')).toBeNull();
  });

  it('renders a textarea for multiline inputType', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'multiline' } });
    expect(el.shadowRoot.querySelector('textarea')).not.toBeNull();
    expect(el.shadowRoot.querySelector('input')).toBeNull();
  });

  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });

  it('shows skip button when not required (default)', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.skip-btn')).not.toBeNull();
  });

  it('hides skip button when required: true', async () => {
    const el = await makeEl({ item: { ...item, required: true } });
    expect(el.shadowRoot.querySelector('.skip-btn')).toBeNull();
  });
});

// ─── Selected state ───────────────────────────────────────────────────────────

describe('selected state', () => {
  it('restores value when selected is set', async () => {
    const el = await makeEl({ selected: 'some previous text' });
    const input = el.shadowRoot.querySelector('input');
    expect(input.value).toBe('some previous text');
  });

  it('shows empty input when selected is null', async () => {
    const el = await makeEl({ selected: null });
    expect(el.shadowRoot.querySelector('input').value).toBe('');
  });
});

// ─── Answer event ─────────────────────────────────────────────────────────────

describe('answer event', () => {
  it('fires answer event on input', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const input = el.shadowRoot.querySelector('input');
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].detail.value).toBe('hello');
  });

  it('fires answer with null when input is cleared', async () => {
    const el = await makeEl({ selected: 'text' });
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const input = el.shadowRoot.querySelector('input');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy.mock.calls[0][0].detail.value).toBeNull();
  });
});

// ─── Advance event ────────────────────────────────────────────────────────────

describe('advance event', () => {
  it('fires advance on submit button click', async () => {
    const el = await makeEl({ selected: 'answer' });
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fires advance on Enter key in single-line input', async () => {
    const el = await makeEl({ selected: 'answer' });
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    const input = el.shadowRoot.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not fire advance on Enter in multiline textarea', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'multiline' } });
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    const ta = el.shadowRoot.querySelector('textarea');
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('skip button fires answer(null) then advance', async () => {
    const el = await makeEl();
    const answerSpy = vi.fn();
    const advanceSpy = vi.fn();
    el.addEventListener('answer', answerSpy);
    el.addEventListener('advance', advanceSpy);
    el.shadowRoot.querySelector('.skip-btn').click();
    expect(answerSpy.mock.calls[0][0].detail.value).toBeNull();
    expect(advanceSpy).toHaveBeenCalledOnce();
  });
});
