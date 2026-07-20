// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import { createStore } from '../composer-store.js';
import { CATALOG_VERSION } from '../../../shared/catalog/build-catalog.js';
import './composer-app.js';

function entry(id, o = {}) {
  return {
    id, kind: o.kind ?? 'questionnaire', title: o.title ?? id, description: '',
    keywords: [], itemCount: 5, estMinutes: 1, hasConditional: false,
    domains: o.domains ?? ['depression'], type: o.type ?? 'severity',
    populations: ['adult'], tags: [], featured: o.featured ?? true, ...(o.dev ? { dev: true } : {}),
  };
}

async function mount(entries) {
  const store = createStore();
  store.ingestCatalog({ catalogVersion: CATALOG_VERSION, entries },
    { catalogVersion: CATALOG_VERSION, isDev: true });
  const el = await fixture(html`<composer-app .store=${store}></composer-app>`);
  await el.updateComplete;
  return { el, store };
}

const listEl = (el) => el.shadowRoot.querySelector('catalog-list');
const cards = (el) => [...listEl(el).shadowRoot.querySelectorAll('catalog-card')];
const cart = (el) => el.shadowRoot.querySelector('selection-cart');

describe('composer-app', () => {
  beforeEach(() => {
    // happy-dom exposes navigator.clipboard as a getter-only accessor — spy on
    // its method rather than reassigning the property.
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  });

  it('renders the nav, controls, list, and cart', async () => {
    const { el } = await mount([entry('phq9')]);
    expect(el.shadowRoot.querySelector('clinician-nav')).not.toBeNull();
    expect(el.shadowRoot.querySelector('catalog-controls')).not.toBeNull();
    expect(el.shadowRoot.querySelector('catalog-list')).not.toBeNull();
    expect(cart(el)).not.toBeNull();
  });

  it('toggling a card updates the store and the cart URL', async () => {
    const { el, store } = await mount([entry('phq9')]);
    cards(el)[0].shadowRoot.querySelector('button').click();
    await el.updateComplete;
    expect(store.selected).toEqual(['phq9']);
    expect(cart(el).url).toContain('items=phq9');
  });

  it('reorder event from the cart reorders the store selection', async () => {
    const { el, store } = await mount([entry('a', { title: 'A' }), entry('b', { title: 'B' })]);
    store.toggle('a'); store.toggle('b');
    await el.updateComplete;
    cart(el).dispatchEvent(new CustomEvent('reorder', { detail: { from: 0, to: 1 }, bubbles: true, composed: true }));
    expect(store.selected).toEqual(['b', 'a']);
  });

  it('a pid warning surfaces in the warnings banner', async () => {
    const { el, store } = await mount([entry('phq9')]);
    store.setPid('bad id');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.warnings')).not.toBeNull();
  });

  it('copy writes the URL to the clipboard and flips the copied flag', async () => {
    const { el, store } = await mount([entry('phq9')]);
    store.toggle('phq9');
    await el.updateComplete;
    cart(el).dispatchEvent(new CustomEvent('copy', { bubbles: true, composed: true }));
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(store.url());
    expect(store.copied).toBe(true);
  });

  it('reset clears the selection', async () => {
    const { el, store } = await mount([entry('phq9')]);
    store.toggle('phq9');
    await el.updateComplete;
    cart(el).dispatchEvent(new CustomEvent('reset', { bubbles: true, composed: true }));
    expect(store.selected).toEqual([]);
  });

  it('open dispatches window.open with the generated URL', async () => {
    const { el, store } = await mount([entry('phq9')]);
    store.toggle('phq9');
    await el.updateComplete;
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    cart(el).dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
    expect(spy).toHaveBeenCalledWith(store.url(), '_blank', 'noopener');
  });

  it('query-change and filter-toggle flow through to the store', async () => {
    const { el, store } = await mount([entry('phq9', { domains: ['depression'] })]);
    const controls = el.shadowRoot.querySelector('catalog-controls');
    controls.dispatchEvent(new CustomEvent('query-change', { detail: { query: 'ph' }, bubbles: true, composed: true }));
    expect(store.query).toBe('ph');
    controls.dispatchEvent(new CustomEvent('filter-toggle', { detail: { kind: 'domain', value: 'depression' }, bubbles: true, composed: true }));
    expect(store.filters.domain).toBe('depression');
  });

  it('show-all reveals non-featured entries', async () => {
    const { el, store } = await mount([entry('phq9', { featured: true }), entry('bdi', { featured: false })]);
    expect(cards(el).map(c => c.entry.id)).toEqual(['phq9']); // curated
    listEl(el).dispatchEvent(new CustomEvent('show-all', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(store.isCurated()).toBe(false);
    expect(cards(el).map(c => c.entry.id).sort()).toEqual(['bdi', 'phq9']);
  });

  it('focus-list moves focus into the card list; focus-search returns it', async () => {
    const { el } = await mount([entry('phq9')]);
    const controls = el.shadowRoot.querySelector('catalog-controls');
    controls.dispatchEvent(new CustomEvent('focus-list', { bubbles: true, composed: true }));
    const first = cards(el)[0];
    expect(first.shadowRoot.activeElement).toBe(first.shadowRoot.querySelector('button'));
    // focus-search returns to the input without throwing.
    listEl(el).dispatchEvent(new CustomEvent('focus-search', { bubbles: true, composed: true }));
    expect(controls.shadowRoot.activeElement).toBe(controls.shadowRoot.querySelector('input[type="search"]'));
  });

  it('switching tabs re-derives the visible list', async () => {
    const { el, store } = await mount([entry('phq9'), entry('bat', { kind: 'battery', title: 'סוללה' })]);
    el.shadowRoot.querySelector('catalog-controls')
      .dispatchEvent(new CustomEvent('tab-change', { detail: { tab: 'batteries' }, bubbles: true, composed: true }));
    await el.updateComplete;
    expect(store.tab).toBe('batteries');
    expect(cards(el).map(c => c.entry.id)).toEqual(['bat']);
  });
});
