// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './catalog-controls.js';

async function makeEl(props = {}) {
  const el = await fixture(html`<catalog-controls></catalog-controls>`);
  Object.assign(el, {
    tabs: ['all', 'questionnaires', 'batteries'], activeTab: 'all',
    query: '', domains: ['depression', 'anxiety'], populations: ['adult'],
    filters: { domain: null, population: null }, ...props,
  });
  await el.updateComplete;
  return el;
}

// The chip rows collapse behind the סינון toggle — open them for chip assertions.
async function openFilters(el) {
  el._filtersOpen = true;
  await el.updateComplete;
}

describe('catalog-controls', () => {
  it('hides the category switch and chips until the caret is opened', async () => {
    const el = await makeEl();
    // Collapsed: no tabs, no chips — just search + caret + reset.
    expect(el.shadowRoot.querySelector('[role="tablist"]')).toBeNull();
    expect(el.shadowRoot.querySelector('.chip')).toBeNull();
    const caret = el.shadowRoot.querySelector('.filter-caret');
    expect(caret.getAttribute('aria-expanded')).toBe('false');
    caret.click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="tablist"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('.chip')).not.toBeNull();
  });

  it('renders segmented tabs with Hebrew labels when opened; active one pressed', async () => {
    const el = await makeEl();
    await openFilters(el);
    const tabs = [...el.shadowRoot.querySelectorAll('[role="tab"]')];
    expect(tabs.map(t => t.textContent.trim())).toEqual(['הכל', 'שאלונים', 'סוללות']);
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true'); // 'all' active
  });

  it('hides the segmented control when only one tab is available', async () => {
    const el = await makeEl({ tabs: ['all'] });
    await openFilters(el);
    expect(el.shadowRoot.querySelector('[role="tablist"]')).toBeNull();
  });

  it('the count badge reflects a non-default tab plus active chip filters', async () => {
    const el = await makeEl({ activeTab: 'batteries', filters: { domain: 'anxiety', population: null } });
    expect(el.shadowRoot.querySelector('.filter-caret .filter-count').textContent.trim()).toBe('2');
  });

  it('hides the caret only when there is nothing to reveal (one tab, no chips)', async () => {
    const withTabs = await makeEl({ domains: [], populations: ['adult'] });
    expect(withTabs.shadowRoot.querySelector('.filter-caret')).not.toBeNull(); // tabs still revealable
    const nothing = await makeEl({ tabs: ['all'], domains: [], populations: ['adult'] });
    expect(nothing.shadowRoot.querySelector('.filter-caret')).toBeNull();
  });

  it('the toolbar reset button emits reset', async () => {
    const el = await makeEl();
    let fired = false;
    el.addEventListener('reset', () => { fired = true; });
    el.shadowRoot.querySelector('.reset-btn').click();
    expect(fired).toBe(true);
  });

  it('renders domain chips but hides population chips when only one population', async () => {
    const el = await makeEl();
    await openFilters(el);
    const chips = [...el.shadowRoot.querySelectorAll('.chip')];
    expect(chips.map(c => c.textContent.trim())).toEqual(['דיכאון', 'חרדה']);
  });

  it('shows population chips when more than one population', async () => {
    const el = await makeEl({ populations: ['adult', 'child'] });
    await openFilters(el);
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('מבוגרים');
    expect(txt).toContain('ילדים');
  });

  it('emits query-change on input', async () => {
    const el = await makeEl();
    let detail = null;
    el.addEventListener('query-change', (e) => { detail = e.detail; });
    const input = el.shadowRoot.querySelector('input[type="search"]');
    input.value = 'דכ';
    input.dispatchEvent(new Event('input'));
    expect(detail).toEqual({ query: 'דכ' });
  });

  it('Escape clears the query; ArrowDown asks to focus the list', async () => {
    const el = await makeEl({ query: 'x' });
    const events = [];
    el.addEventListener('query-change', (e) => events.push(['q', e.detail.query]));
    el.addEventListener('focus-list', () => events.push(['focus-list']));
    const input = el.shadowRoot.querySelector('input[type="search"]');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(events).toEqual([['q', ''], ['focus-list']]);
  });

  it('emits tab-change and filter-toggle', async () => {
    const el = await makeEl();
    await openFilters(el); // the switch and chips are revealed by the caret
    let tab = null, filter = null;
    el.addEventListener('tab-change', (e) => { tab = e.detail; });
    el.addEventListener('filter-toggle', (e) => { filter = e.detail; });
    el.shadowRoot.querySelectorAll('[role="tab"]')[2].click(); // סוללות
    el.shadowRoot.querySelector('.chip').click();
    expect(tab).toEqual({ tab: 'batteries' });
    expect(filter).toEqual({ kind: 'domain', value: 'depression' });
  });

  it('marks an active filter chip as pressed', async () => {
    const el = await makeEl({ filters: { domain: 'anxiety', population: null } });
    await openFilters(el);
    const pressed = [...el.shadowRoot.querySelectorAll('.chip')].filter(c => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent.trim()).toBe('חרדה');
  });
});
