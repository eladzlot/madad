// <session-detail> — slide-in panel with one questionnaire's full detail
// for one session: total, category, subscales, alerts, and every answered
// item (question text + response), plus a download link for the underlying
// PDF — served from the in-memory File the store retained, never fetched.
//
// Scoped to a single questionnaire by design: the panel opens from a chart
// point, and a point belongs to one instrument. Other instruments from the
// same PDF are reachable through their own charts.
//
// Item texts and response labels come from the loaded config questionnaire;
// when the config isn't available (external/legacy configs), items fall
// back to raw id → value pairs — data over silence.
//
// Non-modal: the charts stay usable behind it. Escape or the close button
// dismisses; the host page owns open/close via `session` + 'panel-closed'.

import { LitElement, html, css } from 'lit';

export class SessionDetail extends LitElement {
  static properties = {
    session:         { type: Object },   // { envelope, fileName, file } from store.getSession()
    sessionKey:      { type: String },   // which session entry (instanceId-aware)
    questionnaireId: { type: String },
    questionnaires:  { type: Object },   // Map qId → config questionnaire, may be empty
  };

  static styles = css`
    :host {
      position: fixed;
      inset-block: 0;
      /* RTL page: inline-end is the left edge — the panel slides in there,
         away from the reading start. */
      inset-inline-end: 0;
      inline-size: min(420px, 92vw);
      font-family: var(--font-family, system-ui, sans-serif);
      background: var(--a-card-bg, #fff);
      border-inline-start: 1px solid var(--color-border, #e7e5e4);
      box-shadow: 0 0 24px #00000022;
      padding: var(--space-md, 1rem);
      overflow-y: auto;
      z-index: 10;
      direction: rtl;
      color: var(--color-text, #1c1917);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: var(--space-sm, .5rem);
      margin-block-end: var(--space-sm, .75rem);
    }

    h2 {
      margin: 0;
      font-size: var(--font-size-md, 1rem);
      line-height: var(--line-height-tight, 1.3);
    }

    .meta {
      color: var(--color-text-muted, #78716c);
      font-size: var(--font-size-sm, .875rem);
      margin-block-start: .2rem;
    }

    .meta .pid, .meta .file { direction: ltr; unicode-bidi: plaintext; }

    .close {
      border: none;
      background: none;
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      color: var(--color-text-muted, #78716c);
      padding: .25rem;
    }

    .score-line {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm, .5rem);
      border-block-start: 1px solid var(--color-border, #e7e5e4);
      padding-block-start: var(--space-sm, .75rem);
    }

    .total {
      font-size: var(--font-size-lg, 1.35rem);
      font-weight: var(--font-weight-bold, 600);
      font-variant-numeric: tabular-nums;
    }

    .category { color: var(--color-text-muted, #78716c); }

    ul.subscales {
      list-style: none;
      margin: .4rem 0 0;
      padding: 0;
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-text-muted, #78716c);
    }

    ul.subscales li {
      display: flex;
      justify-content: space-between;
    }

    .alert {
      margin-block-start: .5rem;
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-no, #8B3A3A);
      background: var(--color-no-bg, #FDF3F3);
      border-radius: var(--radius-sm, 6px);
      padding: .3rem .5rem;
    }

    h4 {
      margin: var(--space-md, 1rem) 0 .25rem;
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-text-muted, #78716c);
      font-weight: var(--font-weight-medium, 500);
    }

    ol.items {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    ol.items li {
      padding: .45rem 0;
      border-block-end: 1px solid var(--color-border, #e7e5e4);
      font-size: var(--font-size-sm, .875rem);
    }

    .q-text { color: var(--color-text-muted, #78716c); }

    .q-answer {
      display: flex;
      justify-content: space-between;
      gap: var(--space-sm, .5rem);
      margin-block-start: .15rem;
      color: var(--color-text, #1c1917);
    }

    .q-value { font-variant-numeric: tabular-nums; color: var(--color-text-muted, #78716c); }

    .download {
      display: inline-block;
      margin-block-start: var(--space-md, 1rem);
      padding: .5rem 1rem;
      border-radius: var(--radius-sm, 8px);
      background: var(--color-primary, #1A9FAD);
      color: var(--color-primary-text, #fff);
      font-weight: var(--font-weight-bold, 600);
      text-decoration: none;
    }
  `;

