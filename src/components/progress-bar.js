import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <progress-bar>
 *
 * Display-only. Shows item-level and battery-level progress.
 *
 * Properties:
 *   itemProgress     { current: number, total: number|null }
 *   batteryProgress  { current: number, total: number|null }
 *   questionnaireName  string
 */
export class ProgressBar extends LitElement {
  static properties = {
    itemProgress:      { type: Object },
    batteryProgress:   { type: Object },
    questionnaireName: { type: String },
  };

  static styles = [resetCSS, css`
    :host {
      display: block;
    }

    .root {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    .top-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    .questionnaire-name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .item-count {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .track {
      block-size: 4px;
      border-radius: 999px;
      background: var(--color-border);
      overflow: hidden;
    }

    .fill {
      block-size: 100%;
      border-radius: 999px;
      background: var(--color-accent);
      transition: inline-size var(--transition-med);
      transform-origin: inline-start;
    }

    .battery-row {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      text-align: center;
    }
  `];

  constructor() {
    super();
    this.itemProgress      = null;
    this.batteryProgress   = null;
    this.questionnaireName = '';
  }

  _fillPercent(progress) {
    if (!progress || progress.total == null || progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  }

  render() {
    const itemPct   = this._fillPercent(this.itemProgress);
    const showTrack = this.itemProgress?.total != null;
    const showItem  = this.itemProgress && this.itemProgress.total != null;
    const showBattery = this.batteryProgress?.total != null
      && this.batteryProgress.total > 1;

    return html`
      <div class="root">
        <div class="top-row">
          ${this.questionnaireName ? html`
            <span class="questionnaire-name">${this.questionnaireName}</span>
          ` : ''}
          ${showItem ? html`
            <span class="item-count">
              שאלה ${this.itemProgress.current} מתוך ${this.itemProgress.total}
            </span>
          ` : ''}
        </div>

        ${showTrack ? html`
          <div class="track" role="progressbar"
            aria-valuenow=${itemPct}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="התקדמות בשאלון">
            <div class="fill" style="inline-size: ${itemPct}%"></div>
          </div>
        ` : ''}

        ${showBattery ? html`
          <div class="battery-row">
            שאלון ${this.batteryProgress.current} מתוך ${this.batteryProgress.total}
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('progress-bar', ProgressBar);
