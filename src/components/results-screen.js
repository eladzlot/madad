import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <results-screen>
 *
 * Shown after patient confirms they are done. Navigation is locked.
 *
 * Properties:
 *   results  {Array<{ title: string, total: number|null, category: string|null }>}
 *
 * Events:
 *   download-pdf  CustomEvent  — patient taps download (not yet implemented)
 */
export class ResultsScreen extends LitElement {
  static properties = {
    results:  { type: Array },
    canShare: { type: Boolean },
    loading:  { type: Boolean, state: true },
  };

  static styles = [resetCSS, css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 100%;
    }

    /* ── Header ─────────────────────────────────────────────────────── */

    .header {
      padding-block-end: var(--space-lg);
      border-block-end: var(--border-width) solid var(--color-border);
      margin-block-end: var(--space-lg);
    }

    .eyebrow {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      color: var(--color-accent);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-block-end: var(--space-xs);
    }

    .title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
    }

    /* ── Score rows ──────────────────────────────────────────────────── */

    .scores {
      flex: 1;
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

    .score-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .score-name {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .score-category {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .score-value {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
      flex-shrink: 0;
      min-inline-size: 2.5ch;
      text-align: center;
    }

    .score-value.no-score {
      color: var(--color-text-muted);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-normal);
    }

    /* ── Action buttons ──────────────────────────────────────────────── */

    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      position: sticky;
      bottom: var(--space-lg);
    }

    .pdf-btn {
      display: block;
      width: 100%;
      min-block-size: var(--item-min-touch);
      padding-block: var(--space-sm);
      border-radius: var(--radius-pill);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      border: none;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .pdf-btn--primary {
      background: var(--color-primary);
      color: var(--color-primary-text);
    }

    .pdf-btn--primary:not(:disabled):hover {
      background: var(--color-primary-hover);
    }

    .pdf-btn--secondary {
      background: transparent;
      color: var(--color-primary);
      border: var(--border-width) solid var(--color-primary);
    }

    .pdf-btn--secondary:not(:disabled):hover {
      background: var(--color-selected-bg);
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
    this.results    = [];
    this.canShare   = false;
    this.loading    = false;
    this.onDownload = null;
    this.onShare    = null;
  }

  render() {
    return html`
      <div class="header">
        <p class="eyebrow">סיכום הערכה</p>
        <h1 class="title">התוצאות שלך</h1>
      </div>

      <div class="scores">
        ${this.results.map(r => html`
          <div class="score-row">
            <div class="score-info">
              <span class="score-name">${r.title}</span>
              ${r.category ? html`
                <span class="score-category">${r.category}</span>
              ` : ''}
            </div>
            <span class="${r.total != null ? 'score-value' : 'score-value no-score'}">
              ${r.total != null ? (Number.isInteger(r.total) ? r.total : r.total.toFixed(1)) : '—'}
            </span>
          </div>
        `)}
      </div>

      <div class="actions">
        ${this.canShare ? html`
          <button
            class="pdf-btn pdf-btn--primary"
            ?disabled=${this.loading}
            @click=${this._handleShare}
          >
            ${this.loading ? 'מכין דוח...' : 'שתף דוח PDF'}
          </button>
          <button
            class="pdf-btn pdf-btn--secondary"
            ?disabled=${this.loading}
            @click=${this._handleDownload}
          >
            הורד דוח PDF
          </button>
        ` : html`
          <button
            class="pdf-btn pdf-btn--primary"
            ?disabled=${this.loading}
            @click=${this._handleDownload}
          >
            ${this.loading ? 'מכין דוח...' : 'הורד דוח PDF'}
          </button>
        `}
      </div>
    `;
  }

  async _handleShare() {
    if (!this.onShare || this.loading) return;
    this.loading = true;
    try {
      await this.onShare();
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      this.loading = false;
    }
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
