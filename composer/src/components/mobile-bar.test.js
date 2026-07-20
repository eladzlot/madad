// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './mobile-bar.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<mobile-bar></mobile-bar>`);
  Object.assign(el, {
    entries: [{ id: 'phq9', title: 'דיכאון' }], url: 'http://x/?items=phq9',
    pid: '', copied: false, canShare: false, ...props,
  });
  await el.updateComplete;
  return el;
}

describe('mobile-bar', () => {
  it('shows the selected count', async () => {
    const el = await makeEl({ entries: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] });
    expect(el.shadowRoot.querySelector('.count').textContent).toContain('נבחרו 2');
  });

  it('shows the empty prompt with no selection', async () => {
    const el = await makeEl({ entries: [] });
    expect(el.shadowRoot.querySelector('.count').textContent).toContain('טרם נבחרו');
  });

  it('primary action is copy without share, share when available', async () => {
    const copyBar = await makeEl();
    expect(copyBar.shadowRoot.querySelector('.bar').textContent).toContain('העתק');
    const shareBar = await makeEl({ canShare: true });
    expect(shareBar.shadowRoot.querySelector('.bar').textContent).toContain('שתף');
  });

  it('opening the sheet reveals the ordered list, pid, and link; closing hides it', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.sheet')).toBeNull();
    el.shadowRoot.querySelector('.bar .c-btn--secondary').click(); // פרטים
    await el.updateComplete;
    const sheet = el.shadowRoot.querySelector('.sheet');
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain('דיכאון');
    expect(sheet.querySelector('input.pid')).not.toBeNull();
    expect(sheet.querySelector('.url-box').textContent).toContain('items=phq9');

    el.shadowRoot.querySelector('.backdrop').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.sheet')).toBeNull();
  });

  it('sheet actions emit copy / open / reset / reorder / remove / pid-change', async () => {
    const el = await makeEl({ entries: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] });
    el.shadowRoot.querySelector('.bar .c-btn--secondary').click();
    await el.updateComplete;
    const seen = {};
    for (const t of ['copy', 'open', 'reset', 'reorder', 'remove', 'pid-change']) {
      el.addEventListener(t, (e) => { seen[t] = e.detail ?? true; });
    }
    const sheet = el.shadowRoot.querySelector('.sheet');
    [...sheet.querySelectorAll('.c-btn')].find(b => b.textContent.includes('העתק')).click();
    [...sheet.querySelectorAll('.c-btn')].find(b => b.textContent.includes('↗')).click();
    [...sheet.querySelectorAll('.c-btn')].find(b => b.textContent.includes('איפוס')).click();
    sheet.querySelector('[aria-label="הזז מטה"]').click();      // reorder from:0 to:1
    sheet.querySelector('[aria-label="הסר"]').click();          // remove first
    const pid = sheet.querySelector('input.pid');
    pid.value = 'P1'; pid.dispatchEvent(new Event('input'));

    expect(seen.copy).toBeTruthy();
    expect(seen.open).toBeTruthy();
    expect(seen.reset).toBeTruthy();
    expect(seen.reorder).toEqual({ from: 0, to: 1 });
    expect(seen.remove).toEqual({ id: 'a' });
    expect(seen['pid-change']).toEqual({ pid: 'P1' });
  });
});
