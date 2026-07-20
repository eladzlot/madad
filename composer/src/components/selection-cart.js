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

export class SelectionCart extends LitElement {
  static properties = {
    entries:  { type: Array },     // [{ id, title }] in order
    url:      { type: String },
    pid:      { type: String },
    copied:   { type: Boolean },
    canShare: { type: Boolean },
    _dragIndex: { type: Number, state: true },
  };

  constructor() {
    super();
    this.entries = [];
    this.url = null;
    this.pid = '';
    this.copied = false;
    this.canShare = false;
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

    /* The output rail is theme-independent dark navy chrome; its fields carry
       the original slate palette (composer.css legacy .c-output.*) so they hold
       in both light and dark mode. */
    .section-label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7AABBD;
      margin-block-end: var(--space-xs, 4px);
    }
    .hint {
      font-size: var(--font-size-xs, 12px);
      color: #6898B0;
      margin-block-end: var(--space-sm, 8px);
    }

    .url-box {
      font-family: ui-monospace, monospace;
      font-size: var(--font-size-xs, 12px);
      background: #2A3D52;
      border: var(--border-width, 1px) solid #2A3D52;
      color: #A8CFDF;
      border-radius: var(--radius-sm, 6px);
      padding: var(--space-sm, 8px);
      word-break: break-all;
      max-block-size: 84px;
      overflow-y: auto;
    }
    .url-box.empty { color: rgba(168, 207, 223, 0.6); }

    .btn-row { display: flex; gap: var(--space-sm, 8px); margin-block-start: var(--space-sm, 8px); }
    .c-btn--grow { flex: 1; }

    /* Secondary actions (↗ open, שתף share) sit on the dark rail, not the page. */
    .c-btn--secondary {
      background: #2A3D52;
      border-color: #304860;
      color: #A8CFDF;
    }
    .c-btn--secondary:not(:disabled):hover {
      border-color: var(--color-accent, #2BB3C0);
      color: var(--color-accent, #2BB3C0);
    }

    input.pid {
      inline-size: 100%;
      min-block-size: var(--item-min-touch, 44px);
      padding-inline: var(--space-md, 16px);
      border: var(--border-width, 1px) solid #304860;
      border-radius: var(--radius-sm, 6px);
      background: #2A3D52;
      color: #C0D4E4;
      font-family: inherit;
      font-size: var(--font-size-md, 16px);
    }
    input.pid::placeholder { color: rgba(168, 207, 223, 0.5); }
    input.pid:focus { outline: none; border-color: var(--color-accent, #2BB3C0); }

    ol { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    li.item {
      display: flex;
      align-items: center;
      gap: 2px;
      background: #2A3D52;
      border: var(--border-width, 1px) solid #304860;
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
      color: #C0D4E4;
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
      color: rgba(168, 207, 223, 0.7);
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
      color: #7AABBD;
    }
  `];

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
    const hasUrl = !!this.url;
    const count = this.entries?.length ?? 0;

    return html`
      <div class="output-section">
        <div class="section-label">קישור למטופל</div>
        <div class="url-box ${hasUrl ? '' : 'empty'}" dir="ltr" aria-label="קישור שנוצר">
          ${hasUrl ? this.url : 'לא נבחרו שאלונים'}
        </div>
        <div class="btn-row">
          <button class="c-btn c-btn--primary c-btn--grow ${this.copied ? 'c-btn--copied' : ''}"
            ?disabled=${!hasUrl} @click=${() => this._emit('copy')}>
            ${this.copied ? 'הועתק ✓' : 'העתק קישור'}
          </button>
          <button class="c-btn c-btn--secondary c-btn--sm" title="פתח קישור"
            ?disabled=${!hasUrl} @click=${() => this._emit('open')}>↗</button>
          ${this.canShare ? html`
            <button class="c-btn c-btn--secondary c-btn--sm"
              ?disabled=${!hasUrl} @click=${() => this._emit('share')}>שתף</button>
          ` : nothing}
        </div>
      </div>

      <div class="output-section">
        <label class="section-label" for="cart-pid">מזהה מטופל</label>
        <p class="hint">אופציונלי — יופיע בדוח PDF בלבד</p>
        <input class="pid" id="cart-pid" type="text" dir="ltr"
          placeholder="TRC-2025-000123" .value=${this.pid ?? ''}
          aria-label="מזהה מטופל" autocomplete="off" spellcheck="false" @input=${this._onPid} />
      </div>

      <div class="output-section">
        <div class="section-label">נבחרו ${count > 0 ? `(${count})` : ''}</div>
        ${count > 0 ? html`
          <p class="hint">גרור או השתמש ב-↑↓ לשינוי הסדר</p>
          <ol>${this.entries.map((e, i) => this._renderItem(e, i, count))}</ol>
        ` : html`<p class="empty-cart">בחרו שאלונים כדי לבנות קישור.</p>`}
      </div>
    `;
  }
}

customElements.define('selection-cart', SelectionCart);
