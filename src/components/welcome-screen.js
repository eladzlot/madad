import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';

/**
 * <welcome-screen>
 *
 * Shown before the session starts. Fires 'begin' when the patient is ready.
 *
 * CTR POC: the name field is gone — this instance identifies sessions by the
 * id in the link and never asks the patient who they are. 'begin' still
 * carries a name so the rest of the pipeline is untouched; it is always ''.
 *
 * Properties:
 *   batteryTitle  {string}  — title of the battery about to be administered
 *
 * Events:
 *   begin  CustomEvent({ detail: { name: string } })
 */
export class WelcomeScreen extends LitElement {
  static properties = {
    batteryTitle: { type: String },
  };

  static styles = [resetCSS, css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 100dvh;
      align-items: center;
      justify-content: center;
      background: var(--color-bg);
      padding-inline: var(--space-md);
    }

    .card {
      width: 100%;
      max-width: var(--content-max-width);
      display: flex;
      flex-direction: column;
    }

    /* ── Brand mark ─────────────────────────────────────────────────── */

    .app-name {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
      line-height: 1;
      margin-block-end: var(--space-xs);
      letter-spacing: -0.02em;
    }

    .app-tagline {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      margin-block-end: var(--space-2xl);
    }

    /* ── Battery title ──────────────────────────────────────────────── */

    .battery-title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
      margin-block-end: var(--space-sm);
    }

    .intro {
      font-size: var(--font-size-md);
      color: var(--color-text-muted);
      line-height: var(--line-height);
      margin-block-end: var(--space-xl);
    }

    /* ── CTA ────────────────────────────────────────────────────────── */

    .begin-btn {
      display: block;
      width: 100%;
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
    }

    .begin-btn:hover {
      background: var(--color-primary-hover);
    }

    .begin-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }
  `];

  constructor() {
    super();
    this.batteryTitle = '';
  }

  _begin() {
    this.dispatchEvent(new CustomEvent('begin', {
      detail: { name: '' },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="card">
        <span class="app-name">מדד · CTR</span>
        <span class="app-tagline">הערכה קלינית דיגיטלית</span>

        ${this.batteryTitle ? html`
          <h1 class="battery-title">${this.batteryTitle}</h1>
        ` : ''}

        <p class="intro">
          התשובות שלך יעזרו לצוות המטפל להבין אותך טוב יותר.
        </p>

        <button class="begin-btn" @click=${this._begin}>
          התחל
        </button>
      </div>
    `;
  }
}

customElements.define('welcome-screen', WelcomeScreen);