  constructor() {
    super();
    this.session = null;
    this.sessionKey = null;
    this.questionnaireId = null;
    this.questionnaires = new Map();
    this._objectUrl = null;
    this._onKeydown = (e) => {
      if (e.key === 'Escape') this._close();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
    this._revokeUrl();
  }

  willUpdate(changed) {
    if (changed.has('session')) this._revokeUrl();
  }

  updated() {
    // Move focus into the panel when it opens so Escape and screen readers
    // land in context.
    if (this.session) this.shadowRoot.querySelector('.close')?.focus();
  }

  _revokeUrl() {
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = null;
    }
  }

  _downloadUrl() {
    if (!this._objectUrl && this.session?.file && typeof URL.createObjectURL === 'function') {
      this._objectUrl = URL.createObjectURL(this.session.file);
    }
    return this._objectUrl ?? '#';
  }

  _close() {
    this.dispatchEvent(new CustomEvent('panel-closed', { bubbles: true, composed: true }));
  }

  _formatValue(v) {
    if (v == null) return '—';
    return Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
  }

  // ── Item resolution ────────────────────────────────────────────────────────

  // Flattens the questionnaire's item tree (if/then/else and nested arrays)
  // into an id → item-definition map.
  _leafItems(questionnaire) {
    const map = new Map();
    const walk = (nodes) => {
      for (const node of nodes ?? []) {
        if (node.id && node.type && node.type !== 'if') map.set(node.id, node);
        walk(node.then);
        walk(node.else);
        walk(node.items);
      }
    };
    walk(questionnaire?.items);
    return map;
  }

  _answerLabel(item, questionnaire, answer) {
    if (answer == null) return '—';
    const options = item?.options
      ?? questionnaire?.optionSets?.[item?.optionSetId ?? questionnaire?.defaultOptionSetId];
    const labelFor = (v) => options?.find(o => o.value === v)?.label ?? String(v);
    if (Array.isArray(answer)) return answer.map(labelFor).join(', ') || '—';
    return labelFor(answer);
  }

  render() {
    if (!this.session) return html``;
    const { envelope, fileName } = this.session;
    const ss = envelope.sessionState;
    const key = this.sessionKey ?? this.questionnaireId;
    const qId = ss.questionnaireIds?.[key] ?? this.questionnaireId ?? key;
    const questionnaire = this.questionnaires?.get?.(qId);

    const title = envelope.instruments.find(i => i.questionnaireId === qId)?.title
      ?? questionnaire?.title ?? qId;
    const score = ss.scores?.[key];
    const alerts = ss.alerts?.[key] ?? [];
    const answers = ss.answers?.[key] ?? {};

    const date = new Intl.DateTimeFormat('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(envelope.generatedAt));

    const items = this._leafItems(questionnaire);

    return html`
      <header>
        <div>
          <h2>${title}</h2>
          <div class="meta">
            ${date}
            ${envelope.pid ? html` · <span class="pid">${envelope.pid}</span>` : ''}
          </div>
        </div>
        <button class="close" @click=${this._close} aria-label="סגירה">✕</button>
      </header>

      <div class="score-line">
        <span class="total">${this._formatValue(score?.total)}</span>
        ${score?.category ? html`<span class="category">${score.category}</span>` : ''}
      </div>

      ${score?.subscales && Object.keys(score.subscales).length ? html`
        <ul class="subscales">
          ${Object.entries(score.subscales).map(([id, v]) => html`
            <li>
              <span>${questionnaire?.subscaleLabels?.[id] ?? id}</span>
              <span>${this._formatValue(v)}</span>
            </li>
          `)}
        </ul>
      ` : ''}

      ${alerts.map(a => html`<div class="alert">⚠ ${a.message}</div>`)}

      <h4>תשובות</h4>
      <ol class="items">
        ${Object.entries(answers).map(([itemId, answer]) => {
          const item = items.get(itemId);
          return html`
            <li>
              <div class="q-text">${item?.text ?? itemId}</div>
              <div class="q-answer">
                <span>${this._answerLabel(item, questionnaire, answer)}</span>
                ${typeof answer === 'number' ? html`<span class="q-value">${answer}</span>` : ''}
              </div>
            </li>
          `;
        })}
      </ol>

      <a class="download" href=${this._downloadUrl()} download=${fileName}>
        הורדת ה-PDF המקורי
      </a>
    `;
  }
}

customElements.define('session-detail', SessionDetail);
