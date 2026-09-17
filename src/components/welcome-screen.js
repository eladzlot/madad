import { LitElement, html, css } from 'lit';
import { t } from '../i18n/index.js';
import { resetCSS } from '../styles/reset.js';
import { stripBidi } from '../../shared/text-hygiene.js';

/**
 * <welcome-screen>
 *
 * Shown before the session starts. Collects patient name and fires
 * 'begin' when the patient is ready.
 *
 * Properties:
 *   batteryTitle  {string}   — title of the battery about to be administered
 *   collectName   {boolean}  — render the name field (default true). When
 *                              false the field is absent and `begin` carries
 *                              name: '' — for deployments that identify the
 *                              patient by the link alone.
 *
 * Events:
 *   begin  CustomEvent({ detail: { name: string } })
 */
export class WelcomeScreen extends LitElement {
  static properties = {
    batteryTitle: { type: String },
    collectName:  { type: Boolean },
    _name: { type: String, state: true },
  };

  static styles = [resetCSS, css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 100dvh;
      align-items: center;
      justify-content: center;
      background: var(--color-bg);
      /* No padding on :host — main.css's universal reset targets the host
         element from the document scope, and outer-scope rules beat :host
         rules regardless of specificity. The gutter lives on .card. */
    }

    .card {
      width: 100%;
      max-width: var(--content-max-width);
      padding-inline: var(--space-md);
      display: flex;
      flex-direction: column;
    }

    /* ── Brand mark ─────────────────────────────────────────────────── */

    .app-name {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary-ink);
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

    /* Remote deployment: the disclosure is a requirement (REMOTE_SPEC §8.1). */
    .disclosure {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: var(--line-height);
      margin-block-start: calc(-1 * var(--space-lg));
      margin-block-end: var(--space-xl);
      padding-inline-start: var(--space-sm);
      border-inline-start: 3px solid var(--color-border-focus);
    }

    /* ── Name field ─────────────────────────────────────────────────── */

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      margin-block-end: var(--space-md);
    }

    label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
    }

    input {
      block-size: var(--item-min-touch);
      padding-inline: var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      font-size: var(--font-size-md);
      font-family: inherit;
      color: var(--color-text);
      transition: border-color var(--transition-fast);
      width: 100%;
    }

    input:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    input::placeholder {
      color: var(--color-text-muted);
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
    this.collectName = true;
    this._name = '';
  }

  _onInput(e) {
    // Cap name length at the component level so oversized values never reach the PDF
    this._name = e.target.value.slice(0, 200);
  }

  _onKeyDown(e) {
    if (e.key === 'Enter') this._begin();
  }

  _begin() {
    // Strip Unicode BiDi control characters before emitting the name.
    // These can cause misleading visual rendering in PDF documents.
    // Shared with the envelope read path — see shared/text-hygiene.js.
    const safeName = this.collectName ? stripBidi(this._name.trim()) : '';
    this.dispatchEvent(new CustomEvent('begin', {
      detail: { name: safeName },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="card">
        <span class="app-name">${t('welcome.appName')}</span>
        <span class="app-tagline">${t('welcome.tagline')}</span>

        ${this.batteryTitle ? html`
          <h1 class="battery-title">${this.batteryTitle}</h1>
        ` : ''}

        <p class="intro">${t('welcome.intro')}</p>
        <!-- Trial only: the patient is told where the answers go, because on
             this deployment they leave the device (REMOTE_SPEC §5.1). -->
        <p class="disclosure">${t('welcome.disclosure')}</p>

        ${this.collectName ? html`
          <div class="field">
            <label for="patient-name">${t('welcome.nameLabel')}</label>
            <input
              id="patient-name"
              type="text"
              placeholder=${t('welcome.namePlaceholder')}
              .value=${this._name}
              @input=${this._onInput}
              @keydown=${this._onKeyDown}
              autocomplete="name"
            />
          </div>
        ` : ''}

        <button class="begin-btn" @click=${this._begin}>
          ${t('welcome.begin')}
        </button>
      </div>
    `;
  }
}

customElements.define('welcome-screen', WelcomeScreen);
