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

  it('submit button says "המשך ללא מילוי" when field is empty and not required', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.submit-btn').textContent.trim()).toBe('המשך ללא מילוי');
  });

  it('submit button says "המשך" when field has a value', async () => {
    const el = await makeEl({ selected: 'תשובה' });
    expect(el.shadowRoot.querySelector('.submit-btn').textContent.trim()).toBe('המשך');
  });

  it('submit button says "המשך" when required, regardless of value', async () => {
    const el = await makeEl({ item: { ...item, required: true } });
    expect(el.shadowRoot.querySelector('.submit-btn').textContent.trim()).toBe('המשך');
  });

  it('no skip button rendered', async () => {
    const el = await makeEl();
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

  it('submit with empty field fires answer(null) then advance', async () => {
    const el = await makeEl();
    const answerSpy = vi.fn();
    const advanceSpy = vi.fn();
    el.addEventListener('answer', answerSpy);
    el.addEventListener('advance', advanceSpy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(answerSpy.mock.calls[0][0].detail.value).toBeNull();
    expect(advanceSpy).toHaveBeenCalledOnce();
  });

  it('submit with a value fires advance only (no redundant answer event)', async () => {
    const el = await makeEl({ selected: 'תשובה' });
    const answerSpy = vi.fn();
    const advanceSpy = vi.fn();
    el.addEventListener('answer', answerSpy);
    el.addEventListener('advance', advanceSpy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(answerSpy).not.toHaveBeenCalled();
    expect(advanceSpy).toHaveBeenCalledOnce();
  });
});

// ─── validation ──────────────────────────────────────────────────────────────

// helper: type into input then submit, await render
async function typeAndSubmit(el, value) {
  const input = el.shadowRoot.querySelector('input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await el.updateComplete;
  el.shadowRoot.querySelector('.submit-btn').click();
  await el.updateComplete;
}

describe('validation', () => {
  it('shows no error for valid free-text input after submit', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'line' } });
    await typeAndSubmit(el, 'hello');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });

  it('number: shows error when value is not a number', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'number', required: true } });
    await typeAndSubmit(el, 'abc');
    expect(el.shadowRoot.querySelector('.error').textContent).toContain('מספר');
  });

  it('number: shows error when value is below min', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'number', min: 5, required: true } });
    await typeAndSubmit(el, '2');
    expect(el.shadowRoot.querySelector('.error').textContent).toContain('5');
  });

  it('number: shows error when value is above max', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'number', max: 10, required: true } });
    await typeAndSubmit(el, '99');
    expect(el.shadowRoot.querySelector('.error').textContent).toContain('10');
  });

  it('number: no error when value is within min/max', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'number', min: 1, max: 10, required: true } });
    await typeAndSubmit(el, '5');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });

  it('email: shows error for input without @', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'email', required: true } });
    await typeAndSubmit(el, 'notanemail');
    expect(el.shadowRoot.querySelector('.error').textContent).toBeTruthy();
  });

  it('email: no error for valid email address', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'email', required: true } });
    await typeAndSubmit(el, 'test@example.com');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });

  it('pattern: shows error when value does not match', async () => {
    const el = await makeEl({ item: { ...item, pattern: '^[0-9]+$', required: true } });
    await typeAndSubmit(el, 'abc');
    expect(el.shadowRoot.querySelector('.error').textContent).toBeTruthy();
  });

  it('pattern: no error when value matches', async () => {
    const el = await makeEl({ item: { ...item, pattern: '^[0-9]+$', required: true } });
    await typeAndSubmit(el, '123');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });

  it('pattern: silently skips unsafe ReDoS patterns', async () => {
    const el = await makeEl({ item: { ...item, pattern: '(a+)+', required: true } });
    await typeAndSubmit(el, 'test');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });

  it('no validation on empty input (skippable items)', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'number', min: 5 } });
    await typeAndSubmit(el, '');
    expect(el.shadowRoot.querySelector('.error')).toBeNull();
  });
});

// ─── selected sync on update ──────────────────────────────────────────────────

describe('selected sync', () => {
  it('updates internal value when selected property changes', async () => {
    const el = await makeEl({ selected: 'original' });
    el.selected = 'updated';
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(input.value).toBe('updated');
  });
});
