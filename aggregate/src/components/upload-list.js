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
    :host { display: block; }

    .zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, .5rem);
      padding: var(--space-lg, 1.5rem);
      border: 2px dashed var(--color-border, #d6d3d1);
      border-radius: 10px;
      background: var(--color-surface, #fff);
      text-align: center;
      transition: border-color .15s, background .15s;
    }

    .zone.over {
      border-color: var(--color-accent, #0d9488);
      background: #0d948810;
    }

    .zone p {
      margin: 0;
      color: var(--color-text-muted, #78716c);
      font-size: var(--font-size-sm, .875rem);
    }

    label {
      display: inline-block;
      padding: .5rem 1.25rem;
      border-radius: 8px;
      background: var(--color-accent, #0d9488);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
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
      border-radius: 6px;
      font-size: var(--font-size-sm, .875rem);
      background: var(--color-surface, #fff);
    }

    li .name {
      direction: ltr;
      unicode-bidi: plaintext;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    li .status { flex-shrink: 0; }
    li.ok .status { color: var(--color-accent, #0d9488); }
    li.failed { background: #fef2f2; }
    li.failed .status { color: #b91c1c; }
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
