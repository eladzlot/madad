// <link-form> — the "link expired?" recovery form (REMOTE_SPEC §4.4).
// Emits `link-request` { uid }; the composition root does the POST and sets
// `state` to 'sent'. The copy never says whether the uid is registered.

import { LitElement, html, css, unsafeCSS } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { isValidUid, formatUid, uidWarning } from '../../../shared/remote/uid.js';

export class LinkForm extends LitElement {
  static properties = {
    uid:    { type: String },                 // prefilled from the expired link
    state:  { type: String },                 // 'idle' | 'sending' | 'sent'
    reason: { type: String },                 // 'expired' | 'error'
    _value: { state: true },
  };

  static styles = [unsafeCSS(clinicianCss), css`
    :host { display: block; }
    .box {
      background: var(--clin-card-bg, #fff);
      border: var(--border-width, 1px) solid var(--color-border, #D9D5D0);
      border-inline-start: 4px solid var(--color-border-focus, #9A4453);
      border-radius: var(--radius-md, 12px);
      padding: var(--space-lg, 24px);
      max-inline-size: 560px;
    }
    h2 { margin: 0 0 var(--space-xs, 4px); font-size: var(--font-size-lg, 22px); color: var(--color-text, #26211F); }
    p  { margin: 0 0 var(--space-md, 16px); color: var(--color-text-muted, #6B6360); line-height: var(--line-height, 1.6); }
    form { display: flex; gap: var(--space-sm, 8px); flex-wrap: wrap; align-items: center; }
    input {
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      border: var(--border-width, 1px) solid var(--color-border, #D9D5D0);
      border-radius: var(--radius-sm, 6px);
      font: inherit; font-size: var(--font-size-md, 16px);
      inline-size: 12ch; direction: ltr; text-align: center; letter-spacing: 0.08em; text-transform: uppercase;
      background: var(--color-bg, #F5F4F2); color: var(--color-text, #26211F);
    }
    input:focus { outline: none; border-color: var(--color-border-focus, #9A4453); }
    .warn { color: var(--color-no, #8B3A3A); font-size: var(--font-size-sm, 14px); flex-basis: 100%; margin: 0; }
    .sent { color: var(--color-yes, #276749); margin: 0; }
  `];

  constructor() {
    super();
    this.uid = '';
    this.state = 'idle';
    this.reason = 'expired';
    this._value = null;
  }

  get _current() { return this._value ?? this.uid ?? ''; }

  _submit(e) {
    e.preventDefault();
    if (!isValidUid(this._current) || this.state === 'sending') return;
    this.dispatchEvent(new CustomEvent('link-request', { detail: { uid: formatUid(this._current) }, bubbles: true, composed: true }));
  }

  render() {
    const warn = uidWarning(this._current);
    const title = this.reason === 'error' ? 'לא הצלחנו לטעון את המפגשים' : 'הקישור פג או אינו תקין';
    return html`
      <section class="box" aria-labelledby="lf-title">
        <h2 id="lf-title">${title}</h2>
        ${this.state === 'sent' ? html`
          <p class="sent">אם המזהה רשום, קישור חדש נשלח לכתובת המייל הרשומה. הקישור תקף שבעה ימים.</p>
        ` : html`
          <p>הזינו את מזהה המטופל ונשלח קישור חדש לכתובת המייל הרשומה במערכת.</p>
          <form @submit=${this._submit}>
            <input type="text" .value=${this._current} @input=${(e) => { this._value = e.target.value; }}
              placeholder="XXXX-XXXX" maxlength="9" aria-label="מזהה מטופל" autocomplete="off" spellcheck="false" />
            <button class="c-btn c-btn--primary" type="submit" ?disabled=${!isValidUid(this._current) || this.state === 'sending'}>
              ${this.state === 'sending' ? 'שולח…' : 'שלחו לי קישור חדש'}
            </button>
            ${warn ? html`<p class="warn">${warn}</p>` : ''}
          </form>
        `}
      </section>
    `;
  }
}

customElements.define('link-form', LinkForm);
