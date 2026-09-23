// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './session-settings.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<session-settings></session-settings>`);
  Object.assign(el, {
    pid: '', patientLang: 'he', langs: ['he', 'en'], dropped: [], pidWarning: '', ...props,
  });
  await el.updateComplete;
  return el;
}

const pidChip  = (el) => el.shadowRoot.querySelector('.pid-chip');
const field    = (el) => el.shadowRoot.querySelector('.field');
const langSel  = (el) => el.shadowRoot.querySelector('select.lang-chip');

describe('session-settings', () => {
  it('starts closed — the pid field is not in the DOM at all', async () => {
    // Asserting a `hidden` attribute is not enough: the field sets
    // `display: flex`, which beats the UA [hidden] rule, and that is exactly
    // how it once shipped permanently open. Absence is unambiguous.
    const el = await makeEl();
    expect(field(el)).toBeNull();
    expect(el.shadowRoot.querySelector('input.pid')).toBeNull();
    expect(pidChip(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('the language chip is a select — one click reaches the list', async () => {
    // Not a disclosure and not a toggle: the language list is open-ended
    // (I18N-8 Russian, I18N-9 Arabic), and the nav switch behaves the same way.
    const el = await makeEl();
    expect(langSel(el)).not.toBeNull();
    expect(langSel(el).value).toBe('he');
    expect(el.shadowRoot.querySelector('button.lang-chip')).toBeNull();
  });

  it('marks an unset pid chip as an empty slot, not a value', async () => {
    const el = await makeEl();
    expect(pidChip(el).classList.contains('c-chip--unset')).toBe(true);
    expect(pidChip(el).textContent).toContain('הוסף מזהה');
    expect(pidChip(el).querySelector('.c-chip-value')).toBeNull();
  });

  it('shows the pid itself once set', async () => {
    const el = await makeEl({ pid: 'TRC-2025-001' });
    expect(pidChip(el).classList.contains('c-chip--unset')).toBe(false);
    expect(pidChip(el).querySelector('.c-chip-value').textContent).toBe('TRC-2025-001');
  });

  it('the ID chip reveals the field and puts the cursor in it', async () => {
    // Revealing a field and then making the clinician click it would be two
    // clicks for one intention.
    const el = await makeEl();
    pidChip(el).click();
    await el.updateComplete;
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(field(el)).not.toBeNull();
    expect(pidChip(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.shadowRoot.activeElement).toBe(el.shadowRoot.querySelector('input.pid'));
  });

  it('emits pid-change from the drawer input', async () => {
    const el = await makeEl({ open: true });
    let detail = null;
    el.addEventListener('pid-change', (e) => { detail = e.detail; });
    const input = el.shadowRoot.querySelector('input.pid');
    input.value = 'ABC';
    input.dispatchEvent(new Event('input'));
    expect(detail).toEqual({ pid: 'ABC' });
  });

  it('offers every language, so a third one just works', async () => {
    const el = await makeEl({ langs: ['he', 'en', 'ru'] });
    expect([...langSel(el).options].map(o => o.value)).toEqual(['he', 'en', 'ru']);
  });

  it('emits patient-lang-change when the select changes', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('patient-lang-change', (e) => { detail = e.detail; });
    langSel(el).value = 'en';
    langSel(el).dispatchEvent(new Event('change'));
    expect(detail).toEqual({ lang: 'en' });
  });

  it('hides the language chip entirely when only one language exists', async () => {
    const el = await makeEl({ open: true, langs: ['he'] });
    expect(langSel(el)).toBeNull();
    expect(el.shadowRoot.querySelector('input.pid')).not.toBeNull();
  });

  it('reveals the field when a language switch drops entries, and offers dismissal', async () => {
    const el = await makeEl();
    expect(el.open).toBe(false);
    el.dropped = ['pcl5', 'ptci'];
    await el.updateComplete;
    expect(el.open).toBe(true);

    const notice = el.shadowRoot.querySelector('.dropped');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('2');

    let dismissed = false;
    el.addEventListener('dropped-dismiss', () => { dismissed = true; });
    notice.querySelector('button').click();
    expect(dismissed).toBe(true);
  });

  it('reveals the field when the pid is invalid, so the warning points somewhere visible', async () => {
    const el = await makeEl();
    el.pidWarning = 'מזהה לא תקין';
    await el.updateComplete;
    expect(el.open).toBe(true);
  });

  it('does not force itself closed again once something has been flagged', async () => {
    const el = await makeEl({ pidWarning: 'bad' });
    await el.updateComplete;
    el.pidWarning = '';
    await el.updateComplete;
    expect(el.open).toBe(true);
  });

  describe('trial uid field on a touch device', () => {
    const VALID = '70NH-E973';
    const input = (el) => el.shadowRoot.querySelector('input.pid');
    const touch = (coarse) => vi.stubGlobal('matchMedia', (q) => ({ matches: coarse && q === '(pointer: coarse)' }));
    afterEach(() => vi.unstubAllGlobals());

    // Typing in the field as the browser would: set the value, fire input.
    const type = (el, value) => {
      input(el).value = value;
      input(el).dispatchEvent(new Event('input', { bubbles: true }));
    };
    const trackBlur = (el) => { const spy = vi.fn(); input(el).blur = spy; return spy; };

    it('puts the keyboard away the moment the uid validates', async () => {
      // The share button it enables sits in the bar the keyboard is covering.
      touch(true);
      const el = await makeEl({ required: true });
      const blur = trackBlur(el);
      type(el, '70NH-E97');
      expect(blur).not.toHaveBeenCalled();
      type(el, VALID);
      expect(blur).toHaveBeenCalledOnce();
    });

    it('keeps the keyboard up for a uid that fails its check', async () => {
      touch(true);
      const el = await makeEl({ required: true });
      const blur = trackBlur(el);
      type(el, '70NH-E974');
      expect(blur).not.toHaveBeenCalled();
    });

    it('leaves the cursor alone on a desktop', async () => {
      touch(false);
      const el = await makeEl({ required: true });
      const blur = trackBlur(el);
      type(el, VALID);
      expect(blur).not.toHaveBeenCalled();
    });

    it('leaves the cursor alone off the trial (free-text identifier)', async () => {
      touch(true);
      const el = await makeEl({ open: true });
      const blur = trackBlur(el);
      type(el, VALID);
      expect(blur).not.toHaveBeenCalled();
    });

    it("the keyboard's Enter says done and does it", async () => {
      touch(true);
      const el = await makeEl({ required: true });
      expect(input(el).getAttribute('enterkeyhint')).toBe('done');
      const blur = trackBlur(el);
      input(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(blur).toHaveBeenCalledOnce();
    });

    it('marks a valid uid in the field itself', async () => {
      const el = await makeEl({ required: true, pid: '70NH-E97' });
      expect(el.shadowRoot.querySelector('.pid-ok')).toBeNull();
      el.pid = VALID;
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.pid-ok')).not.toBeNull();
      expect(input(el).classList.contains('pid--ok')).toBe(true);
    });
  });
});
