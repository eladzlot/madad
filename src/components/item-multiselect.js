import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';
import { classMap } from 'lit/directives/class-map.js';

/**
 * <item-multiselect>
 *
 * Renders a multi-choice question as a checkbox list.
 * Options are positional — answer is an array of 1-based indices.
 * Zero selections is a valid answer. Skippable by default.
 * Does NOT auto-advance — requires explicit submit.
 *
 * Properties:
 *   item     {object}        — { id, text, options: [{label}, ...], required? }
 *   selected {number[]|null} — currently selected 1-based indices, or null
 *
 * Events:
 *   answer   CustomEvent({ detail: { value: number[] } }) — fired on every change
 *   advance  CustomEvent — fired on submit button click
 */
export class ItemMultiselect extends LitElement {
  static properties = {
    item:      { type: Object },
    selected:  { type: Array },
    _checked:  { type: Array, state: true },
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
      margin-block-end: var(--space-lg);
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

    .option.is-checked {
      background: var(--color-selected-bg);
      border-color: var(--color-selected-border);
      border-width: 2px;
      font-weight: var(--font-weight-medium);
      transform: translateX(3px);
      box-shadow: -3px 0 0 0 var(--color-accent);
    }

    .option__check {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: var(--radius-sm);
      border: var(--border-width) solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    .option.is-checked .option__check {
      background: var(--color-primary);
      border-color: var(--color-primary);
    }

    /* Checkmark via CSS */
    .option__check-inner {
      width: 5px;
      height: 9px;
      border: 2px solid var(--color-primary-text);
      border-top: none;
      border-left: none;
      transform: rotate(45deg) translateY(-1px);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .option.is-checked .option__check-inner {
      opacity: 1;
    }

    .option__label {
      flex: 1;
      line-height: var(--line-height);
    }

    .submit-btn {
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

    .submit-btn:hover {
      background: var(--color-primary-hover);
    }

    .submit-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }
  `];

  constructor() {
    super();
    this.item     = null;
    this.selected = null;
    this._checked = [];
  }

  willUpdate(changed) {
    if (changed.has('selected')) {
      this._checked = Array.isArray(this.selected) ? [...this.selected] : [];
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────

  _toggle(index) {
    // index is 1-based
    const checked = this._checked.includes(index)
      ? this._checked.filter(i => i !== index)
      : [...this._checked, index].sort((a, b) => a - b);

    this._checked = checked;
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value: checked },
      bubbles: true,
      composed: true,
    }));
  }

  _submit() {
    // If nothing is checked, emit answer:[] to clear any previously recorded
    // partial selection (e.g. patient navigated back and unchecked everything).
    if (this._checked.length === 0) {
      this.dispatchEvent(new CustomEvent('answer', {
        detail: { value: [] },
        bubbles: true,
        composed: true,
      }));
    }
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  _onKeyDown(e, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._toggle(index);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.item) return html``;
    const { text, options = [] } = this.item;

    return html`
      <p class="question">${text}</p>
      <ul class="options" role="group" aria-labelledby="question-label">
        ${options.map((opt, i) => {
          const index = i + 1;  // 1-based
          const isChecked = this._checked.includes(index);
          return html`
            <li>
              <button
                class=${classMap({ option: true, 'is-checked': isChecked })}
                role="checkbox"
                aria-checked=${isChecked ? 'true' : 'false'}
                @click=${() => this._toggle(index)}
                @keydown=${(e) => this._onKeyDown(e, index)}
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
      <button class="submit-btn" @click=${this._submit}>
        ${this._checked.length > 0 ? 'המשך' : 'המשך ללא בחירה'}
      </button>
    `;
  }
}

customElements.define('item-multiselect', ItemMultiselect);
