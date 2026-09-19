// <mobile-bar> — the phone's stand-in for the desktop rail.
//
// Phones have no room for a rail beside the catalog, so the panel the rail
// shows lives in a bottom sheet instead, and a fixed bar stays on screen to
// open it and to keep the primary action within one thumb's reach.
//
// The sheet's body is <selection-cart> — the very same component the rail
// renders, in `compact` mode. There is no second implementation of the
// selection, the settings or the link.
//
// The bar's count button carries a chevron. Without it the count read as a
// status line rather than a control, and nothing invited the tap that reveals
// the panel. It is not shown on desktop at all (the rail is right there).
//
// Emits the identical events as <selection-cart>, which bubble through the
// sheet, plus its own:
//   copy · share · open · reorder · remove · pid-change ·
//   patient-lang-change · dropped-dismiss · reset

import { LitElement, html, svg, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { t } from '../../../clinician/i18n/index.js';
import { DEFAULT_LANG } from '../../../shared/i18n/core.js';
import './selection-cart.js';
import './qr-code.js';

export class MobileBar extends LitElement {
  static properties = {
    entries:     { type: Array },
    url:         { type: String },
    pid:         { type: String },
    patientLang: { type: String },
    langs:       { type: Array },
    dropped:     { type: Array },
    pidWarning:  { type: String },
    copied:      { type: Boolean },
    canShare:    { type: Boolean },
    // 'copy' | 'qr' — see selection-cart. Defaults to 'copy'; the trial branch
    // sets 'qr', where the QR is the handover and copy is the fallback.
    shareMode:   { type: String },
    _open:       { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.entries = [];
    this.url = null;
    this.pid = '';
    this.patientLang = DEFAULT_LANG;
    this.langs = [DEFAULT_LANG];
    this.dropped = [];
    this.pidWarning = '';
    this.copied = false;
    this.canShare = false;
    this.shareMode = 'copy';
    this._open = false;
    this._onKeydown = (e) => { if (e.key === 'Escape' && this._open) this._close(); };
  }

  connectedCallback() {
    super.connectedCallback();
    globalThis.addEventListener?.('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener?.('keydown', this._onKeydown);
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: block; }

    .bar {
      position: fixed;
      inset-inline: 0;
      inset-block-end: 0;
      z-index: 40;
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      padding-block-end: calc(var(--space-sm, 8px) + env(safe-area-inset-bottom, 0px));
      background: var(--clin-header-bg, #1B3148);
      border-block-start: var(--border-width, 1px) solid rgba(255,255,255,0.12);
    }

    /* The count is the control that opens the panel, so it says so. */
    .count-btn {
      flex: 1;
      min-inline-size: 0;
      justify-content: flex-start;
      gap: 6px;
      background: rgba(255,255,255,0.12);
      border-color: rgba(255,255,255,0.30);
      color: #fff;
    }
    .count-btn:not(:disabled):hover {
      background: rgba(255,255,255,0.20);
      border-color: var(--color-accent, #2BB3C0);
    }
    .chev { inline-size: 14px; block-size: 14px; flex-shrink: 0; opacity: 0.9; }
    .count {
      min-inline-size: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .c-btn--bar {
      background: rgba(255,255,255,0.12);
      border-color: rgba(255,255,255,0.30);
      color: #fff;
      min-inline-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-sm, 8px);
    }
    .c-btn--bar:not(:disabled):hover {
      background: rgba(255,255,255,0.20);
      border-color: var(--color-accent, #2BB3C0);
      color: var(--color-accent, #2BB3C0);
    }
    .c-btn--go {
      background: var(--color-accent, #2BB3C0);
      color: var(--color-primary-text, #162232);
      font-weight: var(--font-weight-bold, 600);
    }
    .c-btn--go.c-btn--copied {
      background: color-mix(in srgb, var(--color-yes, #276749) 62%, #ffffff);
      color: var(--color-primary-text, #162232);
    }
    .c-btn { flex-shrink: 0; }
    .c-btn:focus-visible { outline: 2px solid var(--color-accent, #2BB3C0); outline-offset: 2px; }
    .icon { inline-size: 17px; block-size: 17px; display: block; }

    /* ── the sheet ── */
    .backdrop {
      position: fixed; inset: 0; z-index: 45;
      background: rgba(0,0,0,0.4);
    }
    .sheet {
      position: fixed;
      inset-inline: 0;
      inset-block-end: 0;
      z-index: 50;
      max-block-size: 88dvh;
      overflow-y: auto;
      background: var(--clin-rail-bg, #3A5068);
      border-start-start-radius: var(--radius-lg, 18px);
      border-start-end-radius: var(--radius-lg, 18px);
      padding-block-end: env(safe-area-inset-bottom, 0px);
    }
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 16px) 20px 0;
    }
    .sheet-title { color: #fff; font-size: var(--font-size-md, 16px); font-weight: var(--font-weight-medium, 500); }
    .icon-btn {
      background: none; border: none; cursor: pointer;
      color: color-mix(in srgb, var(--clin-rail-text, #A8CFDF) 85%, transparent);
      font-size: 16px; line-height: 1; padding: 6px; border-radius: var(--radius-sm, 6px);
    }
    .icon-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 1px; }

    .sheet-foot { padding: 0 20px var(--space-lg, 24px); }
    /* .c-btn--ghost is tuned for a light page; on the rail its muted slate is
       all but invisible. Keep the quiet-action role, restore the contrast. */
    .reset-btn {
      color: var(--clin-rail-text, #A8CFDF);
      border-color: var(--clin-rail-border, #304860);
    }
    .reset-btn:hover { color: var(--color-no, #E08A8A); border-color: var(--color-no, #E08A8A); }

    /* The rail is the desktop surface; none of this belongs there. */
    @media (min-width: 768px) {
      :host { display: none; }
    }
  `];

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _openSheet() { this._open = true; }
  _close() { this._open = false; }

  render() {
    const count = this.entries?.length ?? 0;
    const hasUrl = !!this.url;

    const qrFirst = this.shareMode === 'qr';

    const qrButton = (cls, label) => html`<button class="c-btn ${cls} qr-btn" type="button"
      title=${t('cart.qr')} aria-label=${t('cart.qr')}
      ?disabled=${!hasUrl}
      @click=${() => this.renderRoot.querySelector('.bar qr-code')?.expand()}>
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 20h2"/>
      </svg>${label ? t('cart.qr') : nothing}</button>`;

    const copyButton = (cls, label) => html`<button
      class="c-btn ${cls} copy-btn ${this.copied ? 'c-btn--copied' : ''}"
      type="button" title=${t('cart.copy')} aria-label=${t('cart.copy')}
      ?disabled=${!hasUrl} @click=${() => this._emit('copy')}>
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${this.copied
          ? svg`<path d="M20 6 9 17l-5-5"/>`
          : svg`<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>`}
      </svg>${label ? (this.copied ? t('cart.copied') : t('cart.copy')) : nothing}</button>`;

    const primary = qrFirst
      ? qrButton('c-btn--go', true)
      : this.canShare
      ? html`<button class="c-btn c-btn--go share-btn" type="button"
          ?disabled=${!hasUrl} @click=${() => this._emit('share')}>${t('cart.share')}</button>`
      : copyButton('c-btn--go', true);

    // The slot beside the primary holds whichever of the pair is not on it.
    const secondary = qrFirst ? copyButton('c-btn--bar', false) : qrButton('c-btn--bar', false);

    return html`
      <div class="bar">
        <button class="c-btn count-btn" type="button"
          aria-expanded=${this._open ? 'true' : 'false'}
          ?disabled=${!count} @click=${this._openSheet}>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 15 6-6 6 6"/>
          </svg>
          <span class="count">
            ${count ? t('mobile.selectedCount', { n: count }) : t('mobile.none')}
          </span>
        </button>
        ${secondary}
        ${primary}
        ${hasUrl ? html`<qr-code .url=${this.url} size="104" tileless></qr-code>` : nothing}
      </div>

      ${this._open ? html`
        <div class="backdrop" @click=${this._close}></div>
        <div class="sheet" role="dialog" aria-label=${t('mobile.sheetTitle')} aria-modal="true">
          <div class="sheet-header">
            <span class="sheet-title">${t('mobile.sheetTitle')}</span>
            <button class="icon-btn close-btn" type="button"
              aria-label=${t('mobile.close')} @click=${this._close}>✕</button>
          </div>

          <selection-cart
            compact
            .entries=${this.entries}
            .url=${this.url}
            .pid=${this.pid}
            .patientLang=${this.patientLang}
            .langs=${this.langs}
            .dropped=${this.dropped}
            .pidWarning=${this.pidWarning}
            .copied=${this.copied}
            .canShare=${this.canShare}
            .shareMode=${this.shareMode}
          ></selection-cart>

          <div class="sheet-foot">
            <button class="c-btn c-btn--ghost c-btn--sm reset-btn" type="button"
              @click=${() => this._emit('reset')}>${t('mobile.reset')}</button>
          </div>
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('mobile-bar', MobileBar);
