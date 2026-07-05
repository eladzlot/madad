// <trajectory-chart> — renders one instrument's trajectory as SVG.
//
// Dumb by design (D-10): all geometry comes precomputed from
// buildChartModel(); this component maps the render model to SVG elements
// and manages only UI state — window offset, tooltip, table toggle.
//
// Interaction (AGGREGATE_SPEC §5.6):
//   hover/focus a point → tooltip (date, total, subscales, alerts)
//   click/Enter a point → 'point-selected' event (opens the detail panel)
//   arrow keys          → move focus across points within the chart
//   "view as table"     → tabular rendering of the full series (the
//                         primary screen-reader experience)
//
// The SVG uses an explicit LTR coordinate system (time flows left-to-right)
// inside the RTL page; dir="ltr" isolates it from the page direction.

import { LitElement, html, svg, css } from 'lit';
import { buildChartModel } from './chart-model.js';
import { buildHeatmapModel } from './heatmap-model.js';
import { buildExportSvg, exportFilename, uniquePid } from './export-svg.js';
import { svgBlob, svgToPngBlob, triggerDownload, canCopyImage, copyPngToClipboard } from './export-image.js';

export class TrajectoryChart extends LitElement {
  static properties = {
    series:        { type: Object },   // { questionnaireId, title, points } from store.series()
    questionnaire: { type: Object },   // config questionnaire (interpretations, subscaleLabels) or undefined
    domain:        { type: Array },    // shared [start, end] x-domain across all charts (optional)
    _tooltip:      { state: true },    // { marker, x, y } in host px, or null
    _showTable:    { state: true },
    _showHeatmap:  { state: true },
    _exportPid:    { state: true },    // include pid on exported images (§6: opt-in, default off)
    _copied:       { state: true },    // transient "copied ✓" feedback on the copy button
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      font-family: var(--font-family, system-ui, sans-serif);
      background: var(--a-card-bg, #fff);
      border: 1px solid var(--color-border, #e7e5e4);
      border-radius: var(--radius-md, 12px);
      box-shadow: var(--shadow-sm, none);
      padding: var(--space-md, 1rem);
    }

    h3 {
      margin: 0 0 var(--space-sm, .5rem);
      font-size: var(--font-size-md, 1rem);
      color: var(--color-text, #1c1917);
    }

    /* Pastel severity fills glare on a dark surface — keep the hue as a
       hint rather than a floodlight. */
    @media (prefers-color-scheme: dark) {
      .band { opacity: 0.16; }
    }

    svg {
      display: block;
      inline-size: 100%;
      block-size: auto;
    }

    .marker {
      cursor: pointer;
      outline: none;
    }

    .marker:focus {
      stroke: #115e59;
      stroke-width: 3;
    }

    .tooltip {
      position: absolute;
      transform: translate(-50%, calc(-100% - 10px));
      background: #1c1917;
      color: #fafaf9;
      border-radius: 6px;
      padding: .45rem .65rem;
      font-size: var(--font-size-sm, .8rem);
      line-height: 1.45;
      pointer-events: none;
      white-space: nowrap;
      z-index: 2;
      direction: rtl;
      text-align: right;
    }

    .tooltip .tip-total { font-weight: 700; }
    .tooltip .tip-alert { color: #fca5a5; }
    .tooltip .tip-sub   { color: #d6d3d1; }

    .footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-block-start: var(--space-xs, .25rem);
    }

    .toggles {
      display: flex;
      gap: var(--space-sm, .5rem);
    }

    .table-toggle,
    .heatmap-toggle,
    .export-btn {
      border: none;
      background: none;
      font-family: inherit;
      color: var(--color-text-muted, #78716c);
      font-size: var(--font-size-sm, .8rem);
      cursor: pointer;
      text-decoration: underline;
      padding: .25rem;
    }

    .export {
      display: flex;
      align-items: center;
      gap: var(--space-xs, .25rem);
      color: var(--color-text-muted, #78716c);
      font-size: var(--font-size-sm, .8rem);
    }

    .export-pid {
      display: flex;
      align-items: center;
      gap: .25rem;
      cursor: pointer;
      margin-inline-end: var(--space-xs, .25rem);
    }

    .heatmap-scroll {
      overflow-x: auto;
      margin-block-start: var(--space-sm, .5rem);
    }

    table.heatmap {
      border-collapse: collapse;
      font-size: var(--font-size-sm, .8rem);
      inline-size: 100%;
      /* Equal-width session columns regardless of header content — auto
         layout would widen labelled columns over thinned (empty) ones. */
      table-layout: fixed;
    }

    /* The row-header column is the only fixed-width one (set on the thead
       corner cell, which fixed layout uses); session columns split the
       remainder equally. */
    table.heatmap thead th:first-child {
      inline-size: 280px;
    }

    table.heatmap th[scope='col'] {
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #78716c);
      padding: .2rem 0;
      text-align: center;
      font-variant-numeric: tabular-nums;
      /* A date label may be wider than a compact column; it overflows
         symmetrically into its label-less neighbours, axis-style. */
      white-space: nowrap;
      overflow: visible;
    }

    table.heatmap th[scope='row'] {
      font-weight: var(--font-weight-normal, 400);
      color: var(--color-text-muted, #78716c);
      text-align: right;
      padding: .2rem .4rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    table.heatmap td.cell {
      text-align: center;
      padding: .25rem .5rem;
      min-inline-size: 34px;
      border: 2px solid var(--a-card-bg, #fff);
      border-radius: 4px;
      font-variant-numeric: tabular-nums;
      /* Fixed dark ink: cell fills are light pastels in both color schemes. */
      color: #162232;
    }

    table.heatmap td.cell.empty {
      color: var(--color-text-muted, #78716c);
      background: none;
    }

    /* Compact mode: color chips instead of numbered cells. */
    table.heatmap.compact td.cell {
      min-inline-size: 10px;
      padding: 0;
      block-size: 22px;
      border-width: 1px;
    }

    table.heatmap.compact th[scope='col'] {
      font-size: .7rem;
      padding-inline: .1rem;
    }

    table {
      inline-size: 100%;
      border-collapse: collapse;
      margin-block-start: var(--space-sm, .5rem);
      font-size: var(--font-size-sm, .875rem);
    }

    th, td {
      text-align: right;
      padding: .35rem .5rem;
      border-block-end: 1px solid var(--color-border, #e7e5e4);
    }

    th {
      color: var(--color-text-muted, #78716c);
      font-weight: 600;
    }

    td.num { font-variant-numeric: tabular-nums; }
  `;

  constructor() {
    super();
    this.series = null;
    this.questionnaire = undefined;
    this.domain = undefined;
    this._tooltip = null;
    this._showTable = false;
    this._showHeatmap = false;
    this._exportPid = false;
    this._copied = false;
  }

  willUpdate(changed) {
    if (changed.has('series')) this._tooltip = null;
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────

  _showTip(e, marker) {
    const r = e.currentTarget.getBoundingClientRect();
    const host = this.getBoundingClientRect();
    this._tooltip = {
      marker,
      x: r.x + r.width / 2 - host.x,
      y: r.y - host.y,
    };
  }

  _hideTip() {
    this._tooltip = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  _onMarkerKeydown(e, index) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const markers = [...this.shadowRoot.querySelectorAll('.marker')];
      const next = markers[index + (e.key === 'ArrowRight' ? 1 : -1)];
      next?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._select(e.currentTarget.__marker);
    }
  }

  _select(marker) {
    if (marker?.sessionId == null) return;
    this.dispatchEvent(new CustomEvent('point-selected', {
      detail: {
        sessionId: marker.sessionId,
        sessionKey: marker.sessionKey,
        questionnaireId: this.series.questionnaireId,
      },
      bubbles: true,
      composed: true,
    }));
  }

  // ── Export (AGGREGATE_SPEC §6) ─────────────────────────────────────────────

  // Copy to clipboard (primary), PNG or SVG download — all rendered
  // entirely in the browser. The export uses the same shared x-domain as
  // the on-screen chart, so the image shows exactly what the clinician saw.
  _buildExport(now) {
    return buildExportSvg({
      series: this.series,
      questionnaire: this.questionnaire,
      domain: this.domain,
      pid: this._exportPid ? uniquePid(this.series.points) : null,
      now,
    });
  }

  async _export(format) {
    const now = new Date();
    const { svg: doc, width, height } = this._buildExport(now);
    try {
      const blob = format === 'svg'
        ? svgBlob(doc)
        : await svgToPngBlob(doc, { width, height, scale: 2 });
      triggerDownload(blob, exportFilename(this.series.questionnaireId, now, format));
    } catch (err) {
      console.error('[aggregate] image export failed:', err);
    }
  }

  async _copy() {
    const { svg: doc, width, height } = this._buildExport(new Date());
    try {
      await copyPngToClipboard(doc, { width, height, scale: 2 });
      this._copied = true;
      clearTimeout(this._copiedTimer);
      this._copiedTimer = setTimeout(() => { this._copied = false; }, 1500);
    } catch (err) {
      console.error('[aggregate] clipboard copy failed:', err);
    }
  }

  _markerAria(k) {
    const parts = [`${k.label}: ${k.total}`];
    if (k.category) parts.push(k.category);
    if (k.baseline) parts.push('מדידה ראשונה');
    if (k.alerts.length) parts.push(`${k.alerts.length} התראות`);
    return parts.join(', ');
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  _subscaleLabel(id) {
    return this.questionnaire?.subscaleLabels?.[id] ?? id;
  }

  _formatValue(v) {
    if (v == null) return '—';
    return Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.series) return html``;
    const m = buildChartModel({
      points: this.series.points,
      interpretations: this.questionnaire?.interpretations,
      domain: this.domain,
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
          <rect class="band" x=${m.plot.x} y=${b.y} width=${m.plot.w} height=${b.h} fill=${b.fill}></rect>
          <text x=${b.labelX} y=${b.y + 11} text-anchor=${b.labelAnchor}
                direction="rtl" font-size="9" fill="var(--color-text-muted, #78716c)">${b.label}</text>
        `)}

        ${m.yTicks.map(t => svg`
          <line x1=${m.plot.x} y1=${t.y} x2=${m.plot.x + m.plot.w} y2=${t.y}
                stroke="var(--a-grid, #00000014)" stroke-width="1"></line>
          <text x=${m.plot.x - 10} y=${t.y + 3} text-anchor="end"
                font-size="10" fill="var(--color-text-muted, #78716c)">${t.label}</text>
        `)}

        ${m.cutoffs.map(c => svg`
          <line x1=${m.plot.x} y1=${c.y} x2=${m.plot.x + m.plot.w} y2=${c.y}
                stroke="var(--a-cutoff, #b45309)" stroke-width="1.5"></line>
          ${c.label ? svg`
            <text x=${c.labelX} y=${c.y - 4} text-anchor=${c.labelAnchor}
                  direction="rtl" font-size="9" fill="var(--a-cutoff, #b45309)">${c.label}</text>
          ` : ''}
        `)}

        ${m.linePath ? svg`
          <path d=${m.linePath} fill="none" stroke="var(--color-primary, #1A9FAD)" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"></path>
        ` : ''}

        ${m.markers.map((k, i) => svg`
          ${k.alerts.length ? svg`
            <circle cx=${k.x} cy=${k.y} r="8.5" fill="none" stroke="var(--color-no, #b91c1c)" stroke-width="1.5"></circle>
          ` : ''}
          <circle class="marker" cx=${k.x} cy=${k.y} r=${k.baseline ? 6 : 4.5}
                  fill=${k.baseline ? 'var(--a-card-bg, #ffffff)' : 'var(--color-primary, #1A9FAD)'}
                  stroke="var(--color-primary, #1A9FAD)" stroke-width=${k.baseline ? 2.5 : 0}
                  tabindex="0" role="button"
                  aria-label=${this._markerAria(k)}
                  .__marker=${k}
                  @mouseenter=${(e) => this._showTip(e, k)}
                  @mouseleave=${this._hideTip}
                  @focus=${(e) => this._showTip(e, k)}
                  @blur=${this._hideTip}
                  @click=${() => this._select(k)}
                  @keydown=${(e) => this._onMarkerKeydown(e, i)}></circle>
        `)}

        ${m.xTicks.map(t => svg`
          <text x=${t.x} y=${m.plot.y + m.plot.h + 16} text-anchor="middle"
                font-size="10" fill="#78716c">${t.label}</text>
        `)}
      </svg>

      ${this._tooltip ? this._renderTooltip() : ''}

      <div class="footer-row">
        <span class="toggles">
          <button
            class="table-toggle"
            aria-pressed=${this._showTable ? 'true' : 'false'}
            @click=${() => { this._showTable = !this._showTable; }}
          >${this._showTable ? 'הסתרת טבלה' : 'תצוגת טבלה'}</button>
          ${this.questionnaire ? html`
            <button
              class="heatmap-toggle"
              aria-pressed=${this._showHeatmap ? 'true' : 'false'}
              @click=${() => { this._showHeatmap = !this._showHeatmap; }}
            >${this._showHeatmap ? 'הסתרת מפת פריטים' : 'מפת פריטים'}</button>
          ` : ''}
        </span>
        <span class="export">
          ${uniquePid(this.series.points) != null ? html`
            <label class="export-pid">
              <input
                type="checkbox"
                .checked=${this._exportPid}
                @change=${(e) => { this._exportPid = e.target.checked; }}
              >
              כולל מזהה
            </label>
          ` : ''}
          <span>ייצוא תמונה:</span>
          ${canCopyImage() ? html`
            <button class="export-btn export-copy" @click=${() => this._copy()}>
              ${this._copied ? 'הועתק ✓' : 'העתקה'}
            </button>
          ` : ''}
          <button class="export-btn export-png" @click=${() => this._export('png')}>PNG</button>
          <button class="export-btn export-svg" @click=${() => this._export('svg')}>SVG</button>
        </span>
      </div>

      ${this._showHeatmap && this.questionnaire ? this._renderHeatmap() : ''}
      ${this._showTable ? this._renderTable() : ''}
    `;
  }

  // The per-item heatmap: which symptoms are moving. Rows = scored items in
  // questionnaire order, columns = all sessions, cell fill = answer as a
  // fraction of the item's max on the same warm ramp the bands use.
  // Past COMPACT_THRESHOLD sessions the cells drop their numbers and shrink
  // to color chips (values in tooltips) so a year of weekly sessions still
  // fits in the card without horizontal scrolling.
  _renderHeatmap() {
    const m = buildHeatmapModel({ points: this.series.points, questionnaire: this.questionnaire });
    if (!m.rows.length) return html``;
    // The table lives in the RTL page (item texts read naturally, labels on
    // the right), but time must flow left-to-right to match the chart above
    // (D-10). In RTL, DOM order renders right-to-left — so columns render
    // reversed: newest first in the DOM = rightmost on screen.
    const columns = [...m.columns].reverse();
    const cells = (r) => [...r.cells].reverse();
    return html`
      <div class="heatmap-scroll">
        <table class="heatmap ${m.compact ? 'compact' : ''}">
          <thead>
            <tr>
              <th scope="col"></th>
              ${columns.map(c => html`<th scope="col">${c.displayLabel}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${m.rows.map(r => html`
              <tr>
                <th scope="row" title=${r.text}>${r.text}</th>
                ${cells(r).map((c, i) => c
                  ? html`<td class="cell" style="background:${c.fill}"
                         title="${columns[i].label} · ${c.value}">${m.compact ? '' : c.value}</td>`
                  : html`<td class="cell empty" title="${columns[i].label} · —">${m.compact ? '' : '—'}</td>`)}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderTooltip() {
    const { marker: k, x, y } = this._tooltip;
    return html`
      <div class="tooltip" style="left:${x}px; top:${y}px" role="status">
        <div>${k.label}${k.baseline ? ' · מדידה ראשונה' : ''}</div>
        <div class="tip-total">${this._formatValue(k.total)}${k.category ? ` · ${k.category}` : ''}</div>
        ${Object.entries(k.subscales).map(([id, v]) => html`
          <div class="tip-sub">${this._subscaleLabel(id)}: ${this._formatValue(v)}</div>
        `)}
        ${k.alerts.map(a => html`<div class="tip-alert">⚠ ${a.message}</div>`)}
      </div>
    `;
  }

  // The table renders the *full* series (not just the visible window) —
  // it doubles as the numeric reference and the screen-reader experience.
  _renderTable() {
    const points = this.series.points;
    const subscaleIds = [...new Set(points.flatMap(p => Object.keys(p.subscales ?? {})))];
    const fmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });

    return html`
      <table>
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">ציון</th>
            <th scope="col">פירוש</th>
            ${subscaleIds.map(id => html`<th scope="col">${this._subscaleLabel(id)}</th>`)}
            <th scope="col">התראות</th>
          </tr>
        </thead>
        <tbody>
          ${points.map(p => html`
            <tr>
              <td>${fmt.format(p.date)}</td>
              <td class="num">${this._formatValue(p.total)}</td>
              <td>${p.category ?? '—'}</td>
              ${subscaleIds.map(id => html`<td class="num">${this._formatValue(p.subscales?.[id])}</td>`)}
              <td>${p.alerts?.length ? p.alerts.map(a => a.message).join('; ') : '—'}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}

customElements.define('trajectory-chart', TrajectoryChart);
