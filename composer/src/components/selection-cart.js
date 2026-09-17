// <selection-cart> — the whole clinician panel: settings, selection, output.
//
// One renderer, two hosts: it IS the rail on desktop, and it is the body of the
// mobile sheet on phones. That is where the old duplication dies — before this,
// <selection-cart> and <mobile-bar> were two renderers of one output model, so
// every change to the link surface had to be written twice (docs/TODO.md IDIO-3
// prices exactly that).
//
// One fixed head over one scrolling list, and the order inside the head is
// deliberate:
//   head — the generated link and what you do with it, then the settings chips.
//          Actions lead because the rail's payoff is the link; the chips sit
//          under them because they are attributes *of* that link — language and
//          ID change what it contains — so they read as its metadata rather
//          than as a separate concern. Nothing here moves, ever.
//   body — the picked instruments in session order. The only part that scrolls,
//          so a growing list can never displace anything above it.
//
// The head's footprint never changes. The URL line is clamped to exactly two
// lines (not a minimum — the placeholder wraps to one where a real URL takes
// two, which shifted the block by 3px), and the QR is an icon button onto the
// <qr-code> dialog rather than a 104px tile that appears with the first pick —
// the rail used to jump ~112px the moment a clinician chose anything.
//
// Reordering stays available two ways — drag for the mouse, ↑/↓ buttons for the
// keyboard — both emitting the same `reorder` { from, to }. The arrows are rare
// enough that they reveal on hover or keyboard focus rather than sitting on
// every row permanently; they stay in the DOM and focusable, so the keyboard
// path and the axe audit are unaffected. `compact` turns that off for the
// sheet: a phone has no hover, and the sheet has the room.
//
// Dumb: no clipboard, no navigation, no share. Every action leaves as an event:
//   reorder { from, to } · remove { id } · copy · share · open
//   pid-change { pid } · patient-lang-change { lang } · dropped-dismiss
//     (the last three bubble up from <session-settings>)

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { t } from '../../../clinician/i18n/index.js';
import { DEFAULT_LANG } from '../../../shared/i18n/core.js';
import './session-settings.js';
import './qr-code.js';

export class SelectionCart extends LitElement {
  static properties = {
    entries:     { type: Array },     // [{ id, title }] in order
    url:         { type: String },
    pid:         { type: String },
    patientLang: { type: String },
    langs:       { type: Array },
    dropped:     { type: Array },
    pidWarning:  { type: String },
    recentUids:  { type: Array },    // trial: remembered uids for the datalist
    requirePid:  { type: Boolean },  // trial: the uid is mandatory (REMOTE_SPEC §3)
    copied:      { type: Boolean },
    canShare:    { type: Boolean },
    // Reflected: the :host([compact]) rules below depend on the attribute.
    compact:     { type: Boolean, reflect: true },
    _dragIndex:  { type: Number, state: true },
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
    this.recentUids = [];
    this.requirePid = false;
    this.copied = false;
    this.canShare = false;
    this.compact = false;
    this._dragIndex = -1;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }
    :host([compact]) { block-size: auto; }

    .head { flex-shrink: 0; }

    .output { padding: var(--space-lg, 24px) 20px var(--space-md, 16px); }

