// <session-settings> — everything about the link that isn't the instruments.
//
// Two settings live here: the language the patient answers in, and the optional
// patient identifier. Both are set once per patient, if ever, so neither earns
// permanent space in a 300px rail. They present as **value chips** — the closed
// state is the settings themselves ("עברית · הוסף מזהה") rather than a label
// about them.
//
// The two chips behave differently on purpose:
//   · Language is a <select> wearing a chip: one click reaches the native list,
//     the same gesture as the nav's UI-language switch. It is not a toggle —
//     the language list is open-ended (I18N-8 Russian, I18N-9 Arabic).
//   · The ID chip reveals one labelled field and puts the cursor in it, so it
//     is still one click to start typing while keeping the label and the
//     "PDF only" hint that a bare inline input has nowhere to put.
//
// On the trial deployment the identifier is a minted uid and it is REQUIRED —
// the link is withheld until it validates (REMOTE_SPEC §3, §8.2) — so `required`
// drops the chip and leaves the field open. Hiding a mandatory field behind a
// disclosure would hide the one thing standing between the therapist and a
// working link.
//
// This sits at the TOP of the rail and of the mobile sheet, above the picked
// list, so a list that grows can never displace it.
//
// It opens itself when something needs attention: an invalid pid, or entries
// dropped by a language switch. Hiding a control is only acceptable while it
// has nothing to say.
//
// Dumb: every value arrives as a property, every change leaves as an event.
//   pid-change          { pid }
//   patient-lang-change { lang }
//   dropped-dismiss

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { t } from '../../../clinician/i18n/index.js';
import { LANGS, DEFAULT_LANG } from '../../../shared/i18n/core.js';

