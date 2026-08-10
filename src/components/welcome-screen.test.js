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

// CTR POC: the name field is gone, so the name-entry cases went with it.
// `begin` still carries a name for the rest of the pipeline; it is always ''.
describe('begin event', () => {
  it('fires begin with an empty name on button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('begin', handler);
    el.shadowRoot.querySelector('.begin-btn').click();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ name: '' });
  });

  it('does not render a name field', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('input')).toBeNull();
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
