// <preview-dialog> — the static, read-only instrument preview + spec sheet.
//
// Given a DisplayModel from preview-model.js (a questionnaire or a battery), it
// renders, in a native <dialog> (full-screen on mobile):
//   - a summary header (title, meta badges, description, keywords)
//   - scoring & interpretation (method, subscales, ranges ladder, psychometrics,
//     alerts) — only the parts the config has
//   - the item walk: each item read-only by type, conditional groups shown
//     structurally as indented "מוצג בתנאי" groups; never evaluated
//   - the ↗ live-flow link (opens the patient app for this entry)
//
// A "מנגנון" (mechanics) toggle reveals the underlying wiring — each item's id
// and the explicit DSL of every condition/alert. Off by default for a clean
// clinical read; on for authors who want to trace the logic.
//
// Batteries render as an all-collapsed accordion of steps (<details>), each
// expanding to that questionnaire's own summary + scoring + items.
//
// Dumb: it takes `.model` + `.liveUrl` + `.open`, renders, and emits
// `preview-close` when dismissed. No fetch, no model building.

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { itemTypeLabel, domainLabel, populationLabel, typeLabel, scoringMethodLabel } from '../taxonomy.js';

const INPUT_TYPE_LABELS = {
  line:      'שורה',
  multiline: 'רב-שורות',
  number:    'מספר',
  email:     'דוא"ל',
};

export class PreviewDialog extends LitElement {
  static properties = {
    model:         { type: Object },
    liveUrl:       { type: String },
    open:          { type: Boolean, reflect: true },
    showMechanics: { state: true },
  };

  constructor() {
    super();
    this.model = null;
    this.liveUrl = null;
    this.open = false;
    this.showMechanics = false;
  }

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { --pv-pad: clamp(16px, 4vw, 28px); }

