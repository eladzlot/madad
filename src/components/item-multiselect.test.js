// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-multiselect.js';

const item = {
  id: 'symptoms',
  type: 'multiselect',
  text: 'אילו תסמינים חווית?',
  options: [
    { label: 'כאבי ראש' },
    { label: 'עייפות' },
    { label: 'חרדה' },
    { label: 'קשיי שינה' },
  ],
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-multiselect></item-multiselect>`);
  Object.assign(el, { item, selected: null, ...props });
  await el.updateComplete;
  return el;
}

function optionBtns(el) {
  return [...el.shadowRoot.querySelectorAll('.option')];
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders question text', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.question').textContent).toBe(item.text);
  });

  it('renders one button per option', async () => {
    const el = await makeEl();
    expect(optionBtns(el)).toHaveLength(4);
  });

  it('renders option labels', async () => {
    const el = await makeEl();
    const labels = optionBtns(el).map(b => b.querySelector('.option__label').textContent);
    expect(labels).toEqual(['כאבי ראש', 'עייפות', 'חרדה', 'קשיי שינה']);
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

  it('submit button says "המשך ללא בחירה" when nothing checked', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.submit-btn').textContent.trim()).toBe('המשך ללא בחירה');
  });

  it('submit button says "המשך" when something is checked', async () => {
    const el = await makeEl({ selected: [1] });
    expect(el.shadowRoot.querySelector('.submit-btn').textContent.trim()).toBe('המשך');
  });
});

// ─── Selected state ───────────────────────────────────────────────────────────

describe('selected state', () => {
  it('restores checked state from selected array', async () => {
    const el = await makeEl({ selected: [1, 3] });
    const btns = optionBtns(el);
    expect(btns[0].classList.contains('is-checked')).toBe(true);   // index 1
    expect(btns[1].classList.contains('is-checked')).toBe(false);  // index 2
    expect(btns[2].classList.contains('is-checked')).toBe(true);   // index 3
    expect(btns[3].classList.contains('is-checked')).toBe(false);  // index 4
  });

  it('nothing checked when selected is null', async () => {
    const el = await makeEl({ selected: null });
    const checked = optionBtns(el).filter(b => b.classList.contains('is-checked'));
    expect(checked).toHaveLength(0);
  });

  it('nothing checked when selected is empty array', async () => {
    const el = await makeEl({ selected: [] });
    const checked = optionBtns(el).filter(b => b.classList.contains('is-checked'));
    expect(checked).toHaveLength(0);
  });
});

// ─── Toggle behaviour ─────────────────────────────────────────────────────────

describe('toggle behaviour', () => {
  it('clicking an unchecked option checks it', async () => {
    const el = await makeEl();
    optionBtns(el)[0].click();
    await el.updateComplete;
    expect(optionBtns(el)[0].classList.contains('is-checked')).toBe(true);
  });

  it('clicking a checked option unchecks it', async () => {
    const el = await makeEl({ selected: [1] });
    optionBtns(el)[0].click();
    await el.updateComplete;
    expect(optionBtns(el)[0].classList.contains('is-checked')).toBe(false);
  });

  it('multiple options can be checked simultaneously', async () => {
    const el = await makeEl();
    optionBtns(el)[0].click();
    await el.updateComplete;
    optionBtns(el)[2].click();
    await el.updateComplete;
    const checked = optionBtns(el).filter(b => b.classList.contains('is-checked'));
    expect(checked).toHaveLength(2);
  });
});

// ─── Answer event ─────────────────────────────────────────────────────────────

describe('answer event', () => {
  it('fires answer with 1-based index array on click', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    optionBtns(el)[1].click();  // second option = index 2
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].detail.value).toEqual([2]);
  });

  it('toggling off fires answer with updated array', async () => {
    const el = await makeEl({ selected: [1, 2] });
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    optionBtns(el)[0].click();  // uncheck index 1
    expect(spy.mock.calls[0][0].detail.value).toEqual([2]);
  });

  it('answer array is sorted ascending', async () => {
    const el = await makeEl();
    optionBtns(el)[2].click();  // index 3
    await el.updateComplete;
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    optionBtns(el)[0].click();  // index 1
    expect(spy.mock.calls[0][0].detail.value).toEqual([1, 3]);
  });
});

// ─── Advance event ────────────────────────────────────────────────────────────

describe('advance event', () => {
  it('submit button fires advance', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('skip button fires answer([]) then advance', async () => {
    const el = await makeEl();
    const answerSpy = vi.fn();
    const advanceSpy = vi.fn();
    el.addEventListener('answer', answerSpy);
    el.addEventListener('advance', advanceSpy);
    el.shadowRoot.querySelector('.skip-btn').click();
    expect(answerSpy.mock.calls[0][0].detail.value).toEqual([]);
    expect(advanceSpy).toHaveBeenCalledOnce();
  });
});
