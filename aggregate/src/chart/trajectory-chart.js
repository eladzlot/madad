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
//   view switcher       → segmented control in the card header (D-16):
//                         גרף | מפת פריטים | טבלה — one view at a time;
//                         the table remains the primary screen-reader
//                         experience
//   export cluster      → העתקה button (primary, spec §6) + ייצוא menu
//                         holding PNG / SVG / the pid opt-in
//
// The SVG uses an explicit LTR coordinate system (time flows left-to-right)
// inside the RTL page; dir="ltr" isolates it from the page direction.

import { LitElement, html, svg, css, unsafeCSS } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
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
    _view:         { state: true },    // 'chart' | 'heatmap' | 'table' — one at a time (D-16)
    _exportPid:    { state: true },    // include pid on exported images (§6: opt-in, default off)
    _copied:       { state: true },    // transient "copied ✓" feedback on the copy button
  };

  static styles = [unsafeCSS(clinicianCss), css`
    :host {
      display: block;
      position: relative;
      font-family: var(--font-family, system-ui, sans-serif);
      background: var(--clin-card-bg, #fff);
      border: 1px solid var(--color-border, #e7e5e4);
      border-radius: var(--radius-md, 12px);
      box-shadow: var(--shadow-sm, none);
      padding: var(--space-md, 1rem);
    }

    /* ── Card header: title + view switcher + export cluster (D-16) ──────── */

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm, .5rem);
      flex-wrap: wrap;
      margin-block-end: var(--space-sm, .5rem);
    }

    h3 {
      margin: 0;
      font-size: var(--font-size-md, 1rem);
      color: var(--color-text, #1c1917);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: var(--space-sm, .5rem);
    }

    .export-cluster {
      display: flex;
      align-items: center;
      gap: var(--space-xs, .25rem);
    }

    /* The ייצוא dropdown — a native <details> so it needs no JS to open,
       stays keyboard-accessible, and closes itself via _closeExportMenu(). */
    details.export-menu { position: relative; }

    details.export-menu summary { list-style: none; }
    details.export-menu summary::-webkit-details-marker { display: none; }

    details.export-menu .menu {
      position: absolute;
      inset-inline-end: 0;
      top: calc(100% + 4px);
      background: var(--clin-card-bg, #fff);
      border: 1px solid var(--color-border, #D5DAE2);
      border-radius: var(--radius-sm, 6px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.07));
      padding: var(--space-xs, 4px);
      display: flex;
      flex-direction: column;
      min-inline-size: 150px;
      z-index: 3;
    }

    .menu button,
    .menu label.export-pid {
      display: flex;
      align-items: center;
      gap: .35rem;
      text-align: right;
      padding: .4rem .6rem;
      border: none;
      background: none;
      font-family: inherit;
      font-size: var(--font-size-sm, .875rem);
      color: var(--color-text, #162232);
      cursor: pointer;
      border-radius: 4px;
      white-space: nowrap;
    }

    .menu button:hover,
    .menu label.export-pid:hover { background: var(--color-selected-bg, #E4F6F8); }

    .menu label.export-pid {
      border-block-start: 1px solid var(--color-border, #D5DAE2);
      border-radius: 0 0 4px 4px;
      margin-block-start: 2px;
      color: var(--color-text-muted, #5E7080);
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
      border: 2px solid var(--clin-card-bg, #fff);
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

    /* Table rows and heatmap columns open the same session-detail panel as
       chart markers. The table row is the keyboard path (the heatmap is a
       visual scanning view — its sessions stay reachable via markers/table). */
    tr.session-row { cursor: pointer; }

    tr.session-row:hover td,
    tr.session-row:focus-visible td { background: var(--color-selected-bg, #E4F6F8); }

    tr.session-row:focus-visible {
      outline: 2px solid var(--color-border-focus, #2BB3C0);
      outline-offset: -2px;
    }

    table.heatmap th.col-head,
    table.heatmap td.cell { cursor: pointer; }

    table.heatmap th.col-head:hover { color: var(--color-text, #162232); }

    table.heatmap td.cell:hover {
      outline: 2px solid var(--color-accent, #2BB3C0);
      outline-offset: -2px;
    }
  `];

  constructor() {
    super();
    this.series = null;
    this.questionnaire = undefined;
    this.domain = undefined;
    this._tooltip = null;
    this._view = 'chart';
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
    this._closeExportMenu();
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

  _closeExportMenu() {
    const menu = this.shadowRoot.querySelector('details.export-menu');
    if (menu) menu.open = false;
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

  // The heatmap needs the config questionnaire; if it vanished (e.g. config
  // reload failed) fall back to the chart rather than an empty card.
  get _effectiveView() {
    if (this._view === 'heatmap' && !this.questionnaire) return 'chart';
    return this._view;
  }

  _renderViewSwitcher() {
    const views = [
      { id: 'chart', label: 'גרף' },
      ...(this.questionnaire ? [{ id: 'heatmap', label: 'מפת פריטים' }] : []),
      { id: 'table', label: 'טבלה' },
    ];
    return html`
      <div class="c-seg" role="group" aria-label="תצוגה">
        ${views.map(v => html`
          <button
            data-view=${v.id}
            aria-pressed=${this._effectiveView === v.id ? 'true' : 'false'}
            @click=${() => { this._view = v.id; this._closeExportMenu(); }}
          >${v.label}</button>
        `)}
      </div>
    `;
  }

  _renderExportCluster() {
    return html`
      <div class="export-cluster">
        ${canCopyImage() ? html`
          <button
            class="c-btn c-btn--sm ${this._copied ? 'c-btn--copied' : 'c-btn--secondary'} export-copy"
            @click=${() => this._copy()}
          >${this._copied ? 'הועתק ✓' : 'העתקה'}</button>
        ` : ''}
        <details
          class="export-menu"
          @keydown=${(e) => { if (e.key === 'Escape') this._closeExportMenu(); }}
          @focusout=${(e) => {
            // Close when focus leaves the menu entirely (tab-out or click elsewhere).
            if (!e.currentTarget.contains(e.relatedTarget)) this._closeExportMenu();
          }}
        >
          <summary class="c-btn c-btn--sm c-btn--secondary">ייצוא ▾</summary>
          <div class="menu">
            <button class="export-png" @click=${() => this._export('png')}>הורדת PNG</button>
            <button class="export-svg" @click=${() => this._export('svg')}>הורדת SVG</button>
            ${uniquePid(this.series.points) != null ? html`
              <label class="export-pid">
                <input
                  type="checkbox"
                  .checked=${this._exportPid}
                  @change=${(e) => { this._exportPid = e.target.checked; }}
                >
                כולל מזהה מטופל
              </label>
            ` : ''}
          </div>
        </details>
      </div>
    `;
  }

  render() {
    if (!this.series) return html``;
    const view = this._effectiveView;

    return html`
      <div class="head">
        <h3>${this.series.title}</h3>
        <div class="controls">
          ${this._renderViewSwitcher()}
          ${this._renderExportCluster()}
        </div>
      </div>

      ${view === 'chart' ? this._renderChart() : ''}
      ${view === 'heatmap' ? this._renderHeatmap() : ''}
      ${view === 'table' ? this._renderTable() : ''}
    `;
  }

  _renderChart() {
    const m = buildChartModel({
      points: this.series.points,
      interpretations: this.questionnaire?.interpretations,
      domain: this.domain,
    });

    return html`
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
                stroke="var(--clin-grid, #00000014)" stroke-width="1"></line>
          <text x=${m.plot.x - 16} y=${t.y + 3} text-anchor="end"
                font-size="10" fill="var(--color-text-muted, #78716c)">${t.label}</text>
        `)}

        ${m.cutoffs.map(c => svg`
          <line x1=${m.plot.x} y1=${c.y} x2=${m.plot.x + m.plot.w} y2=${c.y}
                stroke="var(--clin-cutoff, #b45309)" stroke-width="1.5"></line>
          ${c.label ? svg`
            <text x=${c.labelX} y=${c.y - 4} text-anchor=${c.labelAnchor}
                  direction="rtl" font-size="9" fill="var(--clin-cutoff, #b45309)">${c.label}</text>
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
                  fill=${k.baseline ? 'var(--clin-card-bg, #ffffff)' : 'var(--color-primary, #1A9FAD)'}
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
              ${columns.map(c => html`
                <th scope="col" class="col-head" title=${c.label} @click=${() => this._select(c)}>${c.displayLabel}</th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${m.rows.map(r => html`
              <tr>
                <th scope="row" title=${r.text}>${r.text}</th>
                ${cells(r).map((c, i) => c
                  ? html`<td class="cell" style="background:${c.fill}"
                         title="${columns[i].label} · ${c.value}"
                         @click=${() => this._select(columns[i])}>${m.compact ? '' : c.value}</td>`
                  : html`<td class="cell empty" title="${columns[i].label} · —"
                         @click=${() => this._select(columns[i])}>${m.compact ? '' : '—'}</td>`)}
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
            <tr
              class="session-row"
              tabindex="0"
              aria-label="פתיחת פירוט המפגש ${fmt.format(p.date)}"
              @click=${() => this._select(p)}
              @keydown=${(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._select(p); }
              }}
            >
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