    /* Airy, modern, all-white: no chrome bars, no grey fills. Structure comes
       from whitespace, hairline rules, and one teal accent. Every value is a
       real theme token, so light and dark both hold. */
    dialog {
      inline-size: 100%;
      max-inline-size: 640px;
      max-block-size: 88dvh;
      padding: 0;
      border: none;
      border-radius: var(--radius-lg, 18px);
      background: var(--clin-card-bg, #fff);
      color: var(--color-text, #162232);
      box-shadow: 0 24px 64px -20px rgba(11, 22, 33, 0.28);
      overflow: hidden;
    }
    dialog::backdrop { background: rgba(11, 22, 33, 0.4); backdrop-filter: blur(2px); }

    .frame { display: flex; flex-direction: column; max-block-size: 88dvh; }

    @media (max-width: 767px) {
      dialog {
        max-inline-size: none;
        inline-size: 100vw;
        block-size: 100dvh;
        max-block-size: none;
        border-radius: 0;
        margin: 0;
      }
      .frame { max-block-size: none; block-size: 100dvh; }
    }

    /* ── header ── white, quiet, hairline underline ── */
    header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md, 16px);
      padding: var(--pv-pad) var(--pv-pad) var(--space-lg, 20px);
      border-block-end: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
    }
    .head-main { flex: 1; min-inline-size: 0; }
    .eyebrow {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      letter-spacing: 0.07em;
      color: var(--color-accent, #2BB3C0);
      text-transform: uppercase;
    }
    .title {
      font-size: var(--font-size-lg, 22px);
      font-weight: var(--font-weight-bold, 600);
      line-height: var(--line-height-tight, 1.3);
      margin-block-start: 4px;
    }
    .head-actions { display: flex; gap: var(--space-xs, 4px); flex-shrink: 0; align-items: center; }

    /* Ghost controls — borderless, tint on hover. */
    .icon-btn {
      inline-size: 36px; block-size: 36px;
      display: grid; place-items: center;
      border: none;
      border-radius: var(--radius-sm, 8px);
      background: transparent;
      color: var(--color-text-muted, #5E7080);
      font-size: 16px; cursor: pointer; text-decoration: none;
      font-family: inherit;
      transition: background 120ms ease, color 120ms ease;
    }
    .icon-btn:hover { background: var(--color-selected-bg, #E4F6F8); color: var(--color-primary, #1A9FAD); }
    .icon-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 2px; }
    .icon-btn svg { inline-size: 18px; block-size: 18px; }

    .mech-btn {
      block-size: 36px;
      padding-inline: 12px;
      display: inline-flex; align-items: center; gap: 6px;
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-pill, 999px);
      background: transparent;
      color: var(--color-text-muted, #5E7080);
      font-family: inherit; font-size: var(--font-size-xs, 12px); font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
    }
    .mech-btn:hover { border-color: var(--color-primary, #1A9FAD); color: var(--color-primary, #1A9FAD); }
    .mech-btn:focus-visible { outline: 2px solid var(--color-border-focus, #2BB3C0); outline-offset: 2px; }
    .mech-btn[aria-pressed="true"] {
      background: var(--color-selected-bg, #E4F6F8);
      border-color: var(--color-selected-border, #2BB3C0);
      color: var(--color-primary, #1A9FAD);
    }
    .mech-btn svg { inline-size: 15px; block-size: 15px; }

    /* ── body ── */
    .body { overflow-y: auto; padding: var(--pv-pad); flex: 1; }
    section { margin-block-end: var(--space-xl, 36px); }
    section:last-child { margin-block-end: 0; }
    .section-label {
      font-size: var(--font-size-xs, 12px);
      font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-accent, #2BB3C0);
      margin-block-end: var(--space-md, 16px);
    }
    .desc { line-height: var(--line-height-base, 1.65); }
    .keywords {
      font-size: var(--font-size-xs, 12px);
      color: var(--color-text-muted, #5E7080);
      margin-block-start: var(--space-sm, 8px);
      direction: ltr; unicode-bidi: embed; text-align: start;
    }

    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: var(--space-md, 12px); }
    .badge {
      font-size: var(--font-size-xs, 12px);
      padding: 3px 12px;
      border-radius: var(--radius-pill, 999px);
      background: transparent;
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      color: var(--color-text-muted, #5E7080);
      white-space: nowrap;
    }
    .badge.accent { border-color: var(--color-selected-border, #2BB3C0); color: var(--color-primary, #1A9FAD); }

    /* ── scoring ── plain content, hairline-ruled ladder ── */
    .panel { display: flex; flex-direction: column; gap: var(--space-xs, 6px); }
    .kv { font-size: var(--font-size-sm, 14px); line-height: 1.7; }
    .kv .k { color: var(--color-text-muted, #5E7080); }
    .subscale { font-size: var(--font-size-sm, 14px); padding-block: 2px; }
    .subscale .ids { color: var(--color-text-muted, #5E7080); direction: ltr; unicode-bidi: embed; font-family: ui-monospace, monospace; font-size: var(--font-size-xs, 12px); }
    .ladder { inline-size: 100%; border-collapse: collapse; font-size: var(--font-size-sm, 14px); margin-block-start: var(--space-xs, 6px); }
    .ladder td { padding: 7px var(--space-md, 16px) 7px 0; border-block-end: var(--border-width, 1px) solid var(--color-border, #D5DAE2); }
    .ladder tr:last-child td { border-block-end: none; }
    .ladder .range { direction: ltr; unicode-bidi: embed; color: var(--color-text-muted, #5E7080); font-family: ui-monospace, monospace; white-space: nowrap; }

    .alert {
      font-size: var(--font-size-sm, 14px);
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      margin-block-start: var(--space-md, 12px);
      border-radius: var(--radius-md, 10px);
      background: var(--color-no-bg, #FDF3F3);
      border-inline-start: 3px solid var(--color-no, #8B3A3A);
      display: flex; gap: var(--space-sm, 8px); align-items: baseline; flex-wrap: wrap;
    }
    .sev {
      font-size: var(--font-size-xs, 11px); font-weight: var(--font-weight-bold, 600);
      text-transform: uppercase; letter-spacing: 0.04em;
      padding: 1px 8px; border-radius: var(--radius-pill, 999px);
      background: var(--color-no, #8B3A3A); color: #fff;
    }

    /* mechanics-only text (ids, DSL) */
    .dsl {
      direction: ltr; unicode-bidi: embed;
      font-family: ui-monospace, monospace; font-size: var(--font-size-xs, 12px);
      color: var(--color-text-muted, #5E7080);
    }

    /* ── items ── an airy list, hairline-separated, no boxes ── */
    .items { display: flex; flex-direction: column; }
    .node { min-inline-size: 0; }
    .node.nested { border-inline-start: 2px solid var(--color-selected-bg, #E4F6F8); padding-inline-start: var(--space-md, 16px); }

    .item {
      padding-block: var(--space-md, 16px);
      border-block-end: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
    }
    .items > .node:last-child > .item { border-block-end: none; }
    .item-head { display: flex; align-items: baseline; gap: var(--space-sm, 8px); flex-wrap: wrap; }
    .item-type {
      font-size: var(--font-size-xs, 11px); font-weight: var(--font-weight-bold, 600);
      letter-spacing: 0.03em;
      color: var(--color-primary, #1A9FAD);
      background: var(--color-selected-bg, #E4F6F8);
      padding: 2px 9px; border-radius: var(--radius-pill, 999px);
      flex-shrink: 0;
    }
    .item-text { font-weight: var(--font-weight-medium, 500); flex: 1; min-inline-size: 0; }
    .item-id { font-size: var(--font-size-xs, 12px); color: var(--color-text-muted, #5E7080); font-family: ui-monospace, monospace; direction: ltr; unicode-bidi: embed; }
    .req { font-size: var(--font-size-xs, 11px); color: var(--color-no, #8B3A3A); font-weight: var(--font-weight-medium, 500); }

    .instr {
      color: var(--color-text-muted, #5E7080);
      border-inline-start: 2px solid var(--color-selected-border, #2BB3C0);
      padding-inline-start: var(--space-md, 14px);
      line-height: var(--line-height-base, 1.6);
    }

    .options { margin-block-start: var(--space-md, 12px); display: flex; flex-direction: column; gap: 6px; }
    .opt {
      font-size: var(--font-size-sm, 14px);
      display: flex; align-items: center; gap: var(--space-sm, 10px);
      padding: var(--space-sm, 9px) var(--space-md, 14px);
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      /* A light grey surface — the app's --color-bg, lighter than --color-surface,
         so options read as a soft distinct layer on the white background. */
      background: var(--color-bg, #F2F4F7);
      color: var(--color-text, #162232);
    }
    .opt .glyph { color: var(--color-accent, #2BB3C0); flex-shrink: 0; font-size: 12px; }
    .opt-label { flex: 1; min-inline-size: 0; }
    .opt .val { color: var(--color-text-muted, #5E7080); font-size: var(--font-size-xs, 12px); white-space: nowrap; }

    .slider { margin-block-start: var(--space-md, 12px); }
    .slider-labels { display: flex; justify-content: space-between; font-size: var(--font-size-xs, 12px); color: var(--color-text-muted, #5E7080); }
    .slider-bar {
      block-size: 4px; border-radius: 999px; margin-block: 8px;
      background: linear-gradient(to left, var(--color-accent, #2BB3C0), var(--color-selected-bg, #E4F6F8));
    }
    .slider-range { font-size: var(--font-size-xs, 12px); color: var(--color-text-muted, #5E7080); direction: ltr; unicode-bidi: embed; text-align: center; }

    .text-field {
      margin-block-start: var(--space-md, 12px);
      border: var(--border-width, 1px) dashed var(--color-border, #D5DAE2);
      border-radius: var(--radius-md, 10px);
      padding: var(--space-sm, 10px) var(--space-md, 14px);
      color: var(--color-text-muted, #8196A6);
      font-size: var(--font-size-sm, 14px);
    }

    /* condition dividers */
    .divider {
      display: flex; align-items: center; gap: var(--space-sm, 8px);
      margin-block: var(--space-lg, 20px) 2px;
      font-size: var(--font-size-xs, 12px); font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #5E7080);
    }
    .divider .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 12px; border-radius: var(--radius-pill, 999px);
      background: transparent;
      border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
    }
    .divider.if .chip { color: var(--color-primary, #1A9FAD); border-color: var(--color-selected-border, #2BB3C0); background: var(--color-selected-bg, #E4F6F8); }
    .divider .line { flex: 1; height: 1px; background: var(--color-border, #D5DAE2); }

    /* battery accordion — hairline-separated rows, no boxes */
    details.step { border-block-end: var(--border-width, 1px) solid var(--color-border, #D5DAE2); }
    details.step:first-of-type { border-block-start: var(--border-width, 1px) solid var(--color-border, #D5DAE2); }
    details.step > summary {
      list-style: none;
      cursor: pointer;
      padding: var(--space-md, 16px) 2px;
      display: flex; align-items: center; gap: var(--space-sm, 8px); flex-wrap: wrap;
    }
    details.step > summary::-webkit-details-marker { display: none; }
    details.step > summary .caret { color: var(--color-accent, #2BB3C0); transition: transform 120ms ease; display: inline-block; }
    details.step[open] > summary .caret { transform: rotate(-90deg); }
    .step-title { font-weight: var(--font-weight-medium, 500); }
    .step-count { font-size: var(--font-size-xs, 12px); color: var(--color-text-muted, #5E7080); }
    .step-cond {
      font-size: var(--font-size-xs, 12px); color: var(--color-primary, #1A9FAD);
      background: var(--color-selected-bg, #E4F6F8); border-radius: var(--radius-pill, 999px);
      padding: 2px 10px; display: inline-flex; align-items: center; gap: 6px;
    }
    .step-body { padding: 0 var(--space-md, 16px) var(--space-md, 16px); }
    .step-body section { margin-block: 0 var(--space-lg, 20px); }
    .step-body section:last-child { margin-block-end: 0; }
    .missing { color: var(--color-no, #8B3A3A); font-size: var(--font-size-sm, 14px); padding: var(--space-md, 16px) 2px; }
  `];

  // ── dialog open/close plumbing ──
  updated(changed) {
    if (changed.has('open')) {
      const dlg = this.renderRoot?.querySelector('dialog');
      if (!dlg) return;
      if (this.open && !dlg.open) {
        dlg.showModal();
        // Always open at the top — the body keeps its scroll between opens.
        const body = this.renderRoot.querySelector('.body');
        if (body) body.scrollTop = 0;
      } else if (!this.open && dlg.open) {
        dlg.close();
      }
    }
  }

  _onClose() {
    if (this.open) {
      this.open = false;
      this.dispatchEvent(new CustomEvent('preview-close', { bubbles: true, composed: true }));
    }
  }

  _close() {
    this.dispatchEvent(new CustomEvent('preview-close', { bubbles: true, composed: true }));
  }

  // A click whose target is the <dialog> itself (not its content) landed on the
  // backdrop — the frame fills the dialog, so content clicks target inner nodes.
  _onBackdropClick(e) {
    if (e.target === e.currentTarget) this._close();
  }

  _toggleMechanics() { this.showMechanics = !this.showMechanics; }

  render() {
    const m = this.model;
    return html`
      <dialog @close=${this._onClose} @cancel=${this._onClose} @click=${this._onBackdropClick}>
        <div class="frame">
          ${m ? html`
            <header>
              <div class="head-main">
                <div class="eyebrow">${m.kind === 'battery' ? 'סוללה' : 'תצוגה מקדימה'}</div>
                <div class="title">${m.summary.title}</div>
              </div>
              <div class="head-actions">
                <button class="mech-btn" type="button" role="switch"
                        aria-pressed=${this.showMechanics ? 'true' : 'false'}
                        @click=${this._toggleMechanics} title="הצג מזהים ותנאים מפורשים">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>
                  </svg>
                  מנגנון
                </button>
                ${this.liveUrl ? html`
                  <a class="icon-btn" href=${this.liveUrl} target="_blank" rel="noopener"
                     title="פתח בתצוגת מטופל" aria-label="פתח בתצוגת מטופל">↗</a>
                ` : nothing}
                <button class="icon-btn" type="button" @click=${this._close}
                        title="סגור" aria-label="סגור">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </button>
              </div>
            </header>
            <div class="body">
              ${this._renderSummary(m.summary)}
              ${m.kind === 'battery' ? this._renderBattery(m) : this._renderScoring(m)}
              ${m.kind === 'battery' ? nothing : this._renderItems(m.nodes)}
            </div>
          ` : nothing}
        </div>
      </dialog>
    `;
  }

  _renderSummary(s) {
    const badges = [];
    if (s.type) badges.push(html`<span class="badge accent">${typeLabel(s.type)}</span>`);
    for (const d of s.domains) badges.push(html`<span class="badge">${domainLabel(d)}</span>`);
    for (const p of s.populations) badges.push(html`<span class="badge">${populationLabel(p)}</span>`);
    if (typeof s.itemCount === 'number') badges.push(html`<span class="badge">${s.itemCount} פריטים</span>`);
    if (s.durationMinutes) badges.push(html`<span class="badge">~${s.durationMinutes} דק׳</span>`);
    for (const t of s.tags) badges.push(html`<span class="badge">${t}</span>`);

    return html`
      <section>
        ${s.description ? html`<p class="desc">${s.description}</p>` : nothing}
        ${badges.length ? html`<div class="badges">${badges}</div>` : nothing}
        ${this.showMechanics && s.keywords.length ? html`<p class="keywords">${s.keywords.join(' · ')}</p>` : nothing}
      </section>
    `;
  }

  _renderScoring(m) {
    const hasSubscales = m.subscales.length > 0;
    const ranges = m.interpretations?.ranges ?? [];
    const psy = m.psychometrics;
    const alerts = m.alerts;
    if (!m.scoring.method && !hasSubscales && ranges.length === 0 && !psy && alerts.length === 0) {
      return nothing;
    }
    const hasPanel = m.scoring.method || hasSubscales || ranges.length || psy;
    return html`
      <section>
        <div class="section-label">ניקוד ופרשנות</div>
        ${hasPanel ? html`<div class="panel">
          ${m.scoring.method ? html`<div class="kv"><span class="k">שיטת ניקוד:</span> ${scoringMethodLabel(m.scoring.method)}</div>` : nothing}
          ${hasSubscales ? html`
            <div class="kv" style="margin-block-start:8px"><span class="k">תת-סולמות:</span></div>
            ${m.subscales.map(sub => html`
              <div class="subscale">
                <strong>${sub.label}</strong>
                ${this.showMechanics
                  ? html` <span class="ids">${sub.itemIds.join(', ')}</span>`
                  : html` <span class="step-count">(${sub.itemIds.length} פריטים)</span>`}
              </div>
            `)}
          ` : nothing}
          ${ranges.length ? html`
            <table class="ladder">
              ${ranges.map(r => html`<tr><td class="range">${r.min}–${r.max}</td><td>${r.label}</td></tr>`)}
            </table>
          ` : nothing}
          ${psy ? html`
            <div class="kv" style="margin-block-start:8px">
              <span class="k">מהימנות:</span> ${psy.reliability} · <span class="k">ס״ת:</span> ${psy.sd}
              <span class="step-count">(${psy.source})</span>
            </div>
          ` : nothing}
        </div>` : nothing}
        ${alerts.map(a => html`
          <div class="alert">
            <span class="sev">${a.severity}</span>
            <span>${a.message}</span>
            ${this.showMechanics ? html`<span class="dsl">${a.condition}</span>` : nothing}
          </div>
        `)}
      </section>
    `;
  }

  _renderItems(nodes) {
    if (!nodes?.length) return nothing;
    return html`
      <section>
        <div class="section-label">פריטים</div>
        <div class="items">
          ${nodes.map(n => n.kind === 'condition' ? this._renderCondition(n) : this._renderItem(n))}
        </div>
      </section>
    `;
  }

  _indent(depth) {
    return depth > 0 ? `margin-inline-start:${depth * 16}px;padding-inline-start:12px` : '';
  }

  _renderCondition(c) {
    const cls = `node divider ${c.variant}${c.depth > 0 ? ' nested' : ''}`;
    let chip;
    if (c.variant === 'if') {
      chip = html`<span class="chip">מוצג בתנאי${this.showMechanics && c.label ? html`: <span class="dsl">${c.label}</span>` : nothing}</span>`;
    } else if (c.variant === 'else') {
      chip = html`<span class="chip">אחרת</span>`;
    } else {
      chip = html`<span class="chip">סדר אקראי</span>`;
    }
    return html`<div class="${cls}" style=${this._indent(c.depth)}>${chip}<span class="line"></span></div>`;
  }

  _renderItem(n) {
    const cls = `node${n.depth > 0 ? ' nested' : ''}`;
    if (n.type === 'instructions') {
      return html`<div class="${cls}" style=${this._indent(n.depth)}><div class="instr">${n.text}</div></div>`;
    }
    return html`
      <div class="${cls}" style=${this._indent(n.depth)}>
        <div class="item">
          <div class="item-head">
            <span class="item-type">${itemTypeLabel(n.type)}</span>
            <span class="item-text">${n.text}</span>
            ${n.required ? html`<span class="req">חובה</span>` : nothing}
            ${this.showMechanics ? html`<span class="item-id">id: ${n.id}</span>` : nothing}
          </div>
          ${this._renderItemBody(n)}
        </div>
      </div>
    `;
  }

  _renderItemBody(n) {
    if (n.type === 'select' || n.type === 'binary') {
      if (!n.options?.length) return html`<div class="text-field">(אין אפשרויות)</div>`;
      return html`<div class="options">
        ${n.options.map(o => html`<div class="opt"><span class="glyph">○</span> <span class="opt-label">${o.label}</span><span class="val">ציון: ${o.value}</span></div>`)}
      </div>`;
    }
    if (n.type === 'multiselect') {
      if (!n.options?.length) return html`<div class="text-field">(אין אפשרויות)</div>`;
      return html`<div class="options">
        ${n.options.map(o => html`<div class="opt"><span class="glyph">☐</span> <span>${o.label}</span></div>`)}
      </div>`;
    }
    if (n.type === 'slider') {
      const { min, max, labels } = n.range;
      return html`<div class="slider">
        ${labels?.min || labels?.max ? html`<div class="slider-labels"><span>${labels?.min ?? ''}</span><span>${labels?.max ?? ''}</span></div>` : nothing}
        <div class="slider-bar"></div>
        <div class="slider-range">${min} — ${max}</div>
      </div>`;
    }
    if (n.type === 'text') {
      return html`<div class="text-field">תשובה חופשית · ${INPUT_TYPE_LABELS[n.inputType] ?? n.inputType}</div>`;
    }
    return nothing;
  }

  _renderBattery(m) {
    return html`
      <section>
        <div class="section-label">רצף השאלונים</div>
        ${m.steps.map(step => this._renderStep(step))}
      </section>
    `;
  }

  _renderStep(step) {
    return html`
      <details class="step">
        <summary>
          <span class="caret">▾</span>
          <span class="step-title">${step.title}</span>
          ${typeof step.itemCount === 'number' ? html`<span class="step-count">${step.itemCount} פריטים</span>` : nothing}
          ${step.condition ? html`<span class="step-cond">מוצג בתנאי${this.showMechanics ? html`: <span class="dsl">${step.condition}</span>` : nothing}</span>` : nothing}
          ${step.branch === 'else' ? html`<span class="step-count">אחרת</span>` : nothing}
          ${step.randomized ? html`<span class="step-count">סדר אקראי</span>` : nothing}
        </summary>
        <div class="step-body">
          ${step.sub
            ? html`${this._renderScoring(step.sub)}${this._renderItems(step.sub.nodes)}`
            : html`<div class="missing">שאלון "${step.questionnaireId}" לא נמצא.</div>`}
        </div>
      </details>
    `;
  }
}

customElements.define('preview-dialog', PreviewDialog);
