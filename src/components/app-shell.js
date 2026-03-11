import { LitElement, html, css } from 'lit';

/**
 * <app-shell>
 *
 * Properties:
 *   canGoBack     {boolean}
 *   canGoForward  {boolean}
 *
 * Events:
 *   back     — back button tapped
 *   forward  — forward button tapped
 *
 * Slots:
 *   progress  — header centre content
 *   default   — scrollable item area
 */
export class AppShell extends LitElement {
  static properties = {
    canGoBack:    { type: Boolean },
    canGoForward: { type: Boolean },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 100dvh;
      background: var(--color-bg);
    }

    /* ── Header ─────────────────────────────────────────────────────── */

    .header {
      position: sticky;
      inset-block-start: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding-block: var(--space-sm);
      padding-inline: var(--space-md);
      background: var(--color-bg);
      border-block-end: var(--border-width) solid var(--color-border);
      min-block-size: 52px;
    }

    .nav-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: var(--color-text);
      padding: 0;
      flex-shrink: 0;
      transition: background var(--transition-fast), opacity var(--transition-fast);
    }

    .nav-btn:hover {
      background: var(--color-surface);
    }

    .nav-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }

    .nav-btn[disabled] {
      opacity: 0;
      pointer-events: none;
    }

    .nav-btn svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    .header-progress {
      flex: 1;
      min-width: 0;
    }

    /* ── Content ────────────────────────────────────────────────────── */

    .content {
      flex: 1;
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }

    .content-inner {
      width: 100%;
      max-width: var(--content-max-width);
      margin-inline: auto;
      padding-inline: var(--space-md);
      padding-block: var(--space-lg);
    }
  `;

  constructor() {
    super();
    this.canGoBack    = false;
    this.canGoForward = false;
  }

  _onBack()    { this.dispatchEvent(new CustomEvent('back',    { bubbles: true, composed: true })); }
  _onForward() { this.dispatchEvent(new CustomEvent('forward', { bubbles: true, composed: true })); }

  render() {
    return html`
      <header class="header">
        <button
          class="nav-btn"
          ?disabled=${!this.canGoBack}
          aria-label="חזור לשאלה הקודמת"
          @click=${this._onBack}
        >
          <!-- Chevron up — back (scroll up metaphor) -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 15 12 9 18 15"></polyline>
          </svg>
        </button>

        <div class="header-progress">
          <slot name="progress"></slot>
        </div>

        <button
          class="nav-btn"
          ?disabled=${!this.canGoForward}
          aria-label="עבור לשאלה הבאה"
          @click=${this._onForward}
        >
          <!-- Chevron down — forward (scroll down metaphor) -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </header>

      <main class="content">
        <div class="content-inner">
          <slot></slot>
        </div>
      </main>
    `;
  }
}

customElements.define('app-shell', AppShell);
