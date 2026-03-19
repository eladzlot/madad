import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <completion-screen>
 *
 * Shown after all questions are answered. Patient can still go back.
 * Tapping "צפה בתוצאות" fires 'view-results' and locks navigation.
 *
 * Events:
 *   view-results  CustomEvent  — patient is ready to see results
 */
export class CompletionScreen extends LitElement {
  static styles = [resetCSS, css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 60dvh;
      padding-inline: var(--space-md);
      padding-block: var(--space-2xl);
    }

    /* Pushes content toward the lower third */
    .spacer { flex: 1; }

    .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0;
    }

    .icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--color-selected-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-block-end: var(--space-lg);
    }

    .icon svg {
      width: 36px;
      height: 36px;
      stroke: var(--color-accent);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    .title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
      margin-block-end: var(--space-sm);
    }

    .subtitle {
      font-size: var(--font-size-md);
      color: var(--color-text-muted);
      line-height: var(--line-height);
      max-inline-size: 320px;
      margin-block-end: var(--space-xl);
    }

    .view-btn {
      display: block;
      width: 100%;
      max-inline-size: 340px;
      min-block-size: var(--item-min-touch);
      padding-block: var(--space-sm);
      background: var(--color-primary);
      color: var(--color-primary-text);
      border: none;
      border-radius: var(--radius-pill);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition: background var(--transition-fast);
      margin-block-end: var(--space-lg);
    }

    .view-btn:hover {
      background: var(--color-primary-hover);
    }

    .view-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }

    .back-hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      max-inline-size: 300px;
      padding-block-start: var(--space-md);
      border-block-start: var(--border-width) solid var(--color-border);
      line-height: var(--line-height);
    }
  `];

  _viewResults() {
    this.dispatchEvent(new CustomEvent('view-results', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="spacer"></div>
      <div class="content">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="4 12 9 17 20 7"></polyline>
          </svg>
        </span>
        <h1 class="title">סיימת את השאלון</h1>
        <p class="subtitle">
          תשובותיך נשמרו. תוכל לחזור ולשנות תשובות לפני שתראה את התוצאות.
        </p>
        <button class="view-btn" @click=${this._viewResults}>
          צפה בתוצאות
        </button>
        <p class="back-hint">לאחר צפייה בתוצאות לא ניתן לחזור לשאלות</p>
      </div>
    `;
  }
}

customElements.define('completion-screen', CompletionScreen);
