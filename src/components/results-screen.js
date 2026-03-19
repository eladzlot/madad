import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

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
    results:  { type: Array },
    canShare: { type: Boolean },
    loading:  { type: Boolean },
  };

  static styles = [resetCSS, css`
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
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: none;
      border-radius: var(--radius-pill);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      font-family: inherit;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .pdf-btn:not(:disabled):hover {
      background: var(--color-primary-hover);
    }

    .pdf-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }

    .pdf-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `];

  constructor() {
    super();
    this.results  = [];
    this.canShare = false;
    this.loading  = false;
    this.onDownload = null;
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

      <button
        class="pdf-btn"
        ?disabled=${this.loading}
        @click=${this._handleDownload}
      >
        ${this.loading
          ? 'מכין דוח...'
          : this.canShare ? 'שתף דוח PDF' : 'הורד דוח PDF'}
      </button>
    `;
  }
  async _handleDownload() {
    if (!this.onDownload || this.loading) return;
    this.loading = true;
    try {
      await this.onDownload();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      this.loading = false;
    }
  }
}

customElements.define('results-screen', ResultsScreen);
