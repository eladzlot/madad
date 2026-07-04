// <pid-filter> — narrows the view to one patient ID.
//
// pid is a filter, not a grouping primitive (AGGREGATE_SPEC §4): the default
// charts every uploaded PDF; the clinician narrows when needed. Options are
// every distinct pid seen, plus "all" and — when applicable — "no pid".

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
    }

    span { color: var(--color-text-muted, #78716c); font-size: var(--font-size-sm, .875rem); }

    button {
      border: 1px solid var(--color-border, #d6d3d1);
      background: var(--color-surface, #fff);
      border-radius: 999px;
      padding: .25rem .8rem;
      font-size: var(--font-size-sm, .875rem);
      cursor: pointer;
      color: var(--color-text, #1c1917);
    }

    button[aria-pressed='true'] {
      background: var(--color-accent, #0d9488);
      border-color: var(--color-accent, #0d9488);
      color: #fff;
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
      <span>מטופל:</span>
      ${this._chip(PID_ALL, 'הכול')}
      ${this.pids.map(pid => this._chip(pid, pid, 'pid'))}
      ${this.hasUnidentified ? this._chip(PID_NONE, 'ללא מזהה') : ''}
    `;
  }
}

customElements.define('pid-filter', PidFilter);
