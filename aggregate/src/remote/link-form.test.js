// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './link-form.js';
import { generateUid } from '../../../shared/remote/uid.js';

const UID = generateUid(() => Uint8Array.from([1, 2, 3, 4, 5, 6, 7]));

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<link-form></link-form>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, ' ');

describe('reason modes', () => {
  it('defaults to request — the bare-page entry point, with no uid prefilled', async () => {
    const el = await makeEl();
    expect(el.reason).toBe('request');
    expect(text(el)).toContain('צפייה בסיכום מטופל');
    expect(el.shadowRoot.querySelector('input').value).toBe('');
    expect(el.shadowRoot.querySelector('button').textContent.trim()).toBe('שלחו לי קישור');
  });

  it('expired and error carry their own headings and a "new link" button', async () => {
    const expired = await makeEl({ reason: 'expired', uid: UID });
    expect(text(expired)).toContain('הקישור פג');
    expect(expired.shadowRoot.querySelector('button').textContent.trim()).toBe('שלחו לי קישור חדש');
    expect(expired.shadowRoot.querySelector('input').value).toBe(UID);   // prefilled from the dead link

    const error = await makeEl({ reason: 'error', uid: UID });
    expect(text(error)).toContain('לא הצלחנו');
  });

  it('an unknown reason falls back to request rather than rendering blank', async () => {
    const el = await makeEl({ reason: 'nonsense' });
    expect(text(el)).toContain('צפייה בסיכום מטופל');
  });
});

describe('submission', () => {
  it('emits the canonical uid and only when valid', async () => {
    const el = await makeEl();
    const handler = vi.fn();
    el.addEventListener('link-request', handler);
    const submit = () => el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    submit();
    expect(handler).not.toHaveBeenCalled();                       // empty
    expect(el.shadowRoot.querySelector('button').disabled).toBe(true);

    const input = el.shadowRoot.querySelector('input');
    input.value = 'TRC-2025';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    submit();
    expect(handler).not.toHaveBeenCalled();                       // invalid check symbol
    expect(text(el)).toMatch(/8 תווים|טעות הקלדה/);

    input.value = UID.toLowerCase().replace('-', '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    submit();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ uid: UID });  // canonicalised
  });

  it('does not emit while sending, and the sent state never discloses registration', async () => {
    const el = await makeEl({ uid: UID, state: 'sending' });
    const handler = vi.fn();
    el.addEventListener('link-request', handler);
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(handler).not.toHaveBeenCalled();

    el.state = 'sent';
    await el.updateComplete;
    expect(text(el)).toContain('אם המזהה רשום');                   // conditional by design
    expect(el.shadowRoot.querySelector('form')).toBeNull();
  });
});
