// <upload-list> — file intake for the Aggregate surface.
//
// The base mechanism is a plain <input type="file" multiple>; drag-and-drop
// is a desktop enhancement layered on top (AGGREGATE_SPEC §1.2 — mobile is
// not optimized for, but must not be broken). Per-file statuses come from
// the store and render below the drop zone; a failed file never blocks
// the others (§5.7).

import { LitElement, html, css } from 'lit';

const STATUS_LABELS = {
  'ok':                  'נקלט',
  'not-pdf':             'לא קובץ PDF',
  'no-attachment':       'לא דוח מדד — אין נתונים מוטמעים',
  'unsupported-version': 'נוצר בגרסה חדשה יותר של מדד',
  'malformed':           'קובץ פגום',
};

export class UploadList extends LitElement {
  static properties = {
    files:     { type: Array },    // store.files: [{ name, status, detail }]
    _dragOver: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--font-family, system-ui, sans-serif);
    }

    .zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, .5rem);
      padding: var(--space-lg, 1.5rem);
      border: 2px dashed var(--color-border, #D5DAE2);
      border-radius: var(--radius-md, 12px);
      background: var(--a-card-bg, #fff);
      text-align: center;
      transition: border-color var(--transition-fast, .15s), background var(--transition-fast, .15s);
    }

    .zone.over {
      border-color: var(--color-selected-border, #2BB3C0);
      background: var(--color-selected-bg, #E4F6F8);
    }

    .zone p {
      margin: 0;
      color: var(--color-text-muted, #5E7080);
      font-size: var(--font-size-sm, .875rem);
    }

    label {
      display: inline-block;
      padding: .5rem 1.25rem;
      border-radius: var(--radius-sm, 6px);
      background: var(--color-primary, #1A9FAD);
      color: var(--color-primary-text, #fff);
      font-weight: var(--font-weight-bold, 600);
      cursor: pointer;
      transition: background var(--transition-fast, .15s);
    }

    label:hover {
      background: var(--color-primary-hover, #148090);
    }

    input[type='file'] {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      overflow: hidden;
    }

    ul {
      list-style: none;
      margin: var(--space-sm, .5rem) 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    li {
      display: flex;
      justify-content: space-between;
      gap: var(--space-sm, .5rem);
      padding: .35rem .6rem;
      border-radius: var(--radius-sm, 6px);
      font-size: var(--font-size-sm, .875rem);
      background: var(--a-card-bg, #fff);
      border: 1px solid var(--color-border, #D5DAE2);
    }

    li .name {
      direction: ltr;
      unicode-bidi: plaintext;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    li .status { flex-shrink: 0; }
    li.ok .status { color: var(--color-yes, #276749); }
    li.failed { background: var(--color-no-bg, #FDF3F3); }
    li.failed .status { color: var(--color-no, #8B3A3A); }
  `;

  constructor() {
    super();
    this.files = [];
    this._dragOver = false;
  }

  _emitFiles(fileList) {
    const files = [...fileList].filter(f => f.size > 0);
    if (files.length === 0) return;
    this.dispatchEvent(new CustomEvent('files-selected', { detail: { files }, bubbles: true, composed: true }));
  }

  _onInput(e) {
    this._emitFiles(e.target.files);
    e.target.value = '';   // allow re-selecting the same file
  }

  _onDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    this._emitFiles(e.dataTransfer.files);
  }

  render() {
    return html`
      <div
        class="zone ${this._dragOver ? 'over' : ''}"
        @dragover=${(e) => { e.preventDefault(); this._dragOver = true; }}
        @dragleave=${() => { this._dragOver = false; }}
        @drop=${this._onDrop}
      >
        <label>
          בחירת קבצי PDF
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf"
            @change=${this._onInput}
          />
        </label>
        <p>או גררו לכאן דוחות מדד של המטופל</p>
      </div>

      ${this.files.length ? html`
        <ul>
          ${this.files.map(f => html`
            <li class=${f.status === 'ok' ? 'ok' : 'failed'}>
              <span class="name">${f.name}</span>
              <span class="status" title=${f.detail ?? ''}>
                ${STATUS_LABELS[f.status] ?? f.status}
              </span>
            </li>
          `)}
        </ul>
      ` : ''}
    `;
  }
}

customElements.define('upload-list', UploadList);
