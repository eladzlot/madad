// <catalog-controls> — the browse toolbar: search box, segmented tabs, chips.
//
// Dumb/controlled: every piece of state (query, active tab, available tabs and
// chip values, active filters) arrives as a property; every interaction leaves
// as an event the store owns:
//   query-change  { query }      search input / Escape-to-clear
//   tab-change    { tab }        segmented control
//   filter-toggle { kind, value } domain / population chip
//   focus-list                   ArrowDown out of the search box
// Filtering scopes to the active tab (the store derives the chip options).

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { tabLabel, domainLabel, populationLabel, ALL_TAB } from '../taxonomy.js';

export class CatalogControls extends LitElement {
  static properties = {
    tabs:        { type: Array },   // available tab ids
    activeTab:   { type: String },
    query:       { type: String },
    domains:     { type: Array },   // available domain values in the active tab
    populations: { type: Array },   // available population values in the active tab
    filters:     { type: Object },  // { domain, population }
    _filtersOpen: { type: Boolean, state: true }, // chips collapsed behind a toggle
  };

  constructor() {
    super();
    this.tabs = [];
    this.query = '';
    this.domains = [];
    this.populations = [];
    this.filters = { domain: null, population: null };
    this._filtersOpen = false;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host {
      display: block;
      position: sticky;
      inset-block-start: 0;
      z-index: 10;
      background: var(--color-surface, #fff);
      padding-block: var(--space-sm, 8px);
    }

    .search-row { display: flex; gap: var(--space-sm, 8px); align-items: center; }

    /* Reset — the toolbar clear button (↺), back beside the search as before. */
    .reset-btn {
      flex-shrink: 0;
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: none;
      color: var(--color-text-muted, #5E7080);
      font-family: inherit;
      font-size: var(--font-size-sm, 14px);
      cursor: pointer;
      border-radius: var(--radius-sm, 6px);
      transition: color var(--transition-fast, 120ms ease);
    }
    .reset-btn:hover { color: var(--color-no, #8B3A3A); }
    .reset-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 2px; }
    /* ↺ is coloured by default (deep terracotta), matching the legacy toolbar. */
    .reset-icon { color: #B03A10; font-size: 16px; }
    @media (prefers-color-scheme: dark) { .reset-icon { color: #E07060; } }

    /* Filter caret — a chevron beside the tabs that expands the chip rows, so it
       reads as "filter these categories" rather than a stray button. */
    .tabs { display: flex; align-items: center; gap: var(--space-sm, 8px); flex-wrap: wrap; }
    .filter-caret {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-block-size: 36px;
      padding-inline: var(--space-md, 16px);
      /* Bordered pill so it reads as a distinct filter control — differentiates
         it from the borderless איפוס reset link and groups it with the tabs. */
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-pill, 999px);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text-muted, #5E7080);
      font-family: inherit;
      font-size: var(--font-size-sm, 14px);
      cursor: pointer;
      transition: all var(--transition-fast, 120ms ease);
    }
    .filter-caret:hover { color: var(--color-primary, #1A9FAD); }
    .filter-caret[aria-expanded='true'],
    .filter-caret.has-active {
      color: var(--color-accent, #2BB3C0);
      border-color: var(--color-selected-border, #2BB3C0);
      background: var(--color-selected-bg, #E4F6F8);
    }
    .filter-caret:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 2px; }
    .caret { transition: transform var(--transition-fast, 120ms ease); font-size: 11px; }
    .caret.open { transform: rotate(180deg); }
    .filter-count {
      min-inline-size: 18px;
      padding-inline: 5px;
      border-radius: var(--radius-pill, 999px);
      background: var(--color-primary, #1A9FAD);
      color: var(--color-primary-text, #fff);
      font-size: var(--font-size-xs, 12px);
      text-align: center;
    }

    input[type='search'] {
      flex: 1;
      min-inline-size: 0;
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text, #162232);
      font-family: inherit;
      font-size: var(--font-size-md, 16px);
      transition: border-color var(--transition-fast, 120ms ease);
    }
    input[type='search']:focus {
      outline: none;
      border-color: var(--color-border-focus, #2BB3C0);
    }
    /* Dark mode: the input background (clin-card-bg) equals the .main surface, so
       the search bar disappeared. Lift it and strengthen the border so it reads
       as a distinct control. */
    @media (prefers-color-scheme: dark) {
      input[type='search'] {
        background: #1e2733;
        border-color: #3a4656;
      }
    }

    .tabs { margin-block-start: var(--space-sm, 8px); }
    .c-seg { max-inline-size: 100%; flex-wrap: wrap; }

    /* Each taxonomy dimension (domain, population) gets its own row so the
       longer domain list never pushes the population chips onto its tail. */
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-block-start: var(--space-sm, 8px);
    }
    .chip {
      font-size: var(--font-size-sm, 14px);
      padding: 4px 12px;
      border-radius: var(--radius-pill, 999px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text-muted, #5E7080);
      font-family: inherit;
      cursor: pointer;
      transition: all var(--transition-fast, 120ms ease);
    }
    .chip:hover { border-color: var(--color-primary, #1A9FAD); }
    .chip[aria-pressed='true'] {
      background: var(--color-selected-bg, #E4F6F8);
      border-color: var(--color-selected-border, #2BB3C0);
      color: var(--color-accent, #2BB3C0);
    }
    .chip:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }
    .chip-group-label {
      align-self: center;
      font-size: var(--font-size-xs, 12px);
      color: var(--color-text-muted, #5E7080);
    }
  `];

  // Public: return focus to the search box (ArrowUp off the first card).
  focusSearch() { this.renderRoot?.querySelector('input[type="search"]')?.focus(); }

  _onInput(e) { this._emit('query-change', { query: e.target.value }); }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._emit('query-change', { query: '' });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._emit('focus-list', {});
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _toggleFilters() { this._filtersOpen = !this._filtersOpen; }

  get _activeFilterCount() {
    // A non-default tab counts as an active refinement too, since the switch is
    // hidden behind the caret — this keeps the badge honest when it's collapsed.
    return (this.activeTab && this.activeTab !== ALL_TAB ? 1 : 0)
      + (this.filters?.domain ? 1 : 0)
      + (this.filters?.population ? 1 : 0);
  }

  get _hasChips() {
    return (this.domains?.length ?? 0) > 0 || (this.populations?.length ?? 0) > 1;
  }

  // The caret reveals the category switch and the chips — show it when either
  // exists to reveal.
  get _hasFilters() {
    return (this.tabs?.length ?? 0) > 1 || this._hasChips;
  }

  _chip(kind, value, label) {
    const active = this.filters?.[kind] === value;
    return html`
      <button
        class="chip"
        type="button"
        aria-pressed=${active ? 'true' : 'false'}
        @click=${() => this._emit('filter-toggle', { kind, value })}
      >${label}</button>
    `;
  }

  render() {
    const showTabs = (this.tabs?.length ?? 0) > 1;
    const activeCount = this._activeFilterCount;

    return html`
      <div class="search-row">
        <input
          type="search"
          .value=${this.query ?? ''}
          placeholder="חיפוש שאלונים, דפי עבודה…"
          aria-label="חיפוש בקטלוג"
          autocomplete="off"
          spellcheck="false"
          @input=${this._onInput}
          @keydown=${this._onKeydown}
        />
        ${this._hasFilters ? html`
          <button
            class="filter-caret ${activeCount ? 'has-active' : ''}"
            type="button"
            aria-expanded=${this._filtersOpen ? 'true' : 'false'}
            @click=${this._toggleFilters}
          >
            סינון
            ${activeCount ? html`<span class="filter-count">${activeCount}</span>` : nothing}
            <span class="caret ${this._filtersOpen ? 'open' : ''}" aria-hidden="true">▾</span>
          </button>
        ` : nothing}
        <button class="reset-btn" type="button" @click=${() => this._emit('reset', {})}>
          <span class="reset-icon" aria-hidden="true">↺</span> איפוס
        </button>
      </div>

      ${this._filtersOpen && showTabs ? html`
        <div class="tabs">
          <div class="c-seg" role="tablist" aria-label="קטגוריות">
            ${this.tabs.map(t => html`
              <button
                role="tab"
                type="button"
                aria-pressed=${t === this.activeTab ? 'true' : 'false'}
                @click=${() => this._emit('tab-change', { tab: t })}
              >${tabLabel(t)}</button>
            `)}
          </div>
        </div>
      ` : nothing}

      ${this._filtersOpen && this.domains?.length ? html`
        <div class="chip-row">
          <span class="chip-group-label">תחום:</span>
          ${this.domains.map(d => this._chip('domain', d, domainLabel(d)))}
        </div>
      ` : nothing}

      ${this._filtersOpen && this.populations?.length > 1 ? html`
        <div class="chip-row">
          <span class="chip-group-label">אוכלוסייה:</span>
          ${this.populations.map(p => this._chip('population', p, populationLabel(p)))}
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('catalog-controls', CatalogControls);
