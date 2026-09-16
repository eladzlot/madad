import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <item-rated-text>
 *
 * A free-text phrase paired with a numeric rating on a single screen — e.g. a
 * stuck point + belief 0-100, or a problem + severity. Does NOT auto-advance;
 * requires explicit submit.
 *
 * The rating is the item's canonical scalar answer (scored like a slider); the
 * text rides alongside under a sidecar key. This component emits both halves in
 * one 'answer' event; the controller routes them to the two answer-map keys.
 *
 * Properties:
 *   item         {object}      — { id, text, ratingText?, inputType?, min, max,
 *                                  step?, labels?, required? }
 *   selected     {number|null} — current rating value, or null (untouched)
 *   selectedText {string|null} — current text value, or null
 *
 * Events:
 *   answer   CustomEvent({ detail: { value: number|null, text: string|null } })
 *            — fired on every change to either field. `value` is the rating
 *            (null until the slider is touched); `text` is the phrase.
 *   advance  CustomEvent — fired on submit button click
 */
export class ItemRatedText extends LitElement {
  static properties = {
    item:         { type: Object },
    selected:     { type: Number },
    selectedText: { type: String },
    _rating:      { type: Number, state: true },
    _touched:     { type: Boolean, state: true },
    _text:        { type: String, state: true },
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
      margin-block-end: var(--space-lg);
    }

    textarea,
    input.line {
      width: 100%;
      padding-block: var(--space-sm);
      padding-inline: var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      font-size: var(--font-size-md);
      font-family: inherit;
      color: var(--color-text);
      direction: inherit;
      transition: border-color var(--transition-fast);
      margin-block-end: var(--space-xl);
    }

    textarea:focus,
    input.line:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    textarea {
      resize: vertical;
      min-block-size: 90px;
      line-height: var(--line-height);
    }

    .rating-label {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      margin-block-end: var(--space-md);
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
      height: 44px;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      margin: 0;
      padding: 0;
      transform: scaleX(-1);  /* visual RTL flip — value logic unaffected */
    }

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

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-primary);
      border: 2px solid var(--color-bg);
      box-shadow: 0 0 0 1.5px var(--color-primary);
      margin-top: -7px;
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
      color: var(--color-primary-ink);
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
      border-radius: var(--radius-pill);
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
    this.item         = null;
    this.selected     = null;
    this.selectedText = null;
    this._rating      = 0;
    this._touched     = false;
    this._text        = '';
  }

  willUpdate(changed) {
    if (changed.has('item') && this.item) {
      const mid = (this.item.min + this.item.max) / 2;
      this._rating  = this.selected ?? mid;
      this._touched = this.selected != null;
    }
    if (changed.has('selected') && this.selected != null) {
      this._rating  = this.selected;
      this._touched = true;
    }
    if (changed.has('selectedText')) {
      this._text = this.selectedText ?? '';
    }
  }

  _pct() {
    if (!this.item) return '0%';
    const { min, max } = this.item;
    const pct = ((this._rating - min) / (max - min)) * 100;
    return `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
  }

  // Emit both halves together. `value` is null until the slider is touched, so
  // the rating stays "unanswered" (and canAdvance keeps blocking) even after the
  // patient types text — matching required-slider semantics.
  _emit() {
    this.dispatchEvent(new CustomEvent('answer', {
      detail: {
        value: this._touched ? this._rating : null,
        text:  this._text || null,
      },
      bubbles: true,
      composed: true,
    }));
  }

  _onSlide(e) {
    this._rating  = Number(e.target.value);
    this._touched = true;
    this._emit();
  }

  _onText(e) {
    this._text = e.target.value;
    this._emit();
  }

  _submit() {
    if (!this._canSubmit()) return;
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  // The rating is the gate (like a required slider). When the item is skippable
  // (required: false) the patient may advance without touching anything.
  _canSubmit() {
    if (this.item?.required === false) return true;
    return this._touched;
  }

  render() {
    if (!this.item) return html``;
    const { text, ratingText, inputType = 'multiline', min, max, step = 1, labels } = this.item;
    const isMultiline = inputType !== 'line';

    return html`
      <p class="question">${text}</p>
      ${isMultiline
        ? html`<textarea
            .value=${this._text}
            @input=${this._onText}
            rows="4"
            aria-label=${text}
          ></textarea>`
        : html`<input
            class="line"
            type="text"
            .value=${this._text}
            @input=${this._onText}
            aria-label=${text}
          />`
      }
      ${ratingText ? html`<p class="rating-label">${ratingText}</p>` : ''}
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
            .value=${String(this._rating)}
            @input=${this._onSlide}
            aria-label=${ratingText ?? text}
            aria-valuemin=${min}
            aria-valuemax=${max}
            aria-valuenow=${this._rating}
          />
          <span class="${this._touched ? 'value-display' : 'value-display untouched'}">
            ${this._touched ? this._rating : '—'}
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
        ?disabled=${!this._canSubmit()}
        @click=${this._submit}
      >
        המשך
      </button>
    `;
  }
}

customElements.define('item-rated-text', ItemRatedText);
