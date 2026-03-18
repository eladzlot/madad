import { LitElement, html, css } from 'lit';

/**
 * <welcome-screen>
 *
 * Shown before the session starts. Collects patient name and fires
 * 'begin' when the patient is ready.
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
    _name: { type: String, state: true },
  };

  static styles = css`
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
      gap: var(--space-lg);
    }

    .app-name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-muted);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .battery-title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
    }

    .intro {
      font-size: var(--font-size-md);
      color: var(--color-text-muted);
      line-height: var(--line-height);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
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
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    input::placeholder {
      color: var(--color-text-muted);
    }

    .begin-btn {
      display: block;
      width: 100%;
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

    .begin-btn:hover {
      background: var(--color-primary-hover);
    }

    .begin-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }
  `;

  constructor() {
    super();
    this.batteryTitle = '';
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
    const safeName = this._name.trim().replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    this.dispatchEvent(new CustomEvent('begin', {
      detail: { name: safeName },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="card">
        <span class="app-name">Measure</span>

        ${this.batteryTitle ? html`
          <h1 class="battery-title">${this.batteryTitle}</h1>
        ` : ''}

        <p class="intro">
          אנא מלא את השאלון הבא. התשובות שלך יסייעו לצוות המטפל.
        </p>

        <div class="field">
          <label for="patient-name">שם מלא</label>
          <input
            id="patient-name"
            type="text"
            placeholder="הכנס שמך"
            .value=${this._name}
            @input=${this._onInput}
            @keydown=${this._onKeyDown}
            autocomplete="name"
          />
        </div>

        <button class="begin-btn" @click=${this._begin}>
          התחל
        </button>
      </div>
    `;
  }
}

customElements.define('welcome-screen', WelcomeScreen);
