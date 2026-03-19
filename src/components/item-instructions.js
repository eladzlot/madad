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
      padding: var(--space-lg);
      background: var(--color-surface);
      border-radius: var(--radius-md);
      border-inline-start: 3px solid var(--color-accent);
    }

    p {
      font-size: var(--font-size-lg);
      line-height: var(--line-height);
      color: var(--color-text);
      margin-block-end: var(--space-lg);
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
    this._boundKeyDown = this._onKeyDown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._boundKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._boundKeyDown);
  }

  _advance() {
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  _onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      // Don't intercept Space when a form control or link has focus —
      // those elements handle Space themselves (scroll, checkbox, button click).
      if (e.key === ' ') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag && ['input', 'textarea', 'select', 'button', 'a'].includes(tag)) return;
      }
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
      >
        המשך
      </button>
    `;
  }
}

customElements.define('item-instructions', ItemInstructions);
