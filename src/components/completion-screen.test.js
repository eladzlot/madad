// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './completion-screen.js';

async function makeEl() {
  return fixture(testHtml`<completion-screen></completion-screen>`);
}

describe('rendering', () => {
  it('renders a title', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.title').textContent).toContain('סיימת');
  });

  it('renders view-results button', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.view-btn')).toBeTruthy();
  });

  it('renders back hint text', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.back-hint')).toBeTruthy();
  });
});

describe('events', () => {
  it('fires view-results on button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('view-results', handler);
    el.shadowRoot.querySelector('.view-btn').click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire view-results on render', async () => {
    const handler = vi.fn();
    const el = await fixture(testHtml`<completion-screen></completion-screen>`);
    el.addEventListener('view-results', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
