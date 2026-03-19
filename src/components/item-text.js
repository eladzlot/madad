import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

// ─── ReDoS guard ─────────────────────────────────────────────────────────────
// Rejects regex patterns that contain nested/chained quantifiers which can
// cause catastrophic backtracking on crafted inputs. This is a conservative
// syntactic check, not a full ReDoS solver — it blocks the most common forms.
// Patterns that fail this check are silently skipped (no validation applied).
function _isSafePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length > 200) return false;
  // Reject nested quantifiers: (x+)+ (x*)+ (x+)* (x?)+ etc.
  if (/\([^)]*[*+?][^)]*\)[*+?]/.test(pattern)) return false;
  // Reject adjacent quantifiers on groups: )+(  )*( etc.
  if (/\)[*+?]\s*\(/.test(pattern)) return false;
  return true;
}

/**
 * <item-text>
 *
 * Renders a free-text question with a single-line or multiline input.
 * Does NOT auto-advance — requires explicit submit via button or Enter.
 *
 * Properties:
 *   item     {object}      — { id, text, inputType?, min?, max?, pattern?, required? }
 *                            inputType: 'line' | 'multiline' | 'number' | 'email'
 *   selected {string|null} — current answer value, or null
 *
 * Events:
 *   answer   CustomEvent({ detail: { value: string } }) — fired on every input change
 *   advance  CustomEvent — fired on submit button click or Enter (single-line only)
 */
export class ItemText extends LitElement {
  static properties = {
    item:        { type: Object },
    selected:    { type: String },
    _value:      { type: String, state: true },
    _error:      { type: String, state: true },
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

    .input-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      margin-block-end: var(--space-lg);
    }

    input,
    textarea {
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
    }

    input:focus,
    textarea:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    textarea {
      resize: vertical;
      min-block-size: 100px;
      line-height: var(--line-height);
    }

    .error {
      font-size: var(--font-size-sm);
      color: var(--color-no);
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
    this._value   = '';
    this._error   = '';
  }

  // Sync _value when selected is set externally (back navigation)
  willUpdate(changed) {
    if (changed.has('selected')) {
      this._value = this.selected ?? '';
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  _validate(value) {
    const { inputType = 'line', min, max, pattern } = this.item ?? {};
    if (!value) return '';

    if (inputType === 'number') {
      const num = Number(value);
      if (isNaN(num))           return 'יש להזין מספר';
      if (min != null && num < min) return `המינימום הוא ${min}`;
      if (max != null && num > max) return `המקסימום הוא ${max}`;
    }
    if (inputType === 'email') {
      if (!value.includes('@')) return 'כתובת דוא"ל לא תקינה';
    }
    if (pattern) {
      // Guard against ReDoS: reject patterns with nested/chained quantifiers
      // that can cause catastrophic backtracking on crafted inputs.
      if (_isSafePattern(pattern)) {
        try {
          if (!new RegExp(pattern).test(value)) return 'הערך אינו בפורמט הנדרש';
        } catch { /* malformed pattern — skip */ }
      }
    }
    return '';
  }

  // ── Event helpers ──────────────────────────────────────────────────────────

  _onInput(e) {
    this._value = e.target.value;
    this._error = '';
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value: this._value || null },
      bubbles: true,
      composed: true,
    }));
  }

  _submit() {
    const error = this._validate(this._value);
    if (error) { this._error = error; return; }
    // If the field is empty, emit answer(null) to clear any previously typed
    // value (e.g. patient navigated back and cleared the input).
    if (!this._value) {
      this.dispatchEvent(new CustomEvent('answer', {
        detail: { value: null },
        bubbles: true,
        composed: true,
      }));
    }
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  _onKeyDown(e) {
    // Single-line inputs: Enter submits
    if (e.key === 'Enter' && this.item?.inputType !== 'multiline') {
      e.preventDefault();
      this._submit();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.item) return html``;
    const { text, inputType = 'line', required } = this.item;
    const isRequired = required === true;  // text items are skippable by default
    const isMultiline = inputType === 'multiline';
    const inputMode = inputType === 'number' ? 'decimal'
                    : inputType === 'email'  ? 'email'
                    : 'text';

    return html`
      <p class="question">${text}</p>
      <div class="input-wrap">
        ${isMultiline
          ? html`<textarea
              .value=${this._value}
              @input=${this._onInput}
              rows="4"
              aria-label=${text}
            ></textarea>`
          : html`<input
              type=${inputType === 'number' ? 'text' : inputType}
              inputmode=${inputMode}
              .value=${this._value}
              @input=${this._onInput}
              @keydown=${this._onKeyDown}
              aria-label=${text}
            />`
        }
        ${this._error ? html`<span class="error" role="alert">${this._error}</span>` : ''}
      </div>
      <button class="submit-btn" @click=${this._submit}>
        ${isRequired || this._value ? 'המשך' : 'המשך ללא מילוי'}
      </button>
    `;
  }
}

customElements.define('item-text', ItemText);
