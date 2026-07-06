// <raw-data-list> — instruments whose sessions carry no quantitative total
// (idiographic scales, binary screeners, free text, worksheets). Their data
// is captured in the envelope but not graphed in v1 (AGGREGATE_SPEC §5.5);
// this list makes them visible rather than silently dropped. Per-session
// detail view arrives with the slice-2 detail panel.

import { LitElement, html, css } from 'lit';

export class RawDataList extends LitElement {
  static properties = {
    instruments: { type: Array },   // store.rawInstruments()
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--font-family, system-ui, sans-serif);
    }

    h2 {
      font-size: var(--font-size-md, 1rem);
      color: var(--color-text-muted, #5E7080);
      margin: 0 0 var(--space-sm, .5rem);
    }

    .card {
      background: var(--clin-card-bg, #fff);
      border: 1px solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-md, 12px);
      box-shadow: var(--shadow-sm, none);
      padding: var(--space-md, 1rem);
      margin-block-end: var(--space-sm, .5rem);
    }

    h3 { margin: 0 0 .25rem; font-size: var(--font-size-md, 1rem); }

    p.hint {
      margin: 0 0 .5rem;
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-text-muted, #78716c);
    }

    ul { list-style: none; margin: 0; padding: 0; }

    li {
      display: flex;
      gap: var(--space-md, 1rem);
      font-size: var(--font-size-sm, .875rem);
      padding-block: .15rem;
    }

    .pid { direction: ltr; unicode-bidi: plaintext; color: var(--color-text-muted, #78716c); }
  `;

  constructor() {
    super();
    this.instruments = [];
  }

  render() {
    if (!this.instruments?.length) return html``;
    const fmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
    return html`
      <h2>נתונים ללא ציון מספרי (לא מוצגים בגרף)</h2>
      ${this.instruments.map(inst => html`
        <div class="card">
          <h3>${inst.title}</h3>
          <p class="hint">התשובות המלאות זמינות בקובצי ה-PDF עצמם.</p>
          <ul>
            ${inst.sessions.map(s => html`
              <li>
                <span>${fmt.format(s.date)}</span>
                ${s.pid ? html`<span class="pid">${s.pid}</span>` : ''}
              </li>
            `)}
          </ul>
        </div>
      `)}
    `;
  }
}

customElements.define('raw-data-list', RawDataList);
