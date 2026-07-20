// <mobile-bar> — the mobile selection surface (the cart has no room on phones).
//
// A sticky bottom bar shows "נבחרו N" and the primary share/copy action; tapping
// it opens a bottom sheet with the same output the desktop cart carries: the
// ordered selection (reorder + remove), the patient-ID field, the generated
// link, and reset. Emits the identical events as <selection-cart> so
// <composer-app> handles both surfaces through one path:
//   reorder { from, to } · remove { id } · pid-change { pid }
//   copy · share · open · reset
//
// The sheet's reorder is the "mobile de-scope valve" checkpoint in the plan: if
// it proves too cramped in the mobile demo, ↑/↓ can be dropped for phones while
// the rest stays.

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';

export class MobileBar extends LitElement {
  static properties = {
    entries:  { type: Array },
    url:      { type: String },
    pid:      { type: String },
    copied:   { type: Boolean },
    canShare: { type: Boolean },
    _open:    { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.entries = [];
    this.url = null;
    this.pid = '';
    this.copied = false;
    this.canShare = false;
    this._open = false;
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
      background: var(--clin-header-bg, #1B3148);
      border-block-start: var(--border-width, 1px) solid rgba(255,255,255,0.12);
    }
    .count { flex: 1; color: #fff; font-size: var(--font-size-sm, 14px); }
    .count.muted { color: rgba(255,255,255,0.6); }

    .backdrop {
      position: fixed; inset: 0; z-index: 45;
      background: rgba(0,0,0,0.4);
    }
    .sheet {
      position: fixed;
      inset-inline: 0;
      inset-block-end: 0;
      z-index: 50;
      max-block-size: 85dvh;
      overflow-y: auto;
      background: var(--color-surface, #fff);
      border-start-start-radius: var(--radius-lg, 16px);
      border-start-end-radius: var(--radius-lg, 16px);
      padding: var(--space-md, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-lg, 24px);
    }
    .sheet-header { display: flex; align-items: center; justify-content: space-between; }
    .sheet-title { font-weight: var(--font-weight-bold, 600); font-size: var(--font-size-lg, 18px); }

    .section-label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted, #5E7080);
      margin-block-end: var(--space-xs, 4px);
    }

    .url-box {
      font-family: ui-monospace, monospace;
      font-size: var(--font-size-xs, 12px);
      background: var(--color-bg, #F2F4F7);
      border-radius: var(--radius-sm, 6px);
      padding: var(--space-sm, 8px);
      word-break: break-all;
      max-block-size: 84px; overflow-y: auto;
    }

    input.pid {
      inline-size: 100%;
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text, #162232);
      font-family: inherit; font-size: var(--font-size-md, 16px);
    }
    input.pid:focus { outline: none; border-color: var(--color-border-focus, #2BB3C0); }

    ol { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    li.item {
      display: flex; align-items: center; gap: var(--space-xs, 4px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      padding: 6px 8px;
    }
    .item-title { flex: 1; min-inline-size: 0; font-size: var(--font-size-sm, 14px); }
    .icon-btn {
      background: none; border: none; cursor: pointer;
      color: var(--color-text-muted, #5E7080); font-size: 15px; line-height: 1;
      padding: 6px; border-radius: var(--radius-sm, 6px);
    }
    .icon-btn:disabled { opacity: 0.3; }
    .btn-row { display: flex; gap: var(--space-sm, 8px); }
    .c-btn--grow { flex: 1; }
  `];

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
  _onPid(e) { this._emit('pid-change', { pid: e.target.value }); }
  _openSheet() { this._open = true; }
  _closeSheet() { this._open = false; }

  _primary() {
    const hasUrl = !!this.url;
    if (this.canShare) {
      return html`<button class="c-btn c-btn--primary c-btn--sm" ?disabled=${!hasUrl}
        @click=${() => this._emit('share')}>שתף</button>`;
    }
    return html`<button class="c-btn c-btn--primary c-btn--sm ${this.copied ? 'c-btn--copied' : ''}"
      ?disabled=${!hasUrl} @click=${() => this._emit('copy')}>
      ${this.copied ? 'הועתק ✓' : 'העתק קישור'}</button>`;
  }

  _renderItem(entry, i, count) {
    return html`
      <li class="item">
        <span class="item-title">${entry.title ?? entry.id}</span>
        <button class="icon-btn" type="button" aria-label="הזז מעלה"
          ?disabled=${i === 0} @click=${() => this._emit('reorder', { from: i, to: i - 1 })}>↑</button>
        <button class="icon-btn" type="button" aria-label="הזז מטה"
          ?disabled=${i === count - 1} @click=${() => this._emit('reorder', { from: i, to: i + 1 })}>↓</button>
        <button class="icon-btn" type="button" aria-label="הסר"
          @click=${() => this._emit('remove', { id: entry.id })}>✕</button>
      </li>
    `;
  }

  render() {
    const count = this.entries?.length ?? 0;
    const hasUrl = !!this.url;

    return html`
      <div class="bar">
        <span class="count ${count ? '' : 'muted'}">
          ${count ? `נבחרו ${count}` : 'טרם נבחרו שאלונים'}
        </span>
        <button class="c-btn c-btn--secondary c-btn--sm" ?disabled=${!count}
          @click=${this._openSheet}>פרטים</button>
        ${this._primary()}
      </div>

      ${this._open ? html`
        <div class="backdrop" @click=${this._closeSheet}></div>
        <div class="sheet" role="dialog" aria-label="הקישור למטופל" aria-modal="true">
          <div class="sheet-header">
            <span class="sheet-title">הקישור למטופל</span>
            <button class="icon-btn" type="button" aria-label="סגור" @click=${this._closeSheet}>✕</button>
          </div>

          <div>
            <div class="section-label">נבחרו (${count})</div>
            <ol>${this.entries.map((e, i) => this._renderItem(e, i, count))}</ol>
          </div>

          <div>
            <label class="section-label" for="sheet-pid">מזהה מטופל (אופציונלי)</label>
            <input class="pid" id="sheet-pid" type="text" dir="ltr" placeholder="TRC-2025-000123"
              .value=${this.pid ?? ''} autocomplete="off" spellcheck="false" @input=${this._onPid} />
          </div>

          <div>
            <div class="section-label">קישור</div>
            <div class="url-box" dir="ltr">${hasUrl ? this.url : 'לא נבחרו שאלונים'}</div>
            <div class="btn-row" style="margin-block-start: var(--space-sm, 8px)">
              <button class="c-btn c-btn--primary c-btn--grow ${this.copied ? 'c-btn--copied' : ''}"
                ?disabled=${!hasUrl} @click=${() => this._emit('copy')}>
                ${this.copied ? 'הועתק ✓' : 'העתק קישור'}</button>
              <button class="c-btn c-btn--secondary c-btn--sm" ?disabled=${!hasUrl}
                @click=${() => this._emit('open')}>↗</button>
            </div>
            <div class="btn-row" style="margin-block-start: var(--space-sm, 8px)">
              <button class="c-btn c-btn--ghost c-btn--sm" @click=${() => this._emit('reset')}>↺ איפוס</button>
            </div>
          </div>
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('mobile-bar', MobileBar);
