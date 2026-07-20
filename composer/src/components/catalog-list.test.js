// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './catalog-list.js';

const entry = (id, o = {}) => ({
  id, kind: 'questionnaire', title: id, description: '', domains: ['depression'],
  type: 'severity', populations: ['adult'], estMinutes: 1, itemCount: 5, featured: false, ...o,
});

async function makeEl(props = {}) {
  const el = await fixture(html`<catalog-list></catalog-list>`);
  Object.assign(el, {
    entries: [entry('phq9'), entry('gad7')], selectedIds: [],
    curated: false, hasBeyond: false, crossTab: [], query: '', filtersActive: false, ...props,
  });
  await el.updateComplete;
  return el;
}

describe('catalog-list', () => {
  it('renders one card per entry', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelectorAll('catalog-card')).toHaveLength(2);
  });

  it('marks selected cards', async () => {
    const el = await makeEl({ selectedIds: ['gad7'] });
    const cards = [...el.shadowRoot.querySelectorAll('catalog-card')];
    expect(cards.find(c => c.entry.id === 'gad7').hasAttribute('selected')).toBe(true);
    expect(cards.find(c => c.entry.id === 'phq9').hasAttribute('selected')).toBe(false);
  });

  it('shows the curated note with a הצג הכל button only when curated and hasBeyond', async () => {
    const el = await makeEl({ curated: true, hasBeyond: true });
    const note = el.shadowRoot.querySelector('.curated-note');
    expect(note).not.toBeNull();
    let shown = false;
    el.addEventListener('show-all', () => { shown = true; });
    note.querySelector('.link-btn').click();
    expect(shown).toBe(true);
  });

  it('hides the curated note when nothing is hidden', async () => {
    const el = await makeEl({ curated: true, hasBeyond: false });
    expect(el.shadowRoot.querySelector('.curated-note')).toBeNull();
  });

  it('shows an empty state for a query with no results, plus cross-tab hints', async () => {
    const el = await makeEl({ entries: [], query: 'zzz', crossTab: [{ tab: 'batteries', count: 2 }] });
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('אין תוצאות');
    expect(txt).toContain('נמצאו עוד 2 בסוללות');
  });

  it('empty state without a query reads as an empty category', async () => {
    const el = await makeEl({ entries: [] });
    expect(el.shadowRoot.textContent).toContain('אין פריטים בקטגוריה');
  });

  it('cross-tab hint fires tab-change', async () => {
    const el = await makeEl({ entries: [], query: 'x', crossTab: [{ tab: 'worksheets', count: 1 }] });
    let detail = null;
    el.addEventListener('tab-change', (e) => { detail = e.detail; });
    el.shadowRoot.querySelector('.link-btn').click();
    expect(detail).toEqual({ tab: 'worksheets' });
  });

  it('ArrowDown moves focus to the next card; ArrowUp off the first asks for search', async () => {
    const el = await makeEl();
    const cards = [...el.shadowRoot.querySelectorAll('catalog-card')];
    cards[0].focus();
    let focusSearch = false;
    el.addEventListener('focus-search', () => { focusSearch = true; });

    const ul = el.shadowRoot.querySelector('ul');
    // ArrowDown from card 0 → card 1
    cards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
    // ArrowUp from card 0 → focus-search
    cards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
    expect(ul).not.toBeNull();
    expect(focusSearch).toBe(true);
  });

  it('focusFirst() focuses the first card', async () => {
    const el = await makeEl();
    el.focusFirst();
    const first = el.shadowRoot.querySelector('catalog-card');
    expect(first.shadowRoot.activeElement).toBe(first.shadowRoot.querySelector('button'));
  });
});
