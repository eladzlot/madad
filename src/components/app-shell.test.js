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

// ─── Overscroll gesture wiring ────────────────────────────────────────────────

describe('overscroll gesture wiring', () => {
  // Simulate what attachOverscroll captures by accessing the internal callbacks
  // via the shadow DOM's .content element touch events.
  function firePullDown(el) {
    const content = el.shadowRoot.querySelector('.content');
    const startEv = Object.assign(new Event('touchstart'), {
      touches: [{ clientX: 150, clientY: 0 }],
      changedTouches: [{ clientX: 150, clientY: 0 }],
    });
    const moveEv = Object.assign(new Event('touchmove'), {
      touches: [{ clientX: 150, clientY: 200 }],
      changedTouches: [{ clientX: 150, clientY: 200 }],
    });
    content.dispatchEvent(startEv);
    content.dispatchEvent(moveEv);
  }

  function firePullUp(el) {
    const content = el.shadowRoot.querySelector('.content');
    // Make element appear at bottom
    Object.defineProperty(content, 'scrollTop',    { value: 0,   configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(content, 'scrollHeight', { value: 600, configurable: true });
    const startEv = Object.assign(new Event('touchstart'), {
      touches: [{ clientX: 150, clientY: 300 }],
      changedTouches: [{ clientX: 150, clientY: 300 }],
    });
    const moveEv = Object.assign(new Event('touchmove'), {
      touches: [{ clientX: 150, clientY: 300 - 61 }],
      changedTouches: [{ clientX: 150, clientY: 300 - 61 }],
    });
    content.dispatchEvent(startEv);
    content.dispatchEvent(moveEv);
  }

  it('fires back event on pull-down when canGoBack is true', async () => {
    const el = await makeEl({ canGoBack: true });
    const handler = vi.fn();
    el.addEventListener('back', handler);
    firePullDown(el);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire back on pull-down when canGoBack is false', async () => {
    const el = await makeEl({ canGoBack: false });
    const handler = vi.fn();
    el.addEventListener('back', handler);
    firePullDown(el);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires forward event on pull-up when canGoForward is true', async () => {
    const el = await makeEl({ canGoForward: true });
    const handler = vi.fn();
    el.addEventListener('forward', handler);
    firePullUp(el);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire forward on pull-up when canGoForward is false', async () => {
    const el = await makeEl({ canGoForward: false });
    const handler = vi.fn();
    el.addEventListener('forward', handler);
    firePullUp(el);
    expect(handler).not.toHaveBeenCalled();
  });
});
