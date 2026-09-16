// <selection-cart> — the desktop sidebar: the ordered selection plus output.
//
// Holds the picked instruments in session order (mixed questionnaires /
// batteries / worksheets in one list), the generated patient URL, the copy /
// open / share actions, the optional patient-ID field, and reset. Reordering is
// available two ways — drag for the mouse, ↑/↓ buttons for the keyboard — both
// emitting the same `reorder` { from, to }. Every action leaves as an event; the
// component performs no clipboard/share/navigation side effects itself, so it
// stays trivially testable:
//   reorder { from, to } · remove { id } · pid-change { pid }
//   copy · share · open · reset

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { t } from '../../../clinician/i18n/index.js';
import { LANGS, DEFAULT_LANG } from '../../../shared/i18n/core.js';

export class SelectionCart extends LitElement {
  static properties = {
    entries:  { type: Array },     // [{ id, title }] in order
    url:      { type: String },
    pid:      { type: String },
    copied:   { type: Boolean },
    canShare: { type: Boolean },
    patientLang: { type: String },   // language the link opens in
    langs:    { type: Array },       // selectable patient languages (codes)
    dropped:  { type: Array },       // ids dropped by the last language switch
    _dragIndex: { type: Number, state: true },
  };

  constructor() {
    super();
    this.entries = [];
    this.url = null;
    this.pid = '';
    this.copied = false;
    this.canShare = false;
    this.patientLang = DEFAULT_LANG;
    this.langs = [DEFAULT_LANG];
    this.dropped = [];
    this._dragIndex = -1;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-lg, 24px);
      block-size: 100%;
      overflow-y: auto;
      padding: var(--space-lg, 24px) 20px;
    }

    /* The output rail is theme-independent dark navy chrome. Its palette is
       the --clin-rail-* block in clinician-styles.js (one place to re-hue the
       whole shell); the literals here are only fallbacks for that block. Tints
       are derived with color-mix so they track the base colour. */
    .section-label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--clin-rail-label, #7AABBD);
      margin-block-end: var(--space-xs, 4px);
    }
    .hint {
      font-size: var(--font-size-xs, 12px);
      color: var(--clin-rail-hint, #6898B0);
      margin-block-end: var(--space-sm, 8px);
    }

    .url-box {
      font-family: ui-monospace, monospace;
      font-size: var(--font-size-xs, 12px);
      background: var(--clin-rail-field, #2A3D52);
      border: var(--border-width, 1px) solid var(--clin-rail-field, #2A3D52);
      color: var(--clin-rail-text, #A8CFDF);
      border-radius: var(--radius-sm, 6px);
      padding: var(--space-sm, 8px);
      word-break: break-all;
      max-block-size: 84px;
      overflow-y: auto;
    }
    .url-box.empty { color: color-mix(in srgb, var(--clin-rail-text, #A8CFDF) 85%, transparent); }

    .btn-row { display: flex; gap: var(--space-sm, 8px); margin-block-start: var(--space-sm, 8px); }
    .c-btn--grow { flex: 1; }

    /* Secondary actions (↗ open, שתף share) sit on the dark rail, not the page. */
    .c-btn--secondary {
      background: var(--clin-rail-field, #2A3D52);
      border-color: var(--clin-rail-border, #304860);
      color: var(--clin-rail-text, #A8CFDF);
    }
    .c-btn--secondary:not(:disabled):hover {
      border-color: var(--color-accent, #2BB3C0);
      color: var(--color-accent, #2BB3C0);
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
    input.pid::placeholder { color: color-mix(in srgb, var(--clin-rail-text, #A8CFDF) 85%, transparent); }
    input.pid:focus { outline: none; border-color: var(--color-accent, #2BB3C0); }

    ol { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    li.item {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--clin-rail-field, #2A3D52);
      border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
      border-radius: var(--radius-sm, 6px);
      padding-inline: var(--space-sm, 8px);
      padding-block: 5px;
      cursor: grab;
    }
    li.item .item-title { margin-inline-end: var(--space-xs, 4px); }
    li.item.dragging { opacity: 0.5; }
    .order-num {
      flex-shrink: 0;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      background: var(--color-primary, #1A9FAD);
      color: var(--color-primary-text, #fff);
      font-size: var(--font-size-xs, 12px);
      display: grid;
      place-items: center;
      line-height: 1;
    }
    .item-title {
      flex: 1;
      min-inline-size: 0;
      font-size: var(--font-size-sm, 14px);
      color: var(--clin-rail-text-strong, #C0D4E4);
      /* One line, ellipsis — overrides the reset's overflow-wrap so long titles
         don't wrap and buckle the row (the reference truncates too). */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      overflow-wrap: normal;
    }

    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: color-mix(in srgb, var(--clin-rail-text, #A8CFDF) 85%, transparent);
      font-size: 14px;
      line-height: 1;
      padding: 3px;
      border-radius: var(--radius-sm, 6px);
    }
    .icon-btn:hover:not(:disabled) { color: var(--color-accent, #2BB3C0); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .icon-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 1px; }

    .empty-cart {
      font-size: var(--font-size-sm, 14px);
      color: var(--clin-rail-label, #7AABBD);
    }
    .empty-cart .help-link { color: var(--clin-rail-text, #A8CFDF); text-decoration: underline; }
    .empty-cart .help-link:hover { color: var(--clin-rail-text-strong, #C0D4E4); }
    .empty-cart .help-link:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: 2px;
    }

    /* Patient-language switch — a segmented pair on the dark rail. */
    .lang-seg { display: inline-flex; gap: 2px; padding: 2px;
      border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
      border-radius: var(--radius-pill, 999px); background: var(--clin-rail-field, #2A3D52); }
    .lang-seg button {
      border: none; background: transparent; color: var(--clin-rail-text, #A8CFDF);
      font-family: inherit; font-size: var(--font-size-sm, 14px); line-height: 1;
      padding: 6px 12px; border-radius: var(--radius-pill, 999px); cursor: pointer;
    }
    .lang-seg button[aria-pressed='true'] {
      background: var(--color-primary, #1A9FAD); color: var(--color-primary-text, #fff); cursor: default;
    }
    .lang-seg button:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 1px; }
    .dropped {
      display: flex; align-items: baseline; gap: var(--space-sm, 8px);
      margin-block-start: var(--space-sm, 8px);
      font-size: var(--font-size-xs, 12px); color: var(--clin-rail-text-strong, #C0D4E4);
    }
    .dropped button { background: none; border: none; color: inherit; text-decoration: underline;
      font-family: inherit; font-size: inherit; cursor: pointer; padding: 0; }
  `];

  _renderLangSwitch(id) {
    const langs = this.langs?.length ? this.langs : [DEFAULT_LANG];
    const dropped = this.dropped?.length ?? 0;
    return html`
      <div class="output-section">
        <div class="section-label" id=${id}>${t('cart.patientLang')}</div>
        <p class="hint">${t('cart.patientLangHint')}</p>
        <div class="lang-seg" role="group" aria-labelledby=${id}>
          ${langs.map(code => html`
            <button type="button" lang=${code} aria-pressed=${code === this.patientLang ? 'true' : 'false'}
              @click=${() => code !== this.patientLang && this._emit('patient-lang-change', { lang: code })}>
              ${LANGS[code]?.label ?? code}
            </button>
          `)}
        </div>
        ${dropped ? html`
          <p class="dropped" role="status">
            <span>${t('cart.dropped', { n: dropped, lang: LANGS[this.patientLang]?.label ?? this.patientLang })}</span>
            <button type="button" @click=${() => this._emit('dropped-dismiss')}>${t('cart.dismiss')}</button>
          </p>
        ` : nothing}
      </div>
    `;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _onPid(e) { this._emit('pid-change', { pid: e.target.value }); }

  // ── drag reorder ──
  _dragStart(i) { this._dragIndex = i; }
  _dragOver(e, i) {
    e.preventDefault();
    if (this._dragIndex === -1 || this._dragIndex === i) return;
    this._emit('reorder', { from: this._dragIndex, to: i });
    this._dragIndex = i;
  }
  _dragEnd() { this._dragIndex = -1; }

  _renderItem(entry, i, count) {
    return html`
      <li
        class="item ${this._dragIndex === i ? 'dragging' : ''}"
        draggable="true"
        @dragstart=${() => this._dragStart(i)}
        @dragover=${(e) => this._dragOver(e, i)}
        @dragend=${this._dragEnd}
      >
        <span class="order-num" aria-hidden="true">${i + 1}</span>
        <span class="item-title" title=${entry.title ?? entry.id}>${entry.title ?? entry.id}</span>
        <button class="icon-btn" type="button" aria-label=${t('cart.moveUp')}
          ?disabled=${i === 0} @click=${() => this._emit('reorder', { from: i, to: i - 1 })}>↑</button>
        <button class="icon-btn" type="button" aria-label=${t('cart.moveDown')}
          ?disabled=${i === count - 1} @click=${() => this._emit('reorder', { from: i, to: i + 1 })}>↓</button>
        <button class="icon-btn" type="button" aria-label=${t('cart.remove')}
          @click=${() => this._emit('remove', { id: entry.id })}>✕</button>
      </li>
    `;
  }

  render() {
    const hasUrl = !!this.url;
    const count = this.entries?.length ?? 0;

    return html`
      <div class="output-section">
        <div class="section-label">${t('cart.link')}</div>
        <div class="url-box ${hasUrl ? '' : 'empty'}" dir="ltr" aria-label=${t('cart.linkAria')}>
          ${hasUrl ? this.url : t('cart.noSelection')}
        </div>
        <div class="btn-row">
          <button class="c-btn c-btn--primary c-btn--grow ${this.copied ? 'c-btn--copied' : ''}"
            ?disabled=${!hasUrl} @click=${() => this._emit('copy')}>
            ${this.copied ? t('cart.copied') : t('cart.copy')}
          </button>
          <button class="c-btn c-btn--secondary c-btn--sm" title=${t('cart.open')}
            ?disabled=${!hasUrl} @click=${() => this._emit('open')}>↗</button>
          ${this.canShare ? html`
            <button class="c-btn c-btn--secondary c-btn--sm"
              ?disabled=${!hasUrl} @click=${() => this._emit('share')}>${t('cart.share')}</button>
          ` : nothing}
        </div>
      </div>

      ${this._renderLangSwitch('cart-lang-label')}

      <div class="output-section">
        <label class="section-label" for="cart-pid">${t('cart.pid')}</label>
        <p class="hint">${t('cart.pidHint')}</p>
        <input class="pid" id="cart-pid" type="text" dir="ltr"
          placeholder="TRC-2025-000123" .value=${this.pid ?? ''}
          aria-label=${t('cart.pid')} autocomplete="off" spellcheck="false" @input=${this._onPid} />
      </div>

      <div class="output-section">
        <div class="section-label">${t('cart.selected')} ${count > 0 ? `(${count})` : ''}</div>
        ${count > 0 ? html`
          <p class="hint">${t('cart.reorderHint')}</p>
          <ol>${this.entries.map((e, i) => this._renderItem(e, i, count))}</ol>
        ` : html`
          <p class="empty-cart">${t('cart.emptyHint')}</p>
          <p class="empty-cart"><a class="help-link" href="../help/">${t('cart.howItWorks')}</a></p>
        `}
      </div>
    `;
  }
}

customElements.define('selection-cart', SelectionCart);
