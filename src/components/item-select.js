import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';
import { classMap } from 'lit/directives/class-map.js';

/**
 * <item-select>
 *
 * Renders a single Likert-scale question with selectable options.
 *
 * Properties:
 *   item     {object}    Resolved item — { id, text, options: [{label, value}, ...] }
 *   selected {any|null}  Currently selected value, or null
 *
 * Events:
 *   answer   CustomEvent({ detail: { value } })  — fired on selection
 *   advance  CustomEvent                          — fired after selection (tap/Enter)
 *             The controller delays 150 ms between answer and calling engine.advance().
 *             This component fires 'advance' immediately; the controller owns the delay.
 */
export class ItemSelect extends LitElement {
  static properties = {
    item:     { type: Object },
    selected: { type: Object },  // 'any' — could be number, array, etc.
    _focused: { type: Number, state: true },  // index of keyboard-focused option
  };

  static styles = [resetCSS, css`
    :host {
      display: block;
    }

    .question {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      line-height: var(--line-height-tight);
      color: var(--color-text);
      margin-block-end: var(--space-xl);
    }

    .options {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      list-style: none;
    }

    .option {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      min-block-size: var(--item-min-touch);
      padding-block: var(--space-sm);
      padding-inline: var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
      user-select: none;
      transition:
        background var(--transition-fast),
        border-color var(--transition-fast),
        transform var(--transition-fast),
        box-shadow var(--transition-fast);
      width: 100%;
      text-align: start;
      font-size: var(--font-size-md);
      color: var(--color-text);
      font-family: inherit;
    }

    .option:hover {
      background: var(--color-selected-bg);
      border-color: var(--color-border-focus);
      transform: translateX(2px);
    }

    .option:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }

    .option.is-selected {
      background: var(--color-selected-bg);
      border-color: var(--color-selected-border);
      border-width: 2px;
      font-weight: var(--font-weight-medium);
      transform: translateX(3px);
      box-shadow: -3px 0 0 0 var(--color-accent);
    }

    /* Non-colour selected indicator */
    .option__check {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: var(--border-width) solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    .option.is-selected .option__check {
      background: var(--color-primary);
      border-color: var(--color-primary);
    }

    .option__check-inner {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-primary-text);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .option.is-selected .option__check-inner {
      opacity: 1;
    }

    .option__label {
      flex: 1;
      line-height: var(--line-height);
    }
  `];

  constructor() {
    super();
    this.item = null;
    this.selected = null;
    this._focused = -1;
  }

  // ── Event helpers ──────────────────────────────────────────────────────────

  _select(value) {
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  _selectOnly(value) {
    // Space: select without advancing
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  _onKeyDown(e, index, value) {
    const options = this.item?.options ?? [];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._focusOption((index + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._focusOption((index - 1 + options.length) % options.length);
        break;
      case 'Enter':
        e.preventDefault();
        this._select(value);
        break;
      case ' ':
        e.preventDefault();
        this._selectOnly(value);
        break;
    }
  }

  _focusOption(index) {
    this._focused = index;
    // Focus the button at the given index
    this.updateComplete.then(() => {
      const btns = this.shadowRoot.querySelectorAll('.option');
      btns[index]?.focus();
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.item) return html``;

    const { text, options = [] } = this.item;

    return html`
      <p class="question" id="question-label">${text}</p>
      <ul
        class="options"
        role="radiogroup"
        aria-labelledby="question-label"
      >
        ${options.map((opt, i) => {
          const isSelected = opt.value === this.selected;
          return html`
            <li>
              <button
                class=${classMap({ option: true, 'is-selected': isSelected })}
                role="radio"
                aria-checked=${isSelected ? 'true' : 'false'}
                tabindex=${i === 0 || isSelected ? '0' : '-1'}
                @click=${() => this._select(opt.value)}
                @keydown=${(e) => this._onKeyDown(e, i, opt.value)}
              >
                <span class="option__check" aria-hidden="true">
                  <span class="option__check-inner"></span>
                </span>
                <span class="option__label">${opt.label}</span>
              </button>
            </li>
          `;
        })}
      </ul>
    `;
  }
}

customElements.define('item-select', ItemSelect);
