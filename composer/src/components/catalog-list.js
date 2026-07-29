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
    pinnedIds:     { type: Array },    // ids in the clinician's recommended set
    curated:       { type: Boolean },
    hasBeyond:     { type: Boolean },  // tab has non-pinned entries to reveal
    customized:    { type: Boolean },  // profile diverges from author defaults
    crossTab:      { type: Array },    // [{ tab, count }]
    query:         { type: String },
    filtersActive: { type: Boolean },
    _confirmRestore: { state: true },  // two-step guard on "restore defaults"
  };

  constructor() {
    super();
    this.entries = [];
    this.selectedIds = [];
    this.pinnedIds = [];
    this.curated = true;
    this.hasBeyond = false;
    this.customized = false;
    this.crossTab = [];
    this.query = '';
    this.filtersActive = false;
    this._confirmRestore = false;
  }

  // Restoring defaults discards every pin the clinician added or removed, so it
  // asks first. If the profile stops being customized (e.g. they re-pinned back
  // to parity elsewhere), drop any pending confirmation rather than leaving a
  // stale prompt around.
  willUpdate(changed) {
    if (changed.has('customized') && !this.customized) this._confirmRestore = false;
  }

  _askRestore() { this._confirmRestore = true; }
  _cancelRestore() { this._confirmRestore = false; }
  _confirmRestoreNow() {
    this._confirmRestore = false;
    this._emit('restore-defaults', {});
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
    .note-actions { display: flex; gap: var(--space-md, 16px); flex-shrink: 0; }
    .confirm-prompt { color: var(--color-text, #162232); }
    .link-btn.danger { color: var(--color-no, #8B3A3A); font-weight: var(--font-weight-medium, 500); }

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
    const pinned = new Set(this.pinnedIds ?? []);
    const showNote = this.curated && (this.hasBeyond || this.customized);
    return html`
      ${showNote ? html`
        <div class="curated-note">
          ${this._confirmRestore ? html`
            <span class="confirm-prompt">לבטל את ההתאמות ולשחזר את רשימת המומלצים?</span>
            <span class="note-actions">
              <button class="link-btn danger restore-confirm" type="button" @click=${this._confirmRestoreNow}>
                שחזר
              </button>
              <button class="link-btn restore-cancel" type="button" @click=${this._cancelRestore}>
                ביטול
              </button>
            </span>
          ` : html`
            <span>השאלונים המומלצים שלך</span>
            <span class="note-actions">
              ${this.hasBeyond ? html`
                <button class="link-btn" type="button" @click=${() => this._emit('show-all', {})}>
                  הצג הכל
                </button>
              ` : nothing}
              ${this.customized ? html`
                <button class="link-btn restore-trigger" type="button" @click=${this._askRestore}>
                  שחזר מומלצים
                </button>
              ` : nothing}
            </span>
          `}
        </div>
      ` : nothing}

      <ul role="list" @keydown=${this._onKeydown}>
        ${this.entries.map(e => html`
          <li>
            <catalog-card
              .entry=${e}
              ?selected=${selected.has(e.id)}
              ?pinned=${pinned.has(e.id)}
            ></catalog-card>
          </li>
        `)}
      </ul>

      ${this._crossTabHints()}
    `;
  }
}

customElements.define('catalog-list', CatalogList);
