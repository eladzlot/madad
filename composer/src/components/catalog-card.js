// <catalog-card> — one catalog entry in the browse list.
//
// Dumb and stateless: it receives an `entry` (a catalog record) and whether it
// is `selected`, renders the title, meta badges, and a truncated description,
// and fires `toggle` { id } when the clinician picks or unpicks it. The whole
// card is one <button role=checkbox> so a keyboard user tabs to it, Space/Enter
// toggles, and screen readers announce the checked state.
//
// A public focus() lets the parent list drive arrow-key navigation across cards
// without reaching through the shadow boundary.

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';

export class CatalogCard extends LitElement {
  static properties = {
    entry:    { type: Object },
    selected: { type: Boolean, reflect: true },
  };

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: block; }

    button.card {
      inline-size: 100%;
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm, 8px);
      text-align: start;
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text, #162232);
      font-family: inherit;
      cursor: pointer;
      transition: border-color var(--transition-fast, 120ms ease),
                  background var(--transition-fast, 120ms ease);
    }

    button.card:hover { border-color: var(--color-primary, #1A9FAD); }

    button.card:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }

    :host([selected]) button.card {
      border-color: var(--color-selected-border, #2BB3C0);
      background: var(--color-selected-bg, #E4F6F8);
    }

    /* Check mark box on the leading edge */
    .check {
      flex-shrink: 0;
      inline-size: 22px;
      block-size: 22px;
      margin-block-start: 2px;
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      display: grid;
      place-items: center;
      font-size: 14px;
      line-height: 1;
      color: transparent;
    }
    :host([selected]) .check {
      background: var(--color-primary, #1A9FAD);
      border-color: var(--color-primary, #1A9FAD);
      color: var(--color-primary-text, #fff);
    }

    .body { min-inline-size: 0; flex: 1; }

    .name-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm, 8px);
      flex-wrap: wrap;
    }
    .name { font-weight: var(--font-weight-medium, 500); }
    .id {
      font-size: var(--font-size-xs, 12px);
      color: var(--color-text-muted, #5E7080);
      font-family: ui-monospace, monospace;
      direction: ltr;
    }

    /* Kind pill (battery / worksheet) — outlined teal, pinned to the trailing
       edge of the row. Questionnaires carry no pill, matching the clean look. */
    .kind {
      flex-shrink: 0;
      align-self: center;
      font-size: var(--font-size-xs, 12px);
      padding: 1px 10px;
      border-radius: var(--radius-pill, 999px);
      border: var(--border-width, 1px) solid var(--color-selected-border, #2BB3C0);
      background: transparent;
      color: var(--color-accent, #2BB3C0);
      white-space: nowrap;
    }

    /* Preview (👁) — sits ON the card at its trailing edge. It is a DOM sibling
       of the card button (a button-in-button is invalid HTML), absolutely
       positioned inside the space the card reserves via padding-inline-end, so
       it reads as part of the card yet toggling and previewing stay separate. */
    .row { position: relative; }
    button.card { padding-inline-end: 44px; }
    .preview-btn {
      position: absolute;
      inset-inline-end: 6px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      inline-size: 32px;
      block-size: 32px;
      display: grid;
      place-items: center;
      border: none;
      border-radius: var(--radius-sm, 6px);
      background: transparent;
      color: var(--color-text-muted, #5E7080);
      cursor: pointer;
      font-family: inherit;
      transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease);
    }
    .preview-btn svg { inline-size: 18px; block-size: 18px; display: block; }
    .preview-btn:hover { background: var(--color-selected-bg, #E4F6F8); color: var(--color-primary, #1A9FAD); }
    .preview-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 2px; }
  `];

  // Mirror the entry id onto the host as a stable hook for e2e selectors
  // (catalog-card[data-id="phq9"]) — the id itself never renders as an attribute.
  updated() {
    if (this.entry?.id) this.setAttribute('data-id', this.entry.id);
  }

  // Let the parent list move focus here (arrow-key navigation).
  focus() { this.renderRoot?.querySelector('button')?.focus(); }

  _toggle() {
    this.dispatchEvent(new CustomEvent('item-toggle', {
      detail: { id: this.entry.id },
      bubbles: true,
      composed: true,
    }));
  }

  _preview() {
    this.dispatchEvent(new CustomEvent('preview', {
      detail: { id: this.entry.id },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const e = this.entry;
    if (!e) return nothing;

    // Only batteries and worksheets carry a pill; plain questionnaires stay
    // clean (title + id), matching the reference theming. Type/domain/time live
    // in the filter chips and the Stage 4 preview, not on the card.
    const kindBadge = e.kind === 'battery'
      ? 'סוללה'
      : (e.type === 'worksheet' ? 'דף עבודה' : null);

    return html`
      <div class="row">
        <button
          class="card"
          type="button"
          role="checkbox"
          aria-checked=${this.selected ? 'true' : 'false'}
          @click=${this._toggle}
        >
          <span class="check" aria-hidden="true">✓</span>
          <span class="body">
            <span class="name-row">
              <span class="name">${e.title}</span>
              <span class="id">${e.id}</span>
            </span>
          </span>
          ${kindBadge ? html`<span class="kind">${kindBadge}</span>` : nothing}
        </button>
        <button
          class="preview-btn"
          type="button"
          @click=${this._preview}
          title="תצוגה מקדימה"
          aria-label="תצוגה מקדימה"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    `;
  }
}

customElements.define('catalog-card', CatalogCard);
