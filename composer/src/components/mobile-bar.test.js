// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './mobile-bar.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<mobile-bar></mobile-bar>`);
  Object.assign(el, {
    entries: [{ id: 'phq9', title: 'דיכאון' }, { id: 'gad7', title: 'חרדה' }],
    url: 'http://x/?items=phq9,gad7', pid: '', patientLang: 'he',
    langs: ['he', 'en'], dropped: [], pidWarning: '', copied: false, canShare: false, ...props,
  });
  await el.updateComplete;
  return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);

describe('mobile-bar', () => {
  describe('the bar', () => {
    it('counts the selection and says it opens something', async () => {
      // Without the chevron the count read as a status line, and nothing
      // invited the tap that reveals the panel.
      const el = await makeEl();
      expect(q(el, '.count').textContent).toContain('2');
      expect(q(el, '.chev')).not.toBeNull();
      expect(q(el, '.count-btn').getAttribute('aria-expanded')).toBe('false');
    });

    it('carries no URL — it always clipped at this width', async () => {
      const el = await makeEl();
      expect(q(el, '.url-box')).toBeNull();
      expect(q(el, '.url-line')).toBeNull();
    });

    it('disables the count button and the actions with nothing picked', async () => {
      const el = await makeEl({ entries: [], url: null });
      expect(q(el, '.count-btn').disabled).toBe(true);
      expect(q(el, '.count').textContent).toContain('טרם');
      expect(q(el, '.qr-btn').disabled).toBe(true);
      expect(q(el, '.copy-btn').disabled).toBe(true);
    });

    it('promotes share to the primary action where the platform has it', async () => {
      const copyOnly = await makeEl();
      expect(q(copyOnly, '.copy-btn')).not.toBeNull();
      expect(q(copyOnly, '.share-btn')).toBeNull();

      const el = await makeEl({ canShare: true });
      expect(q(el, '.copy-btn')).toBeNull();
      let shared = false;
      el.addEventListener('share', () => { shared = true; });
      q(el, '.share-btn').click();
      expect(shared).toBe(true);
    });

    it('reaches the QR without opening the sheet', async () => {
      const el = await makeEl();
      const qr = q(el, '.bar qr-code');
      expect(qr.tileless).toBe(true);
      let expanded = false;
      qr.expand = () => { expanded = true; };
      q(el, '.qr-btn').click();
      expect(expanded).toBe(true);
      expect(q(el, '.sheet')).toBeNull();
    });
  });

  describe('the sheet', () => {
    async function opened(props) {
      const el = await makeEl(props);
      q(el, '.count-btn').click();
      await el.updateComplete;
      return el;
    }

    it('is closed until the count button is pressed', async () => {
      const el = await makeEl();
      expect(q(el, '.sheet')).toBeNull();
      expect(q(el, '.backdrop')).toBeNull();
    });

    it('renders the same panel the rail does, in compact mode', async () => {
      // One renderer, two hosts — there is no second implementation of the
      // selection, the settings or the link.
      const el = await opened();
      const panel = q(el, '.sheet selection-cart');
      expect(panel).not.toBeNull();
      expect(panel.compact).toBe(true);
      expect(panel.entries).toHaveLength(2);
      expect(panel.url).toBe('http://x/?items=phq9,gad7');
      expect(q(el, '.count-btn').getAttribute('aria-expanded')).toBe('true');
    });

    it('threads settings state into the panel', async () => {
      const el = await opened({ pid: 'TRC-1', patientLang: 'en', dropped: ['pcl5'] });
      const panel = q(el, '.sheet selection-cart');
      expect(panel.pid).toBe('TRC-1');
      expect(panel.patientLang).toBe('en');
      expect(panel.dropped).toEqual(['pcl5']);
    });

    it('offers reset, which the browse toolbar cannot while the sheet covers it', async () => {
      const el = await opened();
      let reset = false;
      el.addEventListener('reset', () => { reset = true; });
      q(el, '.reset-btn').click();
      expect(reset).toBe(true);
    });

    it('closes on the ✕, the backdrop and Escape', async () => {
      for (const close of [
        (el) => q(el, '.close-btn').click(),
        (el) => q(el, '.backdrop').click(),
        () => globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
      ]) {
        const el = await opened();
        close(el);
        await el.updateComplete;
        expect(q(el, '.sheet')).toBeNull();
      }
    });
  });
});
