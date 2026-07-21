// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './catalog-card.js';

const entry = (o = {}) => ({
  id: 'phq9', kind: 'questionnaire', title: 'שאלון דיכאון', description: 'תיאור קצר',
  domains: ['depression'], type: 'severity', populations: ['adult'],
  estMinutes: 2, itemCount: 9, featured: true, ...o,
});

async function makeEl(props = {}) {
  const el = await fixture(html`<catalog-card></catalog-card>`);
  Object.assign(el, { entry: entry(), ...props });
  await el.updateComplete;
  return el;
}

describe('catalog-card', () => {
  it('renders title and id; description is not shown on the card (lives in preview)', async () => {
    const el = await makeEl();
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('שאלון דיכאון');
    expect(txt).toContain('phq9');
    expect(txt).not.toContain('תיאור קצר');
  });

  it('shows a battery badge for battery kind', async () => {
    const el = await makeEl({ entry: entry({ kind: 'battery' }) });
    expect(el.shadowRoot.textContent).toContain('סוללה');
  });

  it('shows a worksheet badge when type is worksheet', async () => {
    const el = await makeEl({ entry: entry({ kind: 'questionnaire', type: 'worksheet' }) });
    expect(el.shadowRoot.textContent).toContain('דף עבודה');
  });

  it('a plain questionnaire carries no pill and no meta badges (clean theming)', async () => {
    const el = await makeEl({ entry: entry({ title: 'שאלון בדיקה', domains: ['depression'] }) });
    expect(el.shadowRoot.querySelector('.kind')).toBeNull();
    const txt = el.shadowRoot.textContent;
    expect(txt).not.toContain('דיכאון');   // domain not shown on card
    expect(txt).not.toContain('דק׳');      // time not shown on card
    expect(txt).not.toContain('פריטים');   // count not shown on card
  });

  it('reflects selected via aria-checked and the host attribute', async () => {
    const el = await makeEl({ selected: true });
    expect(el.hasAttribute('selected')).toBe(true);
    expect(el.shadowRoot.querySelector('button').getAttribute('aria-checked')).toBe('true');
  });

  it('fires item-toggle { id } on click', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('item-toggle', (e) => { detail = e.detail; });
    el.shadowRoot.querySelector('button').click();
    expect(detail).toEqual({ id: 'phq9' });
  });

  it('focus() focuses the card button (not the preview button)', async () => {
    const el = await makeEl();
    el.focus();
    expect(el.shadowRoot.activeElement).toBe(el.shadowRoot.querySelector('button.card'));
  });

  it('fires preview { id } from the ⓘ button without toggling selection', async () => {
    const el = await makeEl();
    let previewed = null, toggled = false;
    el.addEventListener('preview', (e) => { previewed = e.detail; });
    el.addEventListener('item-toggle', () => { toggled = true; });
    el.shadowRoot.querySelector('.preview-btn').click();
    expect(previewed).toEqual({ id: 'phq9' });
    expect(toggled).toBe(false);
  });
});
