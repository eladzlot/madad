import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <item-instructions>
 *
 * Renders a non-scored instruction screen.
 *
 * Properties:
 *   item  {object}  — { id, text }
 *
 * Events:
 *   advance  CustomEvent  — fired on continue button tap or Enter key
 *             No delay — instructions advance immediately.
 */
export class ItemInstructions extends LitElement {
  static properties = {
    item: { type: Object },
  };

  static styles = [resetCSS, css`
    :host {
      display: block;
    }

    .paragraphs {
      margin-block-end: var(--space-xl);
    }

    p {
      font-size: var(--font-size-md);
      line-height: var(--line-height);
      color: var(--color-text);
      margin-block-end: var(--space-md);
    }

    p:last-child {
      margin-block-end: 0;
    }

    .continue-btn {
      display: block;
      width: 100%;
      min-block-size: var(--item-min-touch);
      padding-block: var(--space-sm);
      padding-inline: var(--space-lg);
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: none;
      border-radius: var(--radius-pill);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .continue-btn:hover {
      background: var(--color-primary-hover);
    }

    .continue-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }
  `];

  constructor() {
    super();
    this.item = null;
  }

  _advance() {
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  _onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._advance();
    }
  }

  render() {
    if (!this.item) return html``;

    const paragraphs = this.item.text?.split('\n').filter(Boolean) ?? [];

    return html`
      <div class="paragraphs">
        ${paragraphs.map(p => html`<p>${p}</p>`)}
      </div>
      <button
        class="continue-btn"
        @click=${this._advance}
        @keydown=${this._onKeyDown}
      >
        המשך
      </button>
    `;
  }
}

customElements.define('item-instructions', ItemInstructions);
