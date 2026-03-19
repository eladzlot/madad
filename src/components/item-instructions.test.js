// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './item-instructions.js';

const item = {
  id: 'intro',
  text: 'ברוכים הבאים לשאלון.\nאנא ענו על כל השאלות.',
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<item-instructions></item-instructions>`);
  Object.assign(el, { item, ...props });
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders each line as a separate paragraph', async () => {
    const el = await makeEl();
    const paras = el.shadowRoot.querySelectorAll('p');
    expect(paras).toHaveLength(2);
    expect(paras[0].textContent).toBe('ברוכים הבאים לשאלון.');
    expect(paras[1].textContent).toBe('אנא ענו על כל השאלות.');
  });

  it('renders a continue button', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.continue-btn')).toBeTruthy();
  });

  it('continue button says המשך', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.continue-btn').textContent.trim()).toBe('המשך');
  });

  it('renders nothing when item is null', async () => {
    const el = await makeEl({ item: null });
    expect(el.shadowRoot.querySelector('p')).toBeNull();
    expect(el.shadowRoot.querySelector('.continue-btn')).toBeNull();
  });

  it('renders single-line text as one paragraph', async () => {
    const el = await makeEl({ item: { id: 'x', text: 'שורה אחת' } });
    expect(el.shadowRoot.querySelectorAll('p')).toHaveLength(1);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('events', () => {
  it('fires advance on button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    el.shadowRoot.querySelector('.continue-btn').click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fires advance on Enter key', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fires advance on Space key', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('advance', handler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire answer event', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('answer', handler);
    el.shadowRoot.querySelector('.continue-btn').click();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── Reactivity ───────────────────────────────────────────────────────────────

describe('reactivity', () => {
  it('updates when item text changes', async () => {
    const el = await makeEl();
    el.item = { id: 'x', text: 'טקסט חדש' };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('p').textContent).toBe('טקסט חדש');
  });
});
