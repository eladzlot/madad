// <trajectory-chart> — renders one instrument's trajectory as SVG.
//
// Dumb by design (D-10): all geometry comes precomputed from
// buildChartModel(); this component maps the render model to SVG elements
// and manages exactly one bit of UI state — the visible-window offset.
//
// The SVG uses an explicit LTR coordinate system (time flows left-to-right)
// inside the RTL page; dir="ltr" isolates it from the page direction.

import { LitElement, html, svg, css } from 'lit';
import { buildChartModel } from './chart-model.js';

export class TrajectoryChart extends LitElement {
  static properties = {
    series:          { type: Object },   // { questionnaireId, title, points } from store.series()
    interpretations: { type: Object },   // the instrument's config block (or undefined)
    _offset:         { state: true },    // window offset: 0 = newest page
  };

  static styles = css`
    :host {
      display: block;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e7e5e4);
      border-radius: 8px;
      padding: var(--space-md, 1rem);
    }

    h3 {
      margin: 0 0 var(--space-sm, .5rem);
      font-size: var(--font-size-md, 1rem);
      color: var(--color-text, #1c1917);
    }

    svg {
      display: block;
      inline-size: 100%;
      block-size: auto;
    }

    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, .5rem);
      margin-block-start: var(--space-xs, .25rem);
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-text-muted, #78716c);
    }

    .pager button {
      border: 1px solid var(--color-border, #e7e5e4);
      background: none;
      border-radius: 6px;
      inline-size: 28px;
      block-size: 28px;
      cursor: pointer;
      color: inherit;
      font-size: 14px;
    }

    .pager button:disabled {
      opacity: 0.35;
      cursor: default;
    }
  `;

  constructor() {
    super();
    this.series = null;
    this.interpretations = undefined;
    this._offset = 0;
  }

  willUpdate(changed) {
    // New data resets the view to the most recent window.
    if (changed.has('series')) this._offset = 0;
  }

  _page(direction) {
    this._offset = Math.max(0, this._offset + direction);
  }

  render() {
    if (!this.series) return html``;
    const m = buildChartModel({
      points: this.series.points,
      interpretations: this.interpretations,
      windowOffset: this._offset,
    });

    return html`
      <h3>${this.series.title}</h3>
      <svg
        dir="ltr"
        viewBox="0 0 ${m.width} ${m.height}"
        role="img"
        aria-label="גרף מהלך: ${this.series.title}"
      >
        ${m.bands.map(b => svg`
          <rect x=${m.plot.x} y=${b.y} width=${m.plot.w} height=${b.h} fill=${b.fill}></rect>
          <text x=${m.plot.x + m.plot.w - 4} y=${b.y + 11} text-anchor="end"
                font-size="9" fill="#a8a29e">${b.label}</text>
        `)}

        ${m.yTicks.map(t => svg`
          <line x1=${m.plot.x} y1=${t.y} x2=${m.plot.x + m.plot.w} y2=${t.y}
                stroke="#00000014" stroke-width="1"></line>
          <text x=${m.plot.x - 6} y=${t.y + 3} text-anchor="end"
                font-size="10" fill="#78716c">${t.label}</text>
        `)}

        ${m.cutoffs.map(c => svg`
          <line x1=${m.plot.x} y1=${c.y} x2=${m.plot.x + m.plot.w} y2=${c.y}
                stroke="#b45309" stroke-width="1.5"></line>
          ${c.label ? svg`
            <text x=${m.plot.x + 4} y=${c.y - 4} font-size="9" fill="#b45309">${c.label}</text>
          ` : ''}
        `)}

        ${m.linePath ? svg`
          <path d=${m.linePath} fill="none" stroke="#0d9488" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"></path>
        ` : ''}

        ${m.markers.map(k => svg`
          <circle cx=${k.x} cy=${k.y} r=${k.baseline ? 6 : 4.5}
                  fill=${k.baseline ? '#ffffff' : '#0d9488'}
                  stroke="#0d9488" stroke-width=${k.baseline ? 2.5 : 0}
                  class=${k.alerts.length ? 'has-alerts' : ''}>
            <title>${this._markerTitle(k)}</title>
          </circle>
          ${k.alerts.length ? svg`
            <circle cx=${k.x} cy=${k.y} r="8.5" fill="none" stroke="#b91c1c" stroke-width="1.5"></circle>
          ` : ''}
        `)}

        ${m.xTicks.map(t => svg`
          <text x=${t.x} y=${m.plot.y + m.plot.h + 16} text-anchor="middle"
                font-size="10" fill="#78716c">${t.label}</text>
        `)}
      </svg>

      ${m.pagination ? html`
        <div class="pager" dir="ltr">
          <button
            @click=${() => this._page(1)}
            ?disabled=${!m.pagination.hasOlder}
            aria-label="מפגשים קודמים"
          >‹</button>
          <span dir="rtl">מציג ${m.pagination.from}–${m.pagination.to} מתוך ${m.pagination.total}</span>
          <button
            @click=${() => this._page(-1)}
            ?disabled=${!m.pagination.hasNewer}
            aria-label="מפגשים חדשים יותר"
          >›</button>
        </div>
      ` : ''}
    `;
  }

  _markerTitle(k) {
    const parts = [`${k.label} — ${k.total}`];
    if (k.category) parts.push(k.category);
    if (k.baseline) parts.push('מדידה ראשונה');
    for (const a of k.alerts) parts.push(`⚠ ${a.message}`);
    return parts.join(' · ');
  }
}

customElements.define('trajectory-chart', TrajectoryChart);
