// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './completion-screen.js';

async function makeEl() {
  return fixture(testHtml`<completion-screen></completion-screen>`);
}

describe('events', () => {
  it('fires view-results on button click', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('view-results', handler);
    el.shadowRoot.querySelector('.view-btn').click();
    expect(handler).toHaveBeenCalledOnce();
  });
});