export class SessionSettings extends LitElement {
  static properties = {
    pid:         { type: String },
    patientLang: { type: String },
    langs:       { type: Array },    // selectable patient languages (codes)
    dropped:     { type: Array },    // ids dropped by the last language switch
    pidWarning:  { type: String },   // why the typed uid is not valid, or ''
    recentUids:  { type: Array },    // remembered uids for the datalist (uid-memory.js)
    required:    { type: Boolean },  // trial: the uid is mandatory, so never hidden
    open:        { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.pid = '';
    this.patientLang = DEFAULT_LANG;
    this.langs = [DEFAULT_LANG];
    this.dropped = [];
    this.pidWarning = '';
    this.recentUids = [];
    this.required = false;
    this.open = false;
    this._focusOnOpen = false;
  }

  // Anything that needs the clinician's eye forces the field open. It never
  // forces it closed again — that would yank the input out from under someone
  // who is still typing in it.
  willUpdate(changed) {
    if (changed.has('dropped') && this.dropped?.length) this.open = true;
    if (changed.has('pidWarning') && this.pidWarning) this.open = true;
  }

  // Revealing the field and then making the clinician click it again would be
  // two clicks for one intention.
  // Public: put the cursor in the uid field. The mobile bar calls this after
  // opening the sheet, so "enter a uid" lands the therapist on the field.
  focusPid() { this.renderRoot?.querySelector('input.pid')?.focus(); }

  get _fieldOpen() { return this.required || this.open; }

  updated() {
    if (this._focusOnOpen && this.open) {
      this.renderRoot.querySelector('input.pid')?.focus();
      this._focusOnOpen = false;
    }
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: block; }

    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

    /* A <select> wearing the chip. The globe and the caret are drawn around it
       because a select cannot hold markup of its own; appearance:none lets the
       chip's own border and fill show through. */
    .chip-select { position: relative; display: inline-flex; align-items: center; }
    .chip-select select {
      appearance: none;
      -webkit-appearance: none;
      font-family: inherit;
      font-size: var(--font-size-sm, 14px);
      line-height: 1;
      min-block-size: 32px;
      padding-inline: 30px 11px;
      border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
      border-radius: var(--radius-pill, 999px);
      background: var(--clin-rail-field, #2A3D52);
      color: var(--clin-rail-text-strong, #C0D4E4);
      cursor: pointer;
      transition: border-color var(--transition-fast, 120ms ease);
    }
    .chip-select:hover select { border-color: var(--color-accent, #2BB3C0); }
    .chip-select select:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }
    .chip-select .glyph {
      position: absolute;
      inset-inline-start: 10px;
      inline-size: 14px;
      block-size: 14px;
      pointer-events: none;
      opacity: 0.8;
      color: var(--clin-rail-hint, #aec8dc);
    }
    .chip-select .caret {
      position: absolute;
      inset-inline-end: 11px;
      font-size: 9px;
      pointer-events: none;
      color: var(--clin-rail-hint, #aec8dc);
    }
    /* The popup list is painted by the platform, not by the rail. */
    .chip-select select option { color: CanvasText; background: Canvas; }

    /* Rendered only while open. A hidden attribute is not enough on its own:
       an author display declaration beats the UA [hidden] rule, which is how
       this field once shipped permanently open. */
    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding-block-start: var(--space-md, 16px);
    }

    .label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--clin-rail-label, #bad5e9);
    }

    input.pid {
      inline-size: 100%;
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
      border-radius: var(--radius-sm, 6px);
      background: var(--clin-rail-field, #2A3D52);
      color: var(--clin-rail-text-strong, #C0D4E4);
      font-family: inherit;
      font-size: var(--font-size-md, 16px);
    }
    input.pid::placeholder { color: color-mix(in srgb, var(--clin-rail-text, #A8CFDF) 52%, transparent); }
    input.pid:focus { outline: none; border-color: var(--color-accent, #2BB3C0); }

    .hint { font-size: var(--font-size-xs, 12px); color: var(--clin-rail-hint, #aec8dc); }

    /* Entries the last language switch removed from the selection. */
    .dropped {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm, 8px);
      margin-block-start: var(--space-sm, 8px);
      font-size: var(--font-size-xs, 12px);
      color: var(--clin-rail-text-strong, #C0D4E4);
    }
    .dropped button {
      background: none;
      border: none;
      padding: 0;
      font-family: inherit;
      font-size: var(--font-size-xs, 12px);
      color: var(--color-accent, #2BB3C0);
      text-decoration: underline;
      cursor: pointer;
    }
    .dropped button:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }
  `];

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _togglePid() {
    this.open = !this.open;
    if (this.open) this._focusOnOpen = true;
  }

  get _langLabel() { return LANGS[this.patientLang]?.label ?? this.patientLang; }

  render() {
    const hasPid = !!this.pid?.trim();
    const langs = this.langs?.length ? this.langs : [DEFAULT_LANG];
    const n = this.dropped?.length ?? 0;

    return html`
      <div class="chips" role="group" aria-label=${t('cart.settings')}>
        ${langs.length > 1 ? html`
          <span class="chip-select">
            <svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>
              <path d="M12 3c2.6 3 2.6 15 0 18-2.6-3-2.6-15 0-18z"/>
            </svg>
            <select
              class="lang-chip"
              aria-label=${t('cart.langLabel')}
              .value=${this.patientLang}
              @change=${(e) => this._emit('patient-lang-change', { lang: e.target.value })}
            >
              ${langs.map(code => html`
                <option value=${code} lang=${code} ?selected=${code === this.patientLang}>
                  ${LANGS[code]?.label ?? code}
                </option>
              `)}
            </select>
            <span class="caret" aria-hidden="true">▾</span>
          </span>
        ` : nothing}

        ${this.required ? nothing : html`
        <button
          class="c-chip pid-chip ${hasPid ? '' : 'c-chip--unset'}"
          type="button"
          aria-expanded=${this.open ? 'true' : 'false'}
          @click=${this._togglePid}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11.5 3H21v9.5L12 21.5 2.5 12 11.5 3z"/>
            <circle cx="16.8" cy="7.2" r="1.4" fill="currentColor" stroke="none"/>
          </svg>
          ${hasPid
            ? html`<span class="c-chip-value">${this.pid}</span>`
            : t('cart.addPid')}
        </button>
        `}
      </div>

      ${this._fieldOpen ? html`
        <div class="field">
          <label class="label" for="settings-pid">${t('cart.pid')}</label>
          ${this.required ? html`
            <span class="hint">
              ${t('cart.uidHint')} <bdi dir="ltr">XXXX-XXXX</bdi>
            </span>
          ` : nothing}
          <input
            class="pid"
            id="settings-pid"
            type="text"
            dir="ltr"
            list=${this.required ? 'uid-memory' : nothing}
            maxlength=${this.required ? '9' : nothing}
            placeholder=${this.required ? 'XXXX-XXXX' : 'TRC-2025-000123'}
            .value=${this.pid ?? ''}
            aria-label=${t('cart.pid')}
            aria-invalid=${this.pidWarning ? 'true' : 'false'}
            aria-describedby="settings-pid-warning"
            autocomplete="off"
            spellcheck="false"
            @input=${(e) => this._emit('pid-change', { pid: e.target.value })}
          />
          ${this.required ? html`
            <datalist id="uid-memory">
              ${(this.recentUids ?? []).map(u => html`<option value=${u}></option>`)}
            </datalist>
          ` : nothing}
          <p class="pid-warning" id="settings-pid-warning" role="alert">
            ${this.pidWarning ? html`⚠ ${this.pidWarning}` : nothing}
          </p>
          ${this.required ? nothing : html`<span class="hint">${t('cart.pidHint')}</span>`}
        </div>
      ` : nothing}

      ${n ? html`
        <p class="dropped" role="status">
          <span>${t('cart.dropped', { n, lang: this._langLabel })}</span>
          <button type="button" @click=${() => this._emit('dropped-dismiss')}>${t('cart.dismiss')}</button>
        </p>
      ` : nothing}
    `;
  }
}

customElements.define('session-settings', SessionSettings);