    .settings {
      padding: var(--space-md, 16px) 20px;
      border-block: var(--border-width, 1px) solid var(--clin-rail-border, #7b6048);
    }

    .picked {
      flex: 1;
      min-block-size: 0;
      overflow-y: auto;
      padding: var(--space-md, 16px) 20px;
    }
    :host([compact]) .picked { overflow: visible; }

    .section-label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--clin-rail-label, #c8af9b);
      margin-block-end: var(--space-xs, 4px);
    }
    .hint {
      font-size: var(--font-size-xs, 12px);
      color: var(--clin-rail-hint, #bea590);
      margin-block-end: var(--space-sm, 8px);
    }

    /* ── the picked list ── */
    ol { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    li.item {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--clin-rail-field, #3c2d20);
      border: var(--border-width, 1px) solid var(--clin-rail-border, #7b6048);
      border-radius: var(--radius-sm, 6px);
      padding-inline: var(--space-sm, 8px);
      padding-block: 5px;
      cursor: grab;
    }
    :host([compact]) li.item { cursor: default; padding-block: 6px; }
    li.item .item-title { margin-inline-end: var(--space-xs, 4px); }
    li.item.dragging { opacity: 0.5; }
    .order-num {
      flex-shrink: 0;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      background: var(--color-primary, #c37829);
      color: var(--color-primary-text, #311c08);
      font-size: var(--font-size-xs, 12px);
      display: grid;
      place-items: center;
      line-height: 1;
    }
    .item-title {
      flex: 1;
      min-inline-size: 0;
      font-size: var(--font-size-sm, 14px);
      color: var(--clin-rail-text-strong, #f1e6dc);
      /* One line, ellipsis — overrides the reset's overflow-wrap so long titles
         don't wrap and buckle the row. */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      overflow-wrap: normal;
    }

    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: color-mix(in srgb, var(--clin-rail-text, #dbc9b9) 85%, transparent);
      font-size: 14px;
      line-height: 1;
      padding: 3px;
      border-radius: var(--radius-sm, 6px);
    }
    :host([compact]) .icon-btn { font-size: 16px; padding: 6px; }
    .icon-btn:hover:not(:disabled) { color: var(--color-accent, #da924f); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .icon-btn:focus-visible { outline: 2px solid var(--color-border-focus, #c37829); outline-offset: 1px; }

    /* Reordering is rare; removing is not. The arrows fade in on hover or when
       anything in the row takes keyboard focus. Opacity, not display — they
       stay in the tab order and in the accessibility tree either way. */
    .icon-btn--rare { opacity: 0; transition: opacity var(--transition-fast, 120ms ease); }
    li.item:hover .icon-btn--rare,
    li.item:focus-within .icon-btn--rare { opacity: 1; }
    :host([compact]) .icon-btn--rare { opacity: 1; }

    @media (prefers-reduced-motion: reduce) {
      .icon-btn--rare { opacity: 1; }
    }

    .empty-cart {
      font-size: var(--font-size-sm, 14px);
      color: var(--clin-rail-label, #c8af9b);
    }
    .empty-cart .help-link { color: var(--clin-rail-text, #dbc9b9); text-decoration: underline; }
    .empty-cart .help-link:hover { color: var(--clin-rail-text-strong, #f1e6dc); }
    .empty-cart .help-link:focus-visible {
      outline: 2px solid var(--color-border-focus, #c37829);
      outline-offset: 2px;
    }

    /* ── the output block ── */
    /* The link is a receipt, not a control: two lines, clamped, and stripped of
       the fill and border it used to carry. Those made it the only object here
       with an edge, so the actual controls read as text. min-block-size holds
       the foot's height steady whether or not a link exists. */
    .url-line {
      font-family: ui-monospace, monospace;
      font-size: var(--font-size-xs, 12px);
      direction: ltr;
      text-align: start;
      /* --clin-rail-hint is the token the a11y pass tuned to clear 4.5:1 on
         this navy at small sizes; anything dimmer fails WCAG AA at 12px. */
      color: var(--clin-rail-hint, #bea590);
      line-height: 1.4;
      margin-block-end: var(--space-md, 16px);
      /* Exactly two lines, always: 12px x 1.4 x 2. A min-block-size is not
         enough — the placeholder wraps to one line where a real URL takes two,
         and the foot would shift by those 3px on the first pick. */
      block-size: 34px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .url-line.empty { direction: inherit; font-family: inherit; }

    /* One bright action, full width, then the quiet ones beneath it. A single
       row cannot hold a long Hebrew label plus three buttons in 260px. */
    .c-btn--go {
      inline-size: 100%;
      background: var(--color-accent, #da924f);
      color: var(--color-primary-text, #311c08);
      font-weight: var(--font-weight-bold, 600);
    }
    .c-btn--go:not(:disabled):hover { background: var(--color-accent-hover, #e6a973); }
    /* The shared --copied green is tuned for a light page; lift it for navy. */
    .c-btn--go.c-btn--copied {
      background: color-mix(in srgb, var(--color-yes, #276749) 62%, #ffffff);
      color: var(--color-primary-text, #311c08);
    }

    .icon-row { display: flex; gap: var(--space-sm, 8px); margin-block-start: var(--space-sm, 8px); }
    .c-btn--rail {
      /* Equal thirds, or halves where the platform has no Web Share: the row
         spans the same width as the primary above it, so the foot reads as one
         block rather than a button with some offcuts beside it. */
      flex: 1;
      background: var(--clin-rail-field, #3c2d20);
      border-color: var(--clin-rail-border, #7b6048);
      color: var(--clin-rail-text-strong, #f1e6dc);
      padding-inline: var(--space-sm, 8px);
    }
    .c-btn--rail:not(:disabled):hover {
      border-color: var(--color-accent, #da924f);
      color: var(--color-accent, #da924f);
    }
    .c-btn:focus-visible {
      outline: 2px solid var(--color-border-focus, #c37829);
      outline-offset: 2px;
    }
    .icon { inline-size: 17px; block-size: 17px; display: block; }
    .open-icon { font-size: 17px; line-height: 1; }
  `];

  // Public: put the cursor in the uid field, across the shadow boundary. The
  // mobile bar calls this straight after opening the sheet, so the settings
  // element may not have rendered yet — await it before reaching inside.
  async focusPid() {
    const settings = this.renderRoot?.querySelector('session-settings');
    await settings?.updateComplete;
    settings?.focusPid();
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

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
        draggable=${this.compact ? 'false' : 'true'}
        @dragstart=${() => this._dragStart(i)}
        @dragover=${(e) => this._dragOver(e, i)}
        @dragend=${this._dragEnd}
      >
        <span class="order-num" aria-hidden="true">${i + 1}</span>
        <span class="item-title" title=${entry.title ?? entry.id}>${entry.title ?? entry.id}</span>
        <button class="icon-btn icon-btn--rare" type="button" aria-label=${t('cart.moveUp')}
          ?disabled=${i === 0} @click=${() => this._emit('reorder', { from: i, to: i - 1 })}>↑</button>
        <button class="icon-btn icon-btn--rare" type="button" aria-label=${t('cart.moveDown')}
          ?disabled=${i === count - 1} @click=${() => this._emit('reorder', { from: i, to: i + 1 })}>↓</button>
        <button class="icon-btn" type="button" aria-label=${t('cart.remove')}
          @click=${() => this._emit('remove', { id: entry.id })}>✕</button>
      </li>
    `;
  }

  _renderOutput() {
    const hasUrl = !!this.url;
    // On the trial a link needs BOTH a selection and a valid uid, so the
    // placeholder has to say which one is missing — "nothing selected" would be
    // a lie once instruments are picked and only the uid is outstanding.
    const needsPid = this.requirePid && !hasUrl && (this.entries?.length ?? 0) > 0;
    return html`
      <p class="url-line ${hasUrl ? '' : 'empty'}" dir=${hasUrl ? 'ltr' : 'auto'}
         aria-label=${t('cart.linkAria')}>
        ${hasUrl ? this.url : (needsPid ? t('cart.needUid') : t('cart.noSelection'))}
      </p>

      <button
        class="c-btn c-btn--go copy-btn ${this.copied ? 'c-btn--copied' : ''}"
        type="button"
        ?disabled=${!hasUrl}
        @click=${() => this._emit('copy')}
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${this.copied
            ? html`<path d="M20 6 9 17l-5-5"/>`
            : html`<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>`}
        </svg>
        ${this.copied ? t('cart.copied') : t('cart.copy')}
      </button>

      <div class="icon-row">
        <button class="c-btn c-btn--rail qr-btn" type="button"
          title=${t('cart.qr')} aria-label=${t('cart.qr')}
          ?disabled=${!hasUrl}
          @click=${() => this.renderRoot.querySelector('qr-code')?.expand()}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 20h2"/>
          </svg>
        </button>
        <button class="c-btn c-btn--rail open-btn" type="button"
          title=${t('cart.open')} aria-label=${t('cart.open')}
          ?disabled=${!hasUrl} @click=${() => this._emit('open')}>
          <span class="open-icon" aria-hidden="true">↗</span>
        </button>
        ${this.canShare ? html`
          <button class="c-btn c-btn--rail share-btn" type="button"
            ?disabled=${!hasUrl} @click=${() => this._emit('share')}>${t('cart.share')}</button>
        ` : nothing}
      </div>

      ${hasUrl ? html`<qr-code .url=${this.url} size="104" tileless></qr-code>` : nothing}
    `;
  }

  render() {
    const count = this.entries?.length ?? 0;

    return html`
      <div class="head">
        <div class="output">${this._renderOutput()}</div>
        <div class="settings">
          <session-settings
            .pid=${this.pid}
            .patientLang=${this.patientLang}
            .langs=${this.langs}
            .dropped=${this.dropped}
            .pidWarning=${this.pidWarning}
            .recentUids=${this.recentUids}
            .required=${this.requirePid}
          ></session-settings>
        </div>
      </div>

      <div class="picked">
        <div class="section-label">${t('cart.selected')} ${count > 0 ? `(${count})` : ''}</div>
        ${count > 0 ? html`
          ${this.compact ? nothing : html`<p class="hint">${t('cart.reorderHint')}</p>`}
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
