// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './welcome-screen.js';

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<welcome-screen></welcome-screen>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders battery title when provided', async () => {
    const el = await makeEl({ batteryTitle: 'הערכה ראשונית' });
    expect(el.shadowRoot.querySelector('.battery-title').textContent).toBe('הערכה ראשונית');
  });

  it('omits battery title when empty', async () => {
    const el = await makeEl({ batteryTitle: '' });
    expect(el.shadowRoot.querySelector('.battery-title')).toBeNull();
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('begin event', () => {
  it('fires begin with name on button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    const input = el.shadowRoot.querySelector('input');
    input.value = 'ישראל ישראלי';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    el.shadowRoot.querySelector('.begin-btn').click();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ name: 'ישראל ישראלי' });
  });

  it('fires begin with empty name when no input given', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    el.shadowRoot.querySelector('.begin-btn').click();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ name: '' });
  });

  it('trims whitespace from name', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    const input = el.shadowRoot.querySelector('input');
    input.value = '  שרה  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    el.shadowRoot.querySelector('.begin-btn').click();
    expect(handler.mock.calls[0][0].detail).toEqual({ name: 'שרה' });
  });

  it('fires begin on Enter key in input', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    el.shadowRoot.querySelector('input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire begin on other keys', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    el.shadowRoot.querySelector('input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── Reactivity ───────────────────────────────────────────────────────────────

describe('reactivity', () => {
  it('updates title when batteryTitle changes', async () => {
    const el = await makeEl({ batteryTitle: 'ראשון' });
    el.batteryTitle = 'שני';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.battery-title').textContent).toBe('שני');
  });
});
