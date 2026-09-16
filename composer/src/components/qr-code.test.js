// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html, waitUntil } from '@open-wc/testing';
import './qr-code.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<qr-code></qr-code>`);
  Object.assign(el, { url: 'http://x/?items=phq9', ...props });
  await el.updateComplete;
  return el;
}
const svgOf = (el) => el.shadowRoot.querySelector('.tile svg');
const settle = (el) => waitUntil(() => svgOf(el) !== null, 'QR never rendered');

describe('qr-code', () => {
  it('renders nothing without a url', async () => {
    const el = await makeEl({ url: null });
    expect(el.shadowRoot.querySelector('.tile')).toBeNull();
    expect(el.shadowRoot.querySelector('dialog')).toBeNull();
  });

  it('keeps a same-size placeholder tile, then swaps in the SVG once encoded', async () => {
    const el = await makeEl({ size: 96 });
    const pending = el.shadowRoot.querySelector('.tile.pending');
    expect(pending).not.toBeNull();
    expect(pending.getAttribute('style')).toContain('--qr-size:96px');
    await settle(el);
    expect(el.shadowRoot.querySelector('.tile.pending')).toBeNull();
    const s = svgOf(el);
    expect(s.getAttribute('role')).toBe('img');
    expect(s.querySelector('path').getAttribute('d')).toMatch(/^M4 4h7v1h-7z/); // finder + quiet zone
    // A plain tile: no button, no dialog.
    expect(el.shadowRoot.querySelector('button.tile')).toBeNull();
    expect(el.shadowRoot.querySelector('dialog')).toBeNull();
  });

  it('re-encodes when the url changes and drops a superseded result', async () => {
    const el = await makeEl();
    await settle(el);
    const before = svgOf(el).querySelector('path').getAttribute('d');
    el.url = 'http://x/?items=phq9,gad7,pcl5,ocir,bdi2';
    el.url = 'http://x/?items=gad7';
    await el.updateComplete;
    await waitUntil(() => svgOf(el)?.querySelector('path').getAttribute('d') !== before);
    const viewBox = svgOf(el).getAttribute('viewBox');
    // The short link (version 1 or 2) must win over the long one queued before it.
    expect(Number(viewBox.split(' ')[2])).toBeLessThanOrEqual(25 + 8);
  });

  it('expandable: the tile is a button that opens a dialog with the link and a download', async () => {
    const el = await makeEl({ expandable: true });
    await settle(el);
    const dlg = el.shadowRoot.querySelector('dialog');
    dlg.showModal = vi.fn(() => { dlg.open = true; });
    dlg.close = vi.fn(() => { dlg.open = false; });
    el.shadowRoot.querySelector('button.tile').click();
    await el.updateComplete;
    expect(dlg.showModal).toHaveBeenCalled();
    expect(dlg.querySelector('.big svg')).not.toBeNull();
    expect(dlg.querySelector('.link').textContent).toContain('items=phq9');
    const download = [...dlg.querySelectorAll('.c-btn')].find(b => b.textContent.includes('PNG'));
    expect(download).not.toBeNull();
    // Content click keeps it open; a backdrop click (target = dialog) closes it.
    dlg.querySelector('.frame').click();
    await el.updateComplete;
    expect(dlg.close).not.toHaveBeenCalled();
    dlg.click();
    await el.updateComplete;
    expect(dlg.close).toHaveBeenCalled();
  });

  it('clearing the url tears down the tile and the dialog', async () => {
    const el = await makeEl({ expandable: true });
    await settle(el);
    el.url = null;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tile')).toBeNull();
    expect(el.shadowRoot.querySelector('dialog')).toBeNull();
  });
});
