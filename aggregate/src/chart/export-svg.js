// export-svg.js — standalone SVG document builder for image export
// (AGGREGATE_SPEC §6). Pure string generation, no DOM — testable like
// chart-model (D-10 guardrail).
//
// The live chart renders through Lit with CSS custom properties from the
// page theme; an exported file has no page stylesheet, so this builder
// re-stamps the same chart model with literal light-theme colors and adds
// the framing the spec requires:
//
//   always:  instrument title, the chart, date range, generation
//            timestamp, "מדד" footer
//   never:   patient name (this module never even receives it),
//            free-text responses
//   opt-in:  pid (default off — some recipients treat any identifier
//            as PHI)
//
// Rasterization to PNG is a separate browser step (export-image.js).

import { t, currentLang } from '../../../clinician/i18n/index.js';
import { LANGS } from '../../../shared/i18n/core.js';
import { buildChartModel } from './chart-model.js';

// Logical size 800×500 → PNG 1600×1000 at 2× density (§6).
export const EXPORT_DIMS = { width: 800, height: 500 };
const HEADER_H = 64;
const FOOTER_H = 40;
const CHART_DIMS = {
  width: EXPORT_DIMS.width,
  height: EXPORT_DIMS.height - HEADER_H - FOOTER_H,
  margin: { top: 18, right: 18, bottom: 30, left: 48 },
};
const PAD_X = 18;   // matches the chart's horizontal margins

// Literal light-theme palette — the same values the live chart's var()
// fallbacks resolve to, so the export matches what the clinician sees.
const C = {
  bg:      '#ffffff',
  text:    '#311c08',
  muted:   '#796453',
  grid:    '#00000014',
  primary: '#c37829',
  cutoff:  '#32618e',
  alert:   '#b91c1c',
};

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

