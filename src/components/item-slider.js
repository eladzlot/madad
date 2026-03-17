import { LitElement, html, css } from 'lit';

/**
 * <item-slider>
 *
 * Renders a range slider with optional min/max labels.
 * Does NOT auto-advance — requires explicit submit.
 *
 * Properties:
 *   item     {object}      — { id, text, min, max, step?, labels?, required? }
 *   selected {number|null} — current value, or null (untouched)
 *
 * Events:
 *   answer   CustomEvent({ detail: { value: number } }) — fired on every change
 *   advance  CustomEvent — fired on submit button click
 */
export class ItemSlider extends LitElement {
  static properties = {
    item:      { type: Object },
    selected:  { type: Number },
    _value:    { type: Number, state: true },
    _touched:  { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .question {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-medium);
      line-height: var(--line-height-tight);
      color: var(--color-text);
      margin-block-end: var(--space-lg);
    }

    .slider-wrap {
      margin-block-end: var(--space-lg);
    }

    .track-row {
      display: flex;
      align-items: center;
      gap: var(--space-md);
    }

    input[type="range"] {
      flex: 1;
      height: 6px;
      cursor: pointer;
      accent-color: var(--color-primary);
      /* custom track fallback for browsers that don't support accent-color fully */
    }

    .value-display {
      min-width: 2.5em;
      text-align: center;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
    }

    .value-display.untouched {
      color: var(--color-text-muted);
    }

    .labels-row {
      display: flex;
      justify-content: space-between;
      margin-block-start: var(--space-xs);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
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
      border-radius: var(--radius-md);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .submit-btn:not(:disabled):hover {
      background: var(--color-primary-hover);
    }

    .submit-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }
  `;

  constructor() {
    super();
    this.item     = null;
    this.selected = null;
    this._value   = 0;
    this._touched = false;
  }

  willUpdate(changed) {
    if (changed.has('item') && this.item) {
      // Initialise to midpoint when item changes
      const mid = (this.item.min + this.item.max) / 2;
      this._value  = this.selected ?? mid;
      this._touched = this.selected != null;
    }
    if (changed.has('selected') && this.selected != null) {
      this._value   = this.selected;
      this._touched = true;
    }
  }

  // ── Event helpers ──────────────────────────────────────────────────────────

  _onInput(e) {
    this._value   = Number(e.target.value);
    this._touched = true;
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value: this._value },
      bubbles: true,
      composed: true,
    }));
  }

  _submit() {
    if (!this._touched) return;
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.item) return html``;
    const { text, min, max, step = 1, labels } = this.item;

    return html`
      <p class="question">${text}</p>
      <div class="slider-wrap">
        <div class="track-row">
          <input
            type="range"
            min=${min}
            max=${max}
            step=${step}
            .value=${String(this._value)}
            @input=${this._onInput}
            aria-label=${text}
            aria-valuemin=${min}
            aria-valuemax=${max}
            aria-valuenow=${this._value}
          />
          <span class="${this._touched ? 'value-display' : 'value-display untouched'}">
            ${this._touched ? this._value : '—'}
          </span>
        </div>
        ${(labels?.min || labels?.max) ? html`
          <div class="labels-row">
            <span>${labels?.max ?? ''}</span>
            <span>${labels?.min ?? ''}</span>
          </div>
        ` : ''}
      </div>
      <button
        class="submit-btn"
        ?disabled=${!this._touched}
        @click=${this._submit}
      >
        המשך
      </button>
    `;
  }
}

customElements.define('item-slider', ItemSlider);
