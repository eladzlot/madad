import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

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

  static styles = [resetCSS, css`
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

    /* ── Custom range track — RTL-native via scaleX(-1) ──────────────────────
       dir="ltr" keeps value/thumb logic consistent across all browsers.
       transform: scaleX(-1) flips the element visually so the fill grows from
       the right and the thumb moves right-to-left, matching RTL conventions.
       The thumb is a circle so the mirror is invisible. ---------------------- */

    input[type="range"] {
      flex: 1;
      height: 44px;           /* full touch target height */
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      margin: 0;
      padding: 0;
      transform: scaleX(-1);  /* visual RTL flip — value logic unaffected */
    }

    /* ── Track ── */
    input[type="range"]::-webkit-slider-runnable-track {
      height: 6px;
      border-radius: 3px;
      background: linear-gradient(
        to right,
        var(--color-primary) var(--range-pct, 0%),
        var(--color-border)  var(--range-pct, 0%)
      );
    }

    input[type="range"]::-moz-range-track {
      height: 6px;
      border-radius: 3px;
      background: var(--color-border);
    }

    input[type="range"]::-moz-range-progress {
      height: 6px;
      border-radius: 3px 0 0 3px;
      background: var(--color-primary);
    }

    /* ── Thumb ── */
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-primary);
      border: 2px solid var(--color-bg);
      box-shadow: 0 0 0 1.5px var(--color-primary);
      margin-top: -7px;       /* centre on 6px track: (20 - 6) / 2 = 7 */
      cursor: pointer;
      transition: box-shadow var(--transition-fast);
    }

    input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-primary);
      border: 2px solid var(--color-bg);
      box-shadow: 0 0 0 1.5px var(--color-primary);
      cursor: pointer;
      transition: box-shadow var(--transition-fast);
    }

    input[type="range"]:focus-visible::-webkit-slider-thumb {
      box-shadow: 0 0 0 3px var(--color-border-focus);
    }

    input[type="range"]:focus-visible::-moz-range-thumb {
      box-shadow: 0 0 0 3px var(--color-border-focus);
    }

    /* ── Untouched state — hide thumb, fade track ── */
    input[type="range"].untouched::-webkit-slider-runnable-track {
      background: var(--color-border);
      opacity: 0.5;
    }

    input[type="range"].untouched::-moz-range-track {
      opacity: 0.5;
    }

    input[type="range"].untouched::-webkit-slider-thumb {
      opacity: 0;
    }

    input[type="range"].untouched::-moz-range-thumb {
      opacity: 0;
    }

    .drag-hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      text-align: center;
      margin-block-start: var(--space-xs);
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
  `];

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Percentage of the way from min→max, used to drive the fill gradient.
  _pct() {
    if (!this.item) return '0%';
    const { min, max } = this.item;
    const pct = ((this._value - min) / (max - min)) * 100;
    return `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
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
            dir="ltr"
            class=${this._touched ? '' : 'untouched'}
            style="--range-pct: ${this._pct()}"
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
        ${!this._touched ? html`
          <p class="drag-hint">גרור כדי לבחור ערך</p>
        ` : ''}
        ${(labels?.min || labels?.max) ? html`
          <div class="labels-row">
            <span>${labels?.min ?? ''}</span>
            <span>${labels?.max ?? ''}</span>
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
