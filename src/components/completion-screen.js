import { LitElement, html, css } from 'lit';

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
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-block-size: 60dvh;
      gap: var(--space-lg);
      text-align: center;
    }

    .icon {
      font-size: 48px;
      line-height: 1;
    }

    .title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
    }

    .subtitle {
      font-size: var(--font-size-md);
      color: var(--color-text-muted);
      line-height: var(--line-height);
      max-inline-size: 340px;
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
      border-radius: var(--radius-md);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition: background var(--transition-fast);
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
    }
  `;

  _viewResults() {
    this.dispatchEvent(new CustomEvent('view-results', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <span class="icon" aria-hidden="true">✓</span>
      <h1 class="title">סיימת את השאלון</h1>
      <p class="subtitle">
        ניתן לחזור לשאלות קודמות באמצעות כפתור החזרה.
      </p>
      <button class="view-btn" @click=${this._viewResults}>
        צפה בתוצאות
      </button>
      <p class="back-hint">לאחר צפייה בתוצאות לא ניתן לחזור לשאלות</p>
    `;
  }
}

customElements.define('completion-screen', CompletionScreen);
