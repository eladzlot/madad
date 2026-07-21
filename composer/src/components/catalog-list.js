// <catalog-list> — the browse results for the active tab.
//
// Renders <catalog-card>s for the store's already-derived `entries`, plus the
// affordances around them: the curated-view "הצג הכל" escape hatch, cross-tab
// "נמצאו עוד N ב…" hints, and empty states. It owns no data — the store decides
// what is visible; this component only presents it and relays intent:
//   toggle       { id }    (bubbles up from a card)
//   show-all               reveal the full (non-curated) tab
//   tab-change   { tab }   follow a cross-tab hint
//   focus-search           ArrowUp off the first card
//
// Arrow keys move focus between cards; ArrowUp past the top returns to search.

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { tabLabel } from '../taxonomy.js';
import './catalog-card.js';

export class CatalogList extends LitElement {
  static properties = {
    entries:       { type: Array },
    selectedIds:   { type: Array },
    curated:       { type: Boolean },
    hasBeyond:     { type: Boolean },  // tab has non-featured entries to reveal
    crossTab:      { type: Array },    // [{ tab, count }]
    query:         { type: String },
    filtersActive: { type: Boolean },
  };

  constructor() {
    super();
    this.entries = [];
    this.selectedIds = [];
    this.curated = true;
    this.hasBeyond = false;
    this.crossTab = [];
    this.query = '';
    this.filtersActive = false;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: block; }

    .curated-note {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-sm, 8px);
      margin-block: var(--space-sm, 8px);
      font-size: var(--font-size-sm, 14px);
      color: var(--color-text-muted, #5E7080);
    }

    ul { list-style: none; display: flex; flex-direction: column; gap: var(--space-sm, 8px); }

    .empty {
      padding: var(--space-xl, 32px) var(--space-md, 16px);
      text-align: center;
      color: var(--color-text-muted, #5E7080);
    }
    .empty p { margin-block-end: var(--space-sm, 8px); }
    .help-hint { margin-block-start: var(--space-md, 16px); font-size: var(--font-size-sm, 14px); }
    .help-hint a { color: var(--color-primary, #1A9FAD); }

    .cross-tab {
      margin-block-start: var(--space-md, 16px);
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm, 8px);
      justify-content: center;
    }
    .link-btn {
      background: none;
      border: none;
      color: var(--color-primary, #1A9FAD);
      font-family: inherit;
      font-size: var(--font-size-sm, 14px);
      cursor: pointer;
      text-decoration: underline;
      padding: 4px;
    }
    .link-btn:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }
  `];

  // Public: focus the first card (ArrowDown out of the search box).
  focusFirst() { this._cards()[0]?.focus(); }

  _cards() { return [...this.renderRoot.querySelectorAll('catalog-card')]; }

  _onKeydown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cards = this._cards();
    const active = e.composedPath().find(el => el.tagName === 'CATALOG-CARD');
    const idx = cards.indexOf(active);
    if (idx === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') {
      cards[Math.min(idx + 1, cards.length - 1)]?.focus();
    } else if (idx === 0) {
      this.dispatchEvent(new CustomEvent('focus-search', { bubbles: true, composed: true }));
    } else {
      cards[idx - 1]?.focus();
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _crossTabHints() {
    if (!this.crossTab?.length) return nothing;
    return html`
      <div class="cross-tab">
        ${this.crossTab.map(({ tab, count }) => html`
          <button class="link-btn" type="button" @click=${() => this._emit('tab-change', { tab })}>
            נמצאו עוד ${count} ב${tabLabel(tab)}
          </button>
        `)}
      </div>
    `;
  }

  render() {
    if (!this.entries?.length) {
      const searching = !!this.query?.trim() || this.filtersActive;
      return html`
        <div class="empty">
          <p>${searching ? 'אין תוצאות לחיפוש זה.' : 'אין פריטים בקטגוריה זו.'}</p>
          ${searching ? this._crossTabHints() : nothing}
          <p class="help-hint">
            <a href="../help/">איך עובדים עם מדד?</a>
          </p>
        </div>
      `;
    }

    const selected = new Set(this.selectedIds ?? []);
    return html`
      ${this.curated && this.hasBeyond ? html`
        <div class="curated-note">
          <span>מוצגים שאלונים נפוצים</span>
          <button class="link-btn" type="button" @click=${() => this._emit('show-all', {})}>
            הצג הכל
          </button>
        </div>
      ` : nothing}

      <ul role="list" @keydown=${this._onKeydown}>
        ${this.entries.map(e => html`
          <li>
            <catalog-card .entry=${e} ?selected=${selected.has(e.id)}></catalog-card>
          </li>
        `)}
      </ul>

      ${this._crossTabHints()}
    `;
  }
}

customElements.define('catalog-list', CatalogList);
