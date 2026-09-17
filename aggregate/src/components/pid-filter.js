// <pid-filter> — narrows the view to one patient ID.
//
// pid is a filter, not a grouping primitive (AGGREGATE_SPEC §4): the default
// charts every uploaded PDF; the clinician narrows when needed. Options are
// every distinct pid seen, plus "all" and — when applicable — "no pid".

import { t } from '../../../clinician/i18n/index.js';
import { LitElement, html, css } from 'lit';
import { PID_ALL, PID_NONE } from '../store.js';

export class PidFilter extends LitElement {
  static properties = {
    pids:            { type: Array },     // distinct pids from the store
    hasUnidentified: { type: Boolean },   // any session without a pid?
    value:           { type: String },
  };

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-sm, .5rem);
      flex-wrap: wrap;
      font-family: var(--font-family, system-ui, sans-serif);
    }

    span { color: var(--color-text-muted, #576f65); font-size: var(--font-size-sm, .875rem); }

    button {
      border: 1px solid var(--color-border, #bae4d2);
      background: var(--clin-card-bg, #FFFFFF);
      border-radius: var(--radius-pill, 999px);
      padding: .25rem .8rem;
      font-size: var(--font-size-sm, .875rem);
      font-family: inherit;
      cursor: pointer;
      color: var(--color-text, #0b281e);
      transition: border-color var(--transition-fast, .15s), background var(--transition-fast, .15s);
    }

    button[aria-pressed='true'] {
      background: var(--color-selected-bg, #dbfad6);
      border-color: var(--color-selected-border, #5aa053);
      color: var(--color-text, #0b281e);
      font-weight: var(--font-weight-bold, 600);
    }

    .pid { direction: ltr; unicode-bidi: plaintext; }
  `;

  constructor() {
    super();
    this.pids = [];
    this.hasUnidentified = false;
    this.value = PID_ALL;
  }

  _select(value) {
    this.dispatchEvent(new CustomEvent('pid-change', { detail: { value }, bubbles: true, composed: true }));
  }

  _chip(value, label, cls = '') {
    return html`
      <button
        class=${cls}
        aria-pressed=${this.value === value ? 'true' : 'false'}
        @click=${() => this._select(value)}
      >${label}</button>
    `;
  }

  render() {
    return html`
      <span>${t('filter.patient')}</span>
      ${this._chip(PID_ALL, t('filter.all'))}
      ${this.pids.map(pid => this._chip(pid, pid, 'pid'))}
      ${this.hasUnidentified ? this._chip(PID_NONE, t('filter.none')) : ''}
    `;
  }
}

customElements.define('pid-filter', PidFilter);
