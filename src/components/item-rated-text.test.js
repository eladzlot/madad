// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-rated-text.js';

const item = {
  id: 'p1',
  type: 'rated_text',
  text: 'תאר את הבעיה המרכזית',
  min: 1,
  max: 12,
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-rated-text></item-rated-text>`);
  Object.assign(el, { item, selected: null, selectedText: null, ...props });
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders the prompt, a textarea, and a range input', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.question').textContent).toBe(item.text);
    expect(el.shadowRoot.querySelector('textarea')).not.toBeNull();
    const range = el.shadowRoot.querySelector('input[type="range"]');
    expect(range.min).toBe('1');
    expect(range.max).toBe('12');
  });

  it('renders a single-line input when inputType is line', async () => {
    const el = await makeEl({ item: { ...item, inputType: 'line' } });
    expect(el.shadowRoot.querySelector('textarea')).toBeNull();
    expect(el.shadowRoot.querySelector('input.line')).not.toBeNull();
  });

  it('renders an optional ratingText prompt above the slider', async () => {
    const el = await makeEl({ item: { ...item, ratingText: 'עד כמה זה מטריד?' } });
    expect(el.shadowRoot.querySelector('.rating-label').textContent).toContain('עד כמה זה מטריד?');
  });

  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });
});

// ─── Submit gating (the rating is the gate) ───────────────────────────────────

describe('submit gating', () => {
  it('submit is disabled until the slider is touched', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(true);
  });

  it('typing text alone does not enable submit', async () => {
    const el = await makeEl();
    const ta = el.shadowRoot.querySelector('textarea');
    ta.value = 'קושי להירדם';
    ta.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(true);
  });

  it('touching the slider enables submit', async () => {
    const el = await makeEl();
    const range = el.shadowRoot.querySelector('input[type="range"]');
    range.value = '8';
    range.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(false);
  });

  it('required:false makes the item advanceable with nothing entered', async () => {
    const el = await makeEl({ item: { ...item, required: false } });
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(false);
  });
});

// ─── Rehydration (back-navigation) ────────────────────────────────────────────

describe('rehydration', () => {
  it('restores rating and text from selected / selectedText', async () => {
    const el = await makeEl({ selected: 8, selectedText: 'קושי להירדם' });
    expect(el.shadowRoot.querySelector('input[type="range"]').value).toBe('8');
    expect(el.shadowRoot.querySelector('textarea').value).toBe('קושי להירדם');
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(false);
  });
});

// ─── Answer event carries both halves ─────────────────────────────────────────

describe('answer event', () => {
  it('emits { value: rating, text } when the slider moves', async () => {
    const el = await makeEl({ selectedText: 'קושי להירדם' });
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const range = el.shadowRoot.querySelector('input[type="range"]');
    range.value = '6';
    range.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy.mock.calls.at(-1)[0].detail).toEqual({ value: 6, text: 'קושי להירדם' });
  });

  it('keeps value null while text is typed before the slider is touched', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const ta = el.shadowRoot.querySelector('textarea');
    ta.value = 'מחשבה תקועה';
    ta.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy.mock.calls.at(-1)[0].detail).toEqual({ value: null, text: 'מחשבה תקועה' });
  });

  it('emits text:null when the text field is empty', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const range = el.shadowRoot.querySelector('input[type="range"]');
    range.value = '3';
    range.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy.mock.calls.at(-1)[0].detail).toEqual({ value: 3, text: null });
  });
});

// ─── Advance event ────────────────────────────────────────────────────────────

describe('advance event', () => {
  it('fires advance on submit once the rating is set', async () => {
    const el = await makeEl({ selected: 5 });
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not fire advance while untouched and required', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).not.toHaveBeenCalled();
  });
});
