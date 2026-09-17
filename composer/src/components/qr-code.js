// <qr-code> — the patient link as a scannable QR code.
//
// Sits beside the URL box in the cart and the mobile sheet: a small white tile
// the patient can scan straight off the clinician's screen, and (with
// `expandable`) a native <dialog> that shows the same code large enough to
// scan across a desk, with the link spelled out under it and a PNG download
// for pasting into a letter or printing for the waiting room.
//
// The encoder is loaded lazily on the first url (see ../qr.js); until it
// arrives the tile keeps its footprint so the rail doesn't jump. The component
// owns no store state and emits no events — it is a pure function of `url`.

import { LitElement, html, css, svg, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { t } from '../../../clinician/i18n/index.js';
import { encodeQr, matrixToPath, matrixToPngBlob, fullSize } from '../qr.js';

export const QR_FILENAME = 'madad-qr.png';

export class QrCode extends LitElement {
  static properties = {
    url:        { type: String },
    size:       { type: Number },              // tile side in CSS px
    expandable: { type: Boolean },
    tileless:   { type: Boolean },   // dialog only — the trigger lives elsewhere
    _matrix:    { state: true },
    _failed:    { state: true },
    _open:      { state: true },
  };

  constructor() {
    super();
    this.url = null;
    this.size = 120;
    this.expandable = false;
    this.tileless = false;
    this._matrix = null;
    this._failed = false;
    this._open = false;
    this._wantOpen = false;
    this._seq = 0;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: block; }

    /* The tile is always white — a QR needs a light quiet zone whatever the
       surrounding chrome (dark rail, dark mode). The quiet zone itself is part
       of the SVG viewBox, so no padding here. */
    .tile {
      display: block;
      inline-size: var(--qr-size, 120px);
      block-size: var(--qr-size, 120px);
      background: #fff;
      border-radius: var(--radius-sm, 6px);
      overflow: hidden;
      border: none;
      padding: 0;
    }
    button.tile { cursor: zoom-in; }
    button.tile:focus-visible { outline: 2px solid var(--color-border-focus, #5aa053); outline-offset: 2px; }
    .tile.pending { background: color-mix(in srgb, #fff 70%, transparent); }
    svg { display: block; inline-size: 100%; block-size: 100%; }
    path { fill: #000; }

    .unavailable {
      font-size: var(--font-size-xs, 12px);
      color: var(--clin-rail-hint, #95b2a6);
    }

    /* ── enlarged view ── */
    dialog {
      inline-size: min(92vw, 440px);
      padding: 0;
      border: none;
      border-radius: var(--radius-lg, 18px);
      background: var(--clin-card-bg, #FFFFFF);
      color: var(--color-text, #0b281e);
      box-shadow: 0 24px 64px -20px rgba(11, 22, 33, 0.28);
    }
    dialog::backdrop { background: rgba(11, 22, 33, 0.4); backdrop-filter: blur(2px); }
    .frame {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: clamp(16px, 4vw, 28px);
    }
    .big {
      inline-size: min(76vw, 340px);
      block-size: min(76vw, 340px);
      background: #fff;
      border-radius: var(--radius-md, 10px);
      /* A hairline so the white symbol still has an edge in dark mode. */
      box-shadow: 0 0 0 1px var(--color-border, #bae4d2);
    }
    .caption {
      font-size: var(--font-size-md, 16px);
      font-weight: var(--font-weight-bold, 600);
      text-align: center;
    }
    .link {
      font-family: ui-monospace, monospace;
      font-size: var(--font-size-xs, 12px);
      color: var(--color-text-muted, #576f65);
      word-break: break-all;
      text-align: center;
      max-inline-size: 100%;
    }
    .btn-row { display: flex; gap: var(--space-sm, 8px); inline-size: 100%; }
    .c-btn--grow { flex: 1; }
  `];

  willUpdate(changed) {
    if (changed.has('url')) this._encode();
  }

  updated(changed) {
    if (changed.has('_open')) {
      const dlg = this.renderRoot?.querySelector('dialog');
      if (!dlg) return;
      if (this._open && !dlg.open) dlg.showModal();
      else if (!this._open && dlg.open) dlg.close();
    }
  }

  async _encode() {
    const url = this.url;
    const seq = ++this._seq;
    if (!url) { this._matrix = null; this._failed = false; this._open = false; this._wantOpen = false; return; }
    try {
      const matrix = await encodeQr(url);
      if (seq !== this._seq) return;          // a newer url superseded this one
      this._matrix = matrix;
      this._failed = false;
      if (this._wantOpen) { this._wantOpen = false; this._open = true; }
    } catch {
      if (seq !== this._seq) return;
      this._matrix = null;
      this._failed = true;                    // encoder chunk unreachable (offline)
    }
  }

  // Public: open the enlarged view from somewhere else in the UI (the output
  // bar's QR button). Tolerates being called mid-encode — the dialog opens as
  // soon as the matrix lands.
  expand() {
    if (this._matrix) this._open = true;
    else if (this.url) this._wantOpen = true;
  }

  _openDialog() { if (this._matrix) this._open = true; }
  _closeDialog() { this._open = false; }
  _onBackdropClick(e) { if (e.target === e.currentTarget) this._closeDialog(); }

  async _download() {
    if (!this._matrix) return;
    try {
      const blob = await matrixToPngBlob(this._matrix);
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href, download: QR_FILENAME });
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch { /* canvas unavailable — the on-screen code still works */ }
  }

  _svg(m) {
    const side = fullSize(m.size);
    return svg`<svg viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label=${t('qr.imgAlt')}><path d=${matrixToPath(m)}></path></svg>`;
  }

  render() {
    if (!this.url) return nothing;
    if (this._failed) return html`<p class="unavailable">${t('qr.unavailable')}</p>`;

    const m = this._matrix;
    const tileStyle = `--qr-size:${this.size}px`;
    const tile = this.tileless
      ? nothing
      : m
      ? (this.expandable
          ? html`<button class="tile" type="button" style=${tileStyle} title=${t('qr.enlarge')} aria-label=${t('qr.enlargeAria')} @click=${this._openDialog}>${this._svg(m)}</button>`
          : html`<div class="tile" style=${tileStyle}>${this._svg(m)}</div>`)
      : html`<div class="tile pending" style=${tileStyle} aria-hidden="true"></div>`;

    return html`
      ${tile}
      ${(this.expandable || this.tileless) && m ? html`
        <dialog @close=${this._closeDialog} @cancel=${this._closeDialog} @click=${this._onBackdropClick}>
          <div class="frame">
            <div class="caption">${t('qr.caption')}</div>
            <div class="big">${this._svg(m)}</div>
            <div class="link" dir="ltr">${this.url}</div>
            <div class="btn-row">
              <button class="c-btn c-btn--primary c-btn--grow" type="button" @click=${this._download}>${t('qr.download')}</button>
              <button class="c-btn c-btn--secondary" type="button" @click=${this._closeDialog}>${t('qr.close')}</button>
            </div>
          </div>
        </dialog>
      ` : nothing}
    `;
  }
}

customElements.define('qr-code', QrCode);
