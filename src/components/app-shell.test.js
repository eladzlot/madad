// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './app-shell.js';

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<app-shell></app-shell>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

describe('rendering', () => {
  it('renders a header and main', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('header')).toBeTruthy();
    expect(el.shadowRoot.querySelector('main')).toBeTruthy();
  });

  it('renders back and forward buttons', async () => {
    const el = await makeEl();
    const btns = el.shadowRoot.querySelectorAll('.nav-btn');
    expect(btns).toHaveLength(2);
  });

  it('back (up) button is first, forward (down) button is second', async () => {
    const el = await makeEl();
    const btns = el.shadowRoot.querySelectorAll('.nav-btn');
    expect(btns[0].getAttribute('aria-label')).toBe('חזור לשאלה הקודמת');
    expect(btns[1].getAttribute('aria-label')).toBe('עבור לשאלה הבאה');
  });
});

describe('back button', () => {
  it('is disabled when canGoBack is false', async () => {
    const el = await makeEl({ canGoBack: false });
    const btn = el.shadowRoot.querySelector('[aria-label="חזור לשאלה הקודמת"]');
    expect(btn.disabled).toBe(true);
  });

  it('is enabled when canGoBack is true', async () => {
    const el = await makeEl({ canGoBack: true });
    const btn = el.shadowRoot.querySelector('[aria-label="חזור לשאלה הקודמת"]');
    expect(btn.disabled).toBe(false);
  });

  it('fires back event when clicked', async () => {
    const el = await makeEl({ canGoBack: true });
    const handler = vi.fn();
    el.addEventListener('back', handler);
    el.shadowRoot.querySelector('[aria-label="חזור לשאלה הקודמת"]').click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire back when disabled', async () => {
    const el = await makeEl({ canGoBack: false });
    const handler = vi.fn();
    el.addEventListener('back', handler);
    el.shadowRoot.querySelector('[aria-label="חזור לשאלה הקודמת"]').click();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('forward button', () => {
  it('is disabled when canGoForward is false', async () => {
    const el = await makeEl({ canGoForward: false });
    const btn = el.shadowRoot.querySelector('[aria-label="עבור לשאלה הבאה"]');
    expect(btn.disabled).toBe(true);
  });

  it('is enabled when canGoForward is true', async () => {
    const el = await makeEl({ canGoForward: true });
    const btn = el.shadowRoot.querySelector('[aria-label="עבור לשאלה הבאה"]');
    expect(btn.disabled).toBe(false);
  });

  it('fires forward event when clicked', async () => {
    const el = await makeEl({ canGoForward: true });
    const handler = vi.fn();
    el.addEventListener('forward', handler);
    el.shadowRoot.querySelector('[aria-label="עבור לשאלה הבאה"]').click();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('reactivity', () => {
  it('updates back button when canGoBack changes', async () => {
    const el = await makeEl({ canGoBack: false });
    el.canGoBack = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[aria-label="חזור לשאלה הקודמת"]').disabled).toBe(false);
  });

  it('updates forward button when canGoForward changes', async () => {
    const el = await makeEl({ canGoForward: false });
    el.canGoForward = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[aria-label="עבור לשאלה הבאה"]').disabled).toBe(false);
  });
});
