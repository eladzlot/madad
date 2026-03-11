// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './progress-bar.js';

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<progress-bar></progress-bar>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('questionnaire name', () => {
  it('renders questionnaire name when provided', async () => {
    const el = await makeEl({ questionnaireName: 'PHQ-9' });
    expect(el.shadowRoot.querySelector('.questionnaire-name').textContent).toBe('PHQ-9');
  });

  it('omits name element when empty', async () => {
    const el = await makeEl({ questionnaireName: '' });
    expect(el.shadowRoot.querySelector('.questionnaire-name')).toBeNull();
  });
});

describe('item count', () => {
  it('renders item count when total is known', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: 9 } });
    expect(el.shadowRoot.querySelector('.item-count').textContent).toContain('3');
    expect(el.shadowRoot.querySelector('.item-count').textContent).toContain('9');
  });

  it('omits item count when total is null', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: null } });
    expect(el.shadowRoot.querySelector('.item-count')).toBeNull();
  });

  it('omits item count when itemProgress is null', async () => {
    const el = await makeEl({ itemProgress: null });
    expect(el.shadowRoot.querySelector('.item-count')).toBeNull();
  });
});

describe('progress track', () => {
  it('renders track when total is known', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: 9 } });
    expect(el.shadowRoot.querySelector('.track')).toBeTruthy();
  });

  it('omits track when total is null', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: null } });
    expect(el.shadowRoot.querySelector('.track')).toBeNull();
  });

  it('sets fill width proportionally', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: 9 } });
    const fill = el.shadowRoot.querySelector('.fill');
    expect(fill.style.inlineSize).toBe('33%');
  });

  it('sets fill to 0% at start', async () => {
    const el = await makeEl({ itemProgress: { current: 0, total: 9 } });
    const fill = el.shadowRoot.querySelector('.fill');
    expect(fill.style.inlineSize).toBe('0%');
  });

  it('has correct ARIA attributes', async () => {
    const el = await makeEl({ itemProgress: { current: 3, total: 9 } });
    const track = el.shadowRoot.querySelector('.track');
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBe('33');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
  });
});

describe('battery row', () => {
  it('renders battery row when battery has multiple questionnaires', async () => {
    const el = await makeEl({ batteryProgress: { current: 2, total: 3 } });
    expect(el.shadowRoot.querySelector('.battery-row').textContent).toContain('2');
    expect(el.shadowRoot.querySelector('.battery-row').textContent).toContain('3');
  });

  it('omits battery row when total is 1', async () => {
    const el = await makeEl({ batteryProgress: { current: 1, total: 1 } });
    expect(el.shadowRoot.querySelector('.battery-row')).toBeNull();
  });

  it('omits battery row when batteryProgress is null', async () => {
    const el = await makeEl({ batteryProgress: null });
    expect(el.shadowRoot.querySelector('.battery-row')).toBeNull();
  });
});

describe('reactivity', () => {
  it('updates fill width when itemProgress changes', async () => {
    const el = await makeEl({ itemProgress: { current: 1, total: 9 } });
    el.itemProgress = { current: 9, total: 9 };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.fill').style.inlineSize).toBe('100%');
  });
});
