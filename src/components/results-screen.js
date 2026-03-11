import { LitElement, html, css } from 'lit';

/**
 * <results-screen>
 *
 * Shown after patient confirms they are done. Navigation is locked.
 *
 * Properties:
 *   results  {Array<{ title: string, total: number|null }>}
 *
 * Events:
 *   download-pdf  CustomEvent  — patient taps download (not yet implemented)
 */
export class ResultsScreen extends LitElement {
  static properties = {
    results: { type: Array },
  };

  static styles = css`
    :host {
      display: block;
    }

    .title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      margin-block-end: var(--space-lg);
      line-height: var(--line-height-tight);
    }

    .scores {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      margin-block-end: var(--space-xl);
    }

    .score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-block: var(--space-md);
      padding-inline: var(--space-md);
      background: var(--color-surface);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-md);
      gap: var(--space-md);
    }

    .score-name {
      font-size: var(--font-size-md);
      color: var(--color-text);
      flex: 1;
    }

    .score-value {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .score-value.no-score {
      color: var(--color-text-muted);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-normal);
    }

    .pdf-btn {
      display: block;
      width: 100%;
      min-block-size: var(--item-min-touch);
      padding-block: var(--space-sm);
      background: var(--color-surface);
      color: var(--color-text-muted);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      font-family: inherit;
      cursor: not-allowed;
      opacity: 0.6;
    }
  `;

  constructor() {
    super();
    this.results = [];
  }

  render() {
    return html`
      <h1 class="title">תוצאות</h1>

      <div class="scores">
        ${this.results.map(r => html`
          <div class="score-row">
            <span class="score-name">${r.title}</span>
            <span class="${r.total != null ? 'score-value' : 'score-value no-score'}">
              ${r.total != null ? r.total : '—'}
            </span>
          </div>
        `)}
      </div>

      <button class="pdf-btn" disabled aria-disabled="true">
        הורד דוח PDF — בקרוב
      </button>
    `;
  }
}

customElements.define('results-screen', ResultsScreen);
