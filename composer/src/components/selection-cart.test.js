// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './selection-cart.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<selection-cart></selection-cart>`);
  Object.assign(el, {
    entries: [{ id: 'phq9', title: 'דיכאון' }, { id: 'gad7', title: 'חרדה' }],
    url: 'http://x/?items=phq9,gad7', pid: '', copied: false, canShare: false, ...props,
  });
  await el.updateComplete;
  return el;
}

describe('selection-cart', () => {
  it('shows the URL and enables copy/open', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.url-box').textContent).toContain('items=phq9,gad7');
    const copy = [...el.shadowRoot.querySelectorAll('.c-btn')].find(b => b.textContent.includes('העתק'));
    expect(copy.disabled).toBe(false);
  });

  it('disables actions and shows placeholder when no url', async () => {
    const el = await makeEl({ url: null, entries: [] });
    expect(el.shadowRoot.querySelector('.url-box').textContent).toContain('לא נבחרו');
    expect(el.shadowRoot.textContent).toContain('בחרו שאלונים');
  });

  it('lists selected entries in order with 1-based order badges', async () => {
    const el = await makeEl();
    const titles = [...el.shadowRoot.querySelectorAll('.item-title')].map(t => t.textContent.trim());
    expect(titles).toEqual(['דיכאון', 'חרדה']);
    const nums = [...el.shadowRoot.querySelectorAll('.order-num')].map(n => n.textContent.trim());
    expect(nums).toEqual(['1', '2']);
  });

  it('emits copy / open (reset now lives in the toolbar, not the cart)', async () => {
    const el = await makeEl();
    const seen = [];
    for (const t of ['copy', 'open']) el.addEventListener(t, () => seen.push(t));
    [...el.shadowRoot.querySelectorAll('.c-btn')].find(b => b.textContent.includes('העתק')).click();
    el.shadowRoot.querySelector('[title="פתח קישור"]').click();
    expect(seen).toEqual(['copy', 'open']);
    // The cart no longer renders its own reset button.
    expect([...el.shadowRoot.querySelectorAll('.c-btn')].some(b => b.textContent.includes('איפוס'))).toBe(false);
  });

  it('shows a share button only when canShare', async () => {
    const withShare = await makeEl({ canShare: true });
    expect([...withShare.shadowRoot.querySelectorAll('.c-btn')].some(b => b.textContent.includes('שתף'))).toBe(true);
    const without = await makeEl({ canShare: false });
    expect([...without.shadowRoot.querySelectorAll('.c-btn')].some(b => b.textContent.includes('שתף'))).toBe(false);
  });

  it('the ↑ button is disabled on the first item, ↓ on the last', async () => {
    const el = await makeEl();
    const rows = [...el.shadowRoot.querySelectorAll('li.item')];
    const up0 = rows[0].querySelector('[aria-label="הזז מעלה"]');
    const down1 = rows[1].querySelector('[aria-label="הזז מטה"]');
    expect(up0.disabled).toBe(true);
    expect(down1.disabled).toBe(true);
  });

  it('↓ on the first item emits reorder { from:0, to:1 }', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('reorder', (e) => { detail = e.detail; });
    el.shadowRoot.querySelector('li.item [aria-label="הזז מטה"]').click();
    expect(detail).toEqual({ from: 0, to: 1 });
  });

  it('remove emits remove { id }', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('remove', (e) => { detail = e.detail; });
    el.shadowRoot.querySelector('li.item [aria-label="הסר"]').click();
    expect(detail).toEqual({ id: 'phq9' });
  });

  it('pid input emits pid-change', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('pid-change', (e) => { detail = e.detail; });
    const input = el.shadowRoot.querySelector('input.pid');
    input.value = 'TRC-1';
    input.dispatchEvent(new Event('input'));
    expect(detail).toEqual({ pid: 'TRC-1' });
  });

  it('shows the copied state on the copy button', async () => {
    const el = await makeEl({ copied: true });
    expect(el.shadowRoot.textContent).toContain('הועתק');
  });
});
