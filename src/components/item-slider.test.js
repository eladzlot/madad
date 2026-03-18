// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-slider.js';

const item = {
  id: 'pain',
  type: 'slider',
  text: 'דרגת הכאב',
  min: 0,
  max: 10,
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-slider></item-slider>`);
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

  it('renders a range input', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input).not.toBeNull();
    expect(input.min).toBe('0');
    expect(input.max).toBe('10');
  });

  it('renders min/max labels when provided', async () => {
    const el = await makeEl({
      item: { ...item, labels: { min: 'ללא כאב', max: 'כאב קשה' } },
    });
    const labels = el.shadowRoot.querySelector('.labels-row');
    expect(labels).not.toBeNull();
    expect(labels.textContent).toContain('ללא כאב');
    expect(labels.textContent).toContain('כאב קשה');
  });

  it('min label appears before max label in DOM order (left side of LTR track)', async () => {
    const el = await makeEl({
      item: { ...item, labels: { min: 'ללא כאב', max: 'כאב קשה' } },
    });
    const spans = el.shadowRoot.querySelectorAll('.labels-row span');
    expect(spans[0].textContent).toBe('ללא כאב');
    expect(spans[1].textContent).toBe('כאב קשה');
  });

  it('range input has dir="ltr" to normalise track direction across browsers', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.getAttribute('dir')).toBe('ltr');
  });

  it('does not render labels row when no labels defined', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.labels-row')).toBeNull();
  });

  it('submit button is disabled until slider is touched', async () => {
    const el = await makeEl();
    const btn = el.shadowRoot.querySelector('.submit-btn');
    expect(btn.disabled).toBe(true);
  });

  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('.question')).toBeNull();
  });
});

// ─── Untouched state ──────────────────────────────────────────────────────────

describe('untouched state', () => {
  it('input has untouched class before interaction', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.classList.contains('untouched')).toBe(true);
  });

  it('shows a drag hint before interaction', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.drag-hint')).not.toBeNull();
  });

  it('drag hint is removed after interaction', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.drag-hint')).toBeNull();
  });

  it('input loses untouched class after interaction', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(input.classList.contains('untouched')).toBe(false);
  });

  it('no untouched class when selected is pre-set', async () => {
    const el = await makeEl({ selected: 3 });
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.classList.contains('untouched')).toBe(false);
  });

  it('no drag hint when selected is pre-set', async () => {
    const el = await makeEl({ selected: 3 });
    expect(el.shadowRoot.querySelector('.drag-hint')).toBeNull();
  });
});

// ─── Fill gradient ────────────────────────────────────────────────────────────

describe('fill gradient', () => {
  it('--range-pct is 0% at min value', async () => {
    const el = await makeEl({ selected: 0 });
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.style.getPropertyValue('--range-pct')).toBe('0%');
  });

  it('--range-pct is 100% at max value', async () => {
    const el = await makeEl({ selected: 10 });
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.style.getPropertyValue('--range-pct')).toBe('100%');
  });

  it('--range-pct is 50% at midpoint', async () => {
    const el = await makeEl({ selected: 5 });
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.style.getPropertyValue('--range-pct')).toBe('50%');
  });

  it('--range-pct updates after interaction', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    input.value = '8';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(input.style.getPropertyValue('--range-pct')).toBe('80%');
  });
});



describe('selected state', () => {
  it('restores value and enables submit when selected is set', async () => {
    const el = await makeEl({ selected: 7 });
    const input = el.shadowRoot.querySelector('input[type="range"]');
    expect(input.value).toBe('7');
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(false);
  });

  it('shows value when selected is set', async () => {
    const el = await makeEl({ selected: 7 });
    const display = el.shadowRoot.querySelector('.value-display');
    expect(display.textContent.trim()).toBe('7');
  });
});

// ─── Answer event ─────────────────────────────────────────────────────────────

describe('answer event', () => {
  it('fires answer event on slider input', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('answer', spy);
    const input = el.shadowRoot.querySelector('input[type="range"]');
    input.value = '6';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].detail.value).toBe(6);
  });

  it('enables submit button after first interaction', async () => {
    const el = await makeEl();
    const input = el.shadowRoot.querySelector('input[type="range"]');
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.submit-btn').disabled).toBe(false);
  });
});

// ─── Advance event ────────────────────────────────────────────────────────────

describe('advance event', () => {
  it('fires advance on submit button click after touch', async () => {
    const el = await makeEl({ selected: 5 });
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not fire advance on submit if not touched', async () => {
    const el = await makeEl();
    const spy = vi.fn();
    el.addEventListener('advance', spy);
    el.shadowRoot.querySelector('.submit-btn').click();
    expect(spy).not.toHaveBeenCalled();
  });
});