// Formatters follow the clinician's UI language (the export is read by the
// clinician, in whichever language they run the surface).
const locale = () => LANGS[currentLang()].locale;
const shortDate = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
const stampFmt = (d) => new Intl.DateTimeFormat(locale(), {
  day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d);

/**
 * The pid to offer for export: the single pid shared by *every* point, or
 * null when points are unidentified or mixed — stamping one patient's id
 * on a chart that includes another's sessions would mislabel data.
 */
export function uniquePid(points) {
  const pids = new Set((points ?? []).map(p => p.pid ?? null));
  if (pids.size !== 1) return null;
  const [only] = pids;
  return only;
}

/** madad-{questionnaireId}-{yyyy-mm-dd}.{ext} */
export function exportFilename(questionnaireId, now, ext) {
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `madad-${questionnaireId}-${date}.${ext}`;
}

/**
 * @param {object}      args
 * @param {object}      args.series          — { questionnaireId, title, points } from store.series()
 * @param {object}      [args.questionnaire] — config questionnaire (interpretations) or undefined
 * @param {[Date,Date]} [args.domain]        — the shared x-domain the on-screen chart used (D-14);
 *                                             the export shows what the clinician saw
 * @param {string|null} [args.pid]           — stamped on the image only when explicitly passed (§6 opt-in)
 * @param {Date}        [args.now]           — generation timestamp (injectable for tests)
 * @returns {{ svg: string, width: number, height: number }}
 */
export function buildExportSvg({ series, questionnaire, domain, pid = null, now = new Date() }) {
  const { width, height } = EXPORT_DIMS;
  const dir = LANGS[currentLang()].dir;
  const m = buildChartModel({
    points: series.points,
    interpretations: questionnaire?.interpretations,
    domain,
    dims: CHART_DIMS,
    dir,
  });

  const dates = series.points.map(p => p.date);
  const range = dates.length < 2
    ? shortDate(dates[0])
    : `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`;

  // Direction-relative text-anchor semantics (same as the live chart): with
  // direction=rtl 'start' puts the text's RIGHT edge at x (extends leftward)
  // and 'end' extends rightward; ltr mirrors both. So the reading-start edge
  // is the right margin in rtl and the left margin in ltr, and 'start'/'end'
  // keep meaning "reading start / reading end" in both.
  const rtl = dir === 'rtl';
  const startX = rtl ? width - PAD_X : PAD_X;
  const endX   = rtl ? PAD_X : width - PAD_X;
  const header = [
    `<text x="${startX}" y="28" direction="${dir}" text-anchor="start" font-size="17" font-weight="700" fill="${C.text}">${esc(series.title)}</text>`,
    `<text x="${startX}" y="48" direction="${dir}" text-anchor="start" font-size="11" fill="${C.muted}">${esc(range)}</text>`,
  ];

  const footerY = height - 15;
  const footer = [
    `<line x1="${PAD_X}" y1="${height - FOOTER_H + 6}" x2="${width - PAD_X}" y2="${height - FOOTER_H + 6}" stroke="${C.grid}" stroke-width="1"></line>`,
    `<text x="${startX}" y="${footerY}" direction="${dir}" text-anchor="start" font-size="13" font-weight="700" fill="${C.primary}">${esc(t('export.brand'))}</text>`,
    `<text x="${endX}" y="${footerY}" direction="${dir}" text-anchor="end" font-size="10" fill="${C.muted}">${esc(t('export.generated', { stamp: stampFmt(now) }))}</text>`,
  ];
  if (pid != null) {
    footer.push(`<text x="${width / 2}" y="${footerY}" direction="${dir}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(t('export.pid', { pid }))}</text>`);
  }

  const chart = [
    ...m.bands.map(b => [
      `<rect x="${m.plot.x}" y="${b.y}" width="${m.plot.w}" height="${b.h}" fill="${b.fill}"></rect>`,
      `<text x="${b.labelX}" y="${b.y + 11}" text-anchor="${b.labelAnchor}" direction="${dir}" font-size="9" fill="${C.muted}">${esc(b.label)}</text>`,
    ].join('')),
    ...m.yTicks.map(t => [
      `<line x1="${m.plot.x}" y1="${t.y}" x2="${m.plot.x + m.plot.w}" y2="${t.y}" stroke="${C.grid}" stroke-width="1"></line>`,
      `<text x="${m.plot.x - 16}" y="${t.y + 3}" text-anchor="end" font-size="10" fill="${C.muted}">${esc(t.label)}</text>`,
    ].join('')),
    ...m.cutoffs.map(c => [
      `<line x1="${m.plot.x}" y1="${c.y}" x2="${m.plot.x + m.plot.w}" y2="${c.y}" stroke="${C.cutoff}" stroke-width="1.5"></line>`,
      c.label ? `<text x="${c.labelX}" y="${c.y - 4}" text-anchor="${c.labelAnchor}" direction="${dir}" font-size="9" fill="${C.cutoff}">${esc(c.label)}</text>` : '',
    ].join('')),
    m.linePath
      ? `<path d="${m.linePath}" fill="none" stroke="${C.primary}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`
      : '',
    ...m.markers.map(k => [
      k.alerts.length
        ? `<circle cx="${k.x}" cy="${k.y}" r="8.5" fill="none" stroke="${C.alert}" stroke-width="1.5"></circle>`
        : '',
      `<circle class="marker" cx="${k.x}" cy="${k.y}" r="${k.baseline ? 6 : 4.5}" fill="${k.baseline ? C.bg : C.primary}" stroke="${C.primary}" stroke-width="${k.baseline ? 2.5 : 0}"></circle>`,
    ].join('')),
    ...m.xTicks.map(t =>
      `<text x="${t.x}" y="${m.plot.y + m.plot.h + 16}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(t.label)}</text>`),
  ];

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}"></rect>`,
    ...header,
    `<g transform="translate(0 ${HEADER_H})">`,
    ...chart,
    `</g>`,
    ...footer,
    `</svg>`,
  ].join('\n');

  return { svg, width, height };
}
