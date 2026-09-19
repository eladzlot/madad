// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './selection-cart.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<selection-cart></selection-cart>`);
  Object.assign(el, {
    entries: [{ id: 'phq9', title: 'דיכאון' }, { id: 'gad7', title: 'חרדה' }],
    url: 'http://x/?items=phq9,gad7',
    pid: '', patientLang: 'he', langs: ['he', 'en'], dropped: [], pidWarning: '',
    // This branch is the trial: the uid is mandatory, so the field is never
    // hidden behind a chip (REMOTE_SPEC §3).
    requirePid: true, recentUids: [],
    copied: false, canShare: false, ...props,
  });
  await el.updateComplete;
  return el;
}

const items = (el) => [...el.shadowRoot.querySelectorAll('li.item')];

describe('selection-cart', () => {
  it('renders the picked entries in order with 1-based badges', async () => {
    const el = await makeEl();
    expect(items(el)).toHaveLength(2);
    expect(items(el)[0].querySelector('.order-num').textContent).toBe('1');
    expect(items(el)[0].querySelector('.item-title').textContent).toContain('דיכאון');
    expect(items(el)[1].querySelector('.order-num').textContent).toBe('2');
  });

  it('lays out the output, then settings, then the list — in that order', async () => {
    // Actions lead: the rail's payoff is the link. The chips follow because
    // they are attributes of it. The list is last and is the only thing that
    // scrolls, so nothing above it can ever be displaced.
    const el = await makeEl();
    const [output, settings, picked] = ['.output', '.settings', '.picked']
      .map(sel => el.shadowRoot.querySelector(sel));
    for (const region of [output, settings, picked]) expect(region).not.toBeNull();
    expect(output.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(picked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The output and the chips share one fixed head; only the list scrolls.
    expect(el.shadowRoot.querySelector('.head').contains(output)).toBe(true);
    expect(el.shadowRoot.querySelector('.head').contains(settings)).toBe(true);
    expect(el.shadowRoot.querySelector('.head').contains(picked)).toBe(false);
    expect(el.shadowRoot.querySelector('.foot')).toBeNull();
  });

  it('shows the link and enables copy / QR / open', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.url-line').textContent).toContain('items=phq9,gad7');
    for (const cls of ['.copy-btn', '.qr-btn', '.open-btn']) {
      expect(el.shadowRoot.querySelector(cls).disabled).toBe(false);
    }
  });

  it('renders the copy icon as real SVG shapes', async () => {
    // A nested html`` template inside <svg> builds its children in the HTML
    // namespace: <RECT>/<PATH> with no geometry, painting nothing. lit's svg``
    // tag is required there. This icon had never rendered in either mode.
    const el = await makeEl();
    const shape = el.shadowRoot.querySelector('.copy-btn svg *');
    expect(shape).not.toBeNull();
    expect(shape.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(el.shadowRoot.querySelectorAll('.copy-btn svg *').length).toBe(2);
  });

  it('puts COPY on the bright button by default', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.copy-btn').classList.contains('c-btn--go')).toBe(true);
    expect(el.shadowRoot.querySelector('.qr-btn').classList.contains('c-btn--rail')).toBe(true);
  });

  it('shareMode="qr" swaps them — the QR is the handover, copy is the fallback', async () => {
    // On the trial the therapist and the patient are in the same room, so the
    // link is passed by holding up a code to scan (REMOTE_SPEC §8.3).
    const el = await makeEl({ shareMode: 'qr' });
    const qr = el.shadowRoot.querySelector('.qr-btn');
    const copy = el.shadowRoot.querySelector('.copy-btn');
    expect(qr.classList.contains('c-btn--go')).toBe(true);
    expect(qr.textContent).toContain('QR');
    expect(copy.classList.contains('c-btn--rail')).toBe(true);
    // Demoted to an icon, so its name has to live on the accessible label.
    expect(copy.getAttribute('aria-label')).toBeTruthy();
    expect(el.shadowRoot.querySelectorAll('.c-btn--go')).toHaveLength(1);
  });

  it('holds the head\'s footprint with no link — disabled, not absent', async () => {
    // The rail used to grow ~112px on the first pick because the QR row only
    // rendered once a URL existed. Nothing here appears or disappears.
    const el = await makeEl({ url: null, entries: [] });
    expect(el.shadowRoot.querySelector('.url-line')).not.toBeNull();
    expect(el.shadowRoot.querySelector('.url-line').textContent).toContain('לא נבחרו');
    for (const cls of ['.copy-btn', '.qr-btn', '.open-btn']) {
      expect(el.shadowRoot.querySelector(cls).disabled).toBe(true);
    }
  });

  it('emits copy and open, and renders no reset (that lives in the toolbar)', async () => {
    const el = await makeEl();
    const seen = [];
    el.addEventListener('copy', () => seen.push('copy'));
    el.addEventListener('open', () => seen.push('open'));
    el.shadowRoot.querySelector('.copy-btn').click();
    el.shadowRoot.querySelector('.open-btn').click();
    expect(seen).toEqual(['copy', 'open']);
    expect(el.shadowRoot.textContent).not.toContain('איפוס');
  });

  it('shows share only when the platform has it', async () => {
    expect((await makeEl()).shadowRoot.querySelector('.share-btn')).toBeNull();
    const el = await makeEl({ canShare: true });
    let shared = false;
    el.addEventListener('share', () => { shared = true; });
    el.shadowRoot.querySelector('.share-btn').click();
    expect(shared).toBe(true);
  });

  it('shows the uid warning under the field and marks the input invalid', async () => {
    // The field moved into <session-settings>; the cart threads the state down.
    const el = await makeEl({ pid: 'TRC-1', pidWarning: 'המזהה צריך להיות בן 8 תווים' });
    const settings = el.shadowRoot.querySelector('session-settings');
    await settings.updateComplete;
    const input = settings.shadowRoot.querySelector('input.pid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const msg = settings.shadowRoot.querySelector('.pid-warning');
    expect(msg.textContent).toContain('8 תווים');
    expect(input.getAttribute('aria-describedby')).toBe(msg.id);
    el.pidWarning = '';
    await el.updateComplete;
    await settings.updateComplete;
    expect(settings.shadowRoot.querySelector('input.pid').getAttribute('aria-invalid')).toBe('false');
    expect(settings.shadowRoot.querySelector('.pid-warning').textContent.trim()).toBe('');
  });

  it('shows the copied state on the copy button', async () => {
    const el = await makeEl({ copied: true });
    expect(el.shadowRoot.querySelector('.copy-btn').textContent).toContain('הועתק');
  });

  it('carries a tileless qr-code the QR button expands', async () => {
    const el = await makeEl();
    const qr = el.shadowRoot.querySelector('qr-code');
    expect(qr.tileless).toBe(true);
    expect(qr.url).toBe('http://x/?items=phq9,gad7');
    let expanded = false;
    qr.expand = () => { expanded = true; };
    el.shadowRoot.querySelector('.qr-btn').click();
    expect(expanded).toBe(true);
  });

  it('compact mode drops hover-only behaviour for the sheet', async () => {
    // A phone has no hover, and the sheet has the room.
    const plain = await makeEl();
    expect(items(plain)[0].getAttribute('draggable')).toBe('true');
    const compact = await makeEl({ compact: true });
    expect(compact.hasAttribute('compact')).toBe(true);
    expect(items(compact)[0].getAttribute('draggable')).toBe('false');
  });

  it('shows the empty state with a help link when nothing is picked', async () => {
    const el = await makeEl({ entries: [] });
    expect(el.shadowRoot.textContent).toContain('בחרו שאלונים');
    expect(el.shadowRoot.querySelector('.help-link').getAttribute('href')).toBe('../help/');
    expect(items(el)).toHaveLength(0);
  });

  it('disables ↑ on the first row and ↓ on the last, and emits reorder', async () => {
    const el = await makeEl();
    expect(items(el)[0].querySelector('[aria-label="הזז מעלה"]').disabled).toBe(true);
    expect(items(el)[1].querySelector('[aria-label="הזז מטה"]').disabled).toBe(true);

    let detail = null;
    el.addEventListener('reorder', (e) => { detail = e.detail; });
    items(el)[0].querySelector('[aria-label="הזז מטה"]').click();
    expect(detail).toEqual({ from: 0, to: 1 });
  });

  it('keeps the rare reorder buttons focusable rather than removing them', async () => {
    // They fade in on hover/focus-within (opacity), so the keyboard path and
    // the axe audit still see them. display:none would break both.
    const el = await makeEl();
    const up = items(el)[1].querySelector('[aria-label="הזז מעלה"]');
    expect(up.classList.contains('icon-btn--rare')).toBe(true);
    expect(up.hasAttribute('hidden')).toBe(false);
    expect(up.disabled).toBe(false);
  });

  it('emits remove with the entry id', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('remove', (e) => { detail = e.detail; });
    items(el)[1].querySelector('[aria-label="הסר"]').click();
    expect(detail).toEqual({ id: 'gad7' });
  });

  it('threads settings state down to <session-settings>', async () => {
    const el = await makeEl({ pid: 'TRC-1', patientLang: 'en', dropped: ['pcl5'] });
    const s = el.shadowRoot.querySelector('session-settings');
    expect(s.pid).toBe('TRC-1');
    expect(s.patientLang).toBe('en');
    expect(s.dropped).toEqual(['pcl5']);
  });
});
