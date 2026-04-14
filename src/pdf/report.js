// PDF report generator.
//
// Public API:
//   preloadPdf()   — call once at app startup (fire-and-forget).
//                    Begins fetching pdfmake + fonts in the background so they
//                    are ready by the time the patient finishes the session.
//
//   generateReport(sessionState, config, session)
//                  — builds the PDF and returns a { blob, filename } object.
//                    Awaits preload internally; safe to call immediately.
//
// Font note:
//   Vite resolves the ?url imports to hashed asset URLs at build time.
//   At runtime we fetch() those URLs to get ArrayBuffers, which are passed
//   directly into pdfmake's vfs argument — no global vfs mutation, no
//   vfs_fonts.js build step required.
//
// RTL RENDERING NOTE:
//   In pdfmake + Hebrew font, within a right-aligned paragraph text array[0]
//   is the LEFTMOST node on screen. Higher indices move right. The PDF viewer
//   then applies its own BiDi on top, which is why bidiNodes() pre-reverses
//   mixed runs — the two transformations cancel out correctly.
//   For table columns: col[0] is always leftmost regardless of text direction.
//   For subscores we use columns:{} layout to isolate each entry from
//   cross-entry BiDi interference.


import regularFontUrl from '../../public/fonts/NotoSansHebrew-Regular.ttf?url';
import boldFontUrl    from '../../public/fonts/NotoSansHebrew-Bold.ttf?url';

// ── Branding ──────────────────────────────────────────────────────────────────
const getAppUrl = () => {
  if (typeof window === 'undefined') return 'https://eladzlot.github.io/madad/';
  const { origin, pathname } = window.location;
  // Resolve the landing page URL relative to wherever the app is deployed.
  // pathname is e.g. /madad/ or /madad/index.html — strip to the base path.
  const base = pathname.replace(/\/(composer|landing)(\/.*)?$/, '/');
  return `${origin}${base}`;
};

const getComposerUrl = () => `${getAppUrl()}composer/`;

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_MARGIN  = 40;
const USABLE_WIDTH = 515;   // A4 595pt − 2×40pt margins
const FONT_NAME    = 'NotoSansHebrew';

// Item table column widths — RTL visual: score | label | text | #
const COL_WIDTHS = [26, 168, 275, 20];

// Typography scale
const SZ = {
  header_label:  8,
  header_value: 10,
  measure:      12,   // summary measure name — bold anchor
  score:        14,   // summary score — primary anchor
  severity:      9,   // lighter, subordinate
  // Section header (de-emphasized vs summary)
  section_measure:  11,
  section_score:    12,
  section_severity:  9,
  badge:         8,
  subscores:     9,
  th:            8,
  td:            9,
  footer:        8,
};

// Row highlight colours — muted, same perceptual intensity
const HIGHLIGHT_CRITICAL    = '#FEF8F8';
const HIGHLIGHT_ELEVATED    = '#FEFBF0';
const HIGHLIGHT_CRITICAL_FG = '#991B1B';
const HIGHLIGHT_ELEVATED_FG = '#78350F';

// Pill badge colours
const PILL_CRITICAL_BG = '#FEE2E2';  const PILL_CRITICAL_FG = '#B91C1C';
const PILL_WARNING_BG  = '#FEF3C7';  const PILL_WARNING_FG  = '#92400E';

// ── Preload state ─────────────────────────────────────────────────────────────
// State machine: 'idle' → 'loading' → 'ready'
//                          └────────→ 'failed'
// 'failed' resets to 'loading' whenever _load() is called (i.e. on retry).
//
// _load() is the only function that mutates _state and _promise.
// It is called by preloadPdf() on first startup and by generateReport() on retry.

export class PdfGenerationError extends Error {
  constructor() {
    super('PDF generation failed: assets could not be loaded');
    this.name = 'PdfGenerationError';
  }
}

let _state   = 'idle';   // 'idle' | 'loading' | 'ready' | 'failed'
let _promise = null;     // current load Promise; null when idle

function _load() {
  _state   = 'loading';
  _promise = Promise.all([
    import('pdfmake/build/pdfmake'),
    import('bidi-js').then(m => { _bidi = (m.default ?? m)(); }),
    fetch(regularFontUrl).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch font: ${regularFontUrl} (${r.status})`);
      return r.arrayBuffer();
    }),
    fetch(boldFontUrl).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch font: ${boldFontUrl} (${r.status})`);
      return r.arrayBuffer();
    }),
  ]);
  _promise.then(() => { _state = 'ready'; }).catch(() => { _state = 'failed'; });
  return _promise;
}

export function preloadPdf() {
  if (_state !== 'idle') return;
  _load().catch(err => console.error('[report] preload failed:', err));
}

/** For use in tests only — resets all module-level state to initial values. */
export function _resetPreloadForTesting() {
  _state   = 'idle';
  _promise = null;
  _bidi    = null;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Builds the PDF and returns { blob, filename }.
 *
 * If the initial asset load failed, one automatic retry is attempted before
 * giving up. Throws PdfGenerationError (not the raw cause) so callers can
 * show a user-facing message without exposing internal error details.
 *
 * @param {object} sessionState  — { answers, scores, alerts } from orchestrator
 * @param {object} config        — full QuestionnaireSet config
 * @param {object} session       — { name?, pid? } from app.js
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateReport(sessionState, config, session) {
  // Ensure a load is in flight.
  if (_state === 'idle') _load().catch(err => console.error('[report] preload failed:', err));

  let assets;
  try {
    assets = await _promise;
  } catch (firstErr) {
    // Asset load failed — attempt one automatic retry.
    console.error('[report] asset load failed, retrying once:', firstErr);
    try {
      assets = await _load();
    } catch (retryErr) {
      console.error('[report] asset retry failed:', retryErr);
      throw new PdfGenerationError();
    }
  }
  const [pdfmakeModule, , regularAB, boldAB] = assets;
  const pdfmake = pdfmakeModule.default ?? pdfmakeModule;

  const toBase64 = (ab) => {
    const bytes = new Uint8Array(ab);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  pdfmake.addVirtualFileSystem({
    'NotoSansHebrew-Regular.ttf': toBase64(regularAB),
    'NotoSansHebrew-Bold.ttf':    toBase64(boldAB),
  });

  pdfmake.addFonts({
    [FONT_NAME]: {
      normal:      'NotoSansHebrew-Regular.ttf',
      bold:        'NotoSansHebrew-Bold.ttf',
      italics:     'NotoSansHebrew-Regular.ttf',
      bolditalics: 'NotoSansHebrew-Bold.ttf',
    },
  });

  const docDefinition = buildDocDefinition(sessionState, config, session);
  const filename = buildFilename(session);

  const pdfDoc = pdfmake.createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();
  const blob   = new Blob([buffer], { type: 'application/pdf' });

  return { blob, filename };
}

// ── Filename ──────────────────────────────────────────────────────────────────

export function buildFilename(session, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const pid  = session?.pid ? `-${session.pid}` : '';
  return `report${pid}-${date}.pdf`;
}

// ── BiDi text helper ──────────────────────────────────────────────────────────
// pdfmake does not implement the Unicode Bidirectional Algorithm.
// We pre-process strings using bidi-js (UAX-9 conformant) to produce
// correctly ordered pdfmake text nodes.
//
// Use regular spaces in mixed Hebrew/Latin strings (e.g. "דיכאון (PHQ-9)") —
// NBSP fuses tokens into one, breaking script classification.

let _bidi = null;
const NBSP = '\u00a0';

function _getBidi() {
  if (!_bidi) throw new Error('[report] bidi-js not initialised — call preloadPdf() or initBidiForTesting()');
  return _bidi;
}

/** For use in tests only. */
export async function initBidiForTesting() {
  if (_bidi) return;
  const m = await import('bidi-js');
  _bidi = (m.default ?? m)();
}

function _tokenLevel(tok) {
  const bidi = _getBidi();
  let rtl = 0, ltr = 0;
  for (const c of tok) {
    const t = bidi.getBidiCharTypeName(c);
    if (t === 'R' || t === 'AL') rtl++;
    else if (t === 'L' || t === 'EN') ltr++;
  }
  return (ltr > 0 && rtl === 0) ? 2 : 1;
}

function _mirror(str) {
  const bidi = _getBidi();
  return [...str].map(c => bidi.getMirroredCharacter(c) ?? c).join('');
}

/**
 * Convert a string to pdfmake text nodes with correct BiDi visual order.
 *
 * @param   {string} str
 * @param   {object} [opts]  — pdfmake text node properties to merge in
 * @returns {Array}
 */
export function bidiNodes(str, opts = {}) {
  if (!str) return [{ text: '', ...opts }];
  str = String(str);

  const hasHebrew = [...str].some(c => { const t = _getBidi().getBidiCharTypeName(c); return t === 'R' || t === 'AL'; });
  const hasLtr    = [...str].some(c => { const t = _getBidi().getBidiCharTypeName(c); return t === 'L' || t === 'EN'; });

  if (!hasHebrew || !hasLtr) {
    const text = hasHebrew ? _mirror(str).replace(/ /g, NBSP) : str.replace(/ /g, NBSP);
    return [{ text, ...opts }];
  }

  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === ' ') { i++; continue; }
    let j = i;
    while (j < str.length && str[j] !== ' ') j++;
    const word = str.slice(i, j);
    const parts = word.split(/(?<=[֐-׿]-)(?=[A-Za-z])|(?<=[A-Za-z]-)(?=[֐-׿])/);
    for (const part of parts) {
      if (part) tokens.push({ tok: part, level: _tokenLevel(part) });
    }
    i = j;
  }

  const runs = [];
  for (const t of tokens) {
    const prev = runs[runs.length - 1];
    if (prev && prev.level === t.level) prev.words.push(t.tok);
    else runs.push({ level: t.level, words: [t.tok] });
  }

  const visual = [...runs].reverse();
  const nodes  = [];
  visual.forEach((run, idx) => {
    const text = run.level === 1 ? _mirror(run.words.join(NBSP)) : run.words.join(NBSP);
    nodes.push({ text, ...opts });
    if (idx < visual.length - 1) nodes.push({ text: NBSP });
  });
  return nodes;
}

// ── Measure name ──────────────────────────────────────────────────────────────

function measureName(q) {
  // Regular space so bidiNodes() tokenises Hebrew title and Latin abbr separately
  return q.abbr ? `${q.title} (${q.abbr})` : q.title;
}

// ── Score formatting ─────────────────────────────────────────────────────────
// Integers display as-is. Floats (mean-based) display to 1 decimal.
function formatScore(val) {
  if (val == null) return null;
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}
// Mean subscales always show 1 decimal so 2.0 renders "2.0" not "2".
function formatSubscale(val, subscaleMethod) {
  if (val == null) return '—';
  if (subscaleMethod === 'mean') return Number(val).toFixed(1);
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

// ── Document definition ───────────────────────────────────────────────────────

export function buildDocDefinition(sessionState, config, session, now = new Date()) {
  const isMulti = Object.keys(sessionState.answers ?? {}).length > 1;

  const content = [
    buildHeader(session, now),
    isMulti ? buildSummaryBlock(sessionState, config) : null,
    isMulti ? buildHr() : null,
    ...buildDetailSections(sessionState, config),
  ].filter(Boolean);

  return {
    pageSize:    'A4',
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN + 10],
    defaultStyle: {
      font:      FONT_NAME,
      fontSize:  10,
      alignment: 'right',
    },
    styles: {
      th: { fontSize: SZ.th, bold: true, color: '#AAAAAA', fillColor: '#F7F7F7' },
      instructionText: {
        fontSize:  9,
        alignment: 'right',
        color:     '#888888',
        italics:   true,
        margin:    [0, 0, 0, 6],
      },
    },
    content,
    footer: buildFooter(),
  };
}

// ── Header ────────────────────────────────────────────────────────────────────
// 3-column RTL: col[0]=left=date | col[1]=mid=pid | col[2]=right=name

export function buildHeader(session, nowOrConfig, maybeNow) {
  // Accept both buildHeader(session, now) and legacy buildHeader(session, config, now)
  const now = maybeNow ?? nowOrConfig;
  const dateStr = now.toLocaleDateString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const timeStr = now.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit',
  });

  function col(label, valueNodes) {
    return {
      stack: [
        { text: label,      fontSize: SZ.header_label, color: '#BBBBBB', alignment: 'right' },
        { text: valueNodes, fontSize: SZ.header_value, color: '#1A1A1A', alignment: 'right' },
      ],
      border: [false, false, false, false],
    };
  }

  return {
    table: {
      widths: ['*', '*', '*'],
      body: [[
        col('תאריך',     [{ text: `${dateStr}${NBSP}${timeStr}` }]),
        col('מזהה אישי', [{ text: session?.pid || '—' }]),
        col('שם',        bidiNodes(session?.name || '—')),
      ]],
    },
    layout: {
      paddingLeft: () => 0,  paddingRight: () => 0,
      paddingTop:  () => 0,  paddingBottom: () => 0,
      hLineWidth: () => 0,   vLineWidth:   () => 0,
    },
    marginBottom: 20,
  };
}

// ── Pill badge ────────────────────────────────────────────────────────────────
// Single-cell mini-table — closest pdfmake approximation of a pill shape.
// ⚠ (U+26A0) not in NotoSansHebrew — ASCII "!!" / "!" used instead.
// margin:[0,3,0,0] centres the pill vertically in the row — nested tables
// ignore verticalAlignment, margin is the only reliable lever.

function pillBadge(label, severity) {
  const isCrit = severity === 'critical';
  const bg = isCrit ? PILL_CRITICAL_BG : PILL_WARNING_BG;
  const fg = isCrit ? PILL_CRITICAL_FG : PILL_WARNING_FG;
  const icon = isCrit ? '!!' : '!';

  return {
    table: {
      widths: ['auto'],
      body: [[{
        // In pdfmake RTL paragraphs, array[0] = leftmost visually.
        // We want icon on the RIGHT of the pill (RTL reading: icon first).
        // So: label nodes first (left), icon last (right).
        // alignment:'right' → array[0]=rightmost. Icon rightmost = RTL reader sees it first.
        text: [
          { text: icon + NBSP, fontSize: SZ.badge, color: fg, bold: true },
          ...bidiNodes(label, { fontSize: SZ.badge, color: fg }),
        ],
        fillColor: bg,
        border: [false, false, false, false],
      }]],
    },
    layout: {
      paddingLeft:   () => 6,  paddingRight:  () => 6,
      paddingTop:    () => 2,  paddingBottom: () => 2,
      hLineWidth: () => 0,     vLineWidth:    () => 0,
    },
    alignment: 'right',
    margin: [0, 3, 0, 0],
  };
}

// ── HR separator ──────────────────────────────────────────────────────────────

function buildHr() {
  return {
    canvas: [{
      type: 'line',
      x1: 0, y1: 0, x2: USABLE_WIDTH, y2: 0,
      lineWidth: 0.5,
      lineColor: '#E8E8E8',
    }],
    margin: [0, 16, 0, 22],
  };
}

// ── Summary block (multi-mode only) ──────────────────────────────────────────
//
// 4-column table — strict column alignment across all rows:
//   col[3] measure  (auto) — rightmost, bold anchor
//   col[2] score    (auto) — immediately left of measure
//   col[1] severity (auto) — light, subordinate
//   col[0] badge    (*)    — leftmost, pills pushed right via inner spacer

export function buildSummaryBlock(sessionState, config) {
  // Build rows in config order, but keyed by sessionKey (not q.id).
  // sessionKey = node.instanceId ?? node.questionnaireId from orchestrator.
  // We match by looking up each answered sessionKey against config questionnaires.
  const sessionEntries = Object.keys(sessionState.answers ?? {})
    .map(sessionKey => ({ sessionKey, q: config.questionnaires?.find(q => q.id === sessionKey) }))
    .filter(({ q }) => q != null)
    // preserve config questionnaire order
    .sort((a, b) => {
      const ai = config.questionnaires.indexOf(a.q);
      const bi = config.questionnaires.indexOf(b.q);
      return ai - bi;
    });

  const rows = sessionEntries.map(({ sessionKey, q }) => {
    const score        = sessionState.scores?.[sessionKey];
    const alerts       = sessionState.alerts?.[sessionKey] ?? [];
    const scoreDisplay = score?.total != null ? (formatScore(score.total) ?? 'הושלם') : 'הושלם';
    const severity     = score?.category ?? '';

    const measureCell = {
      text: bidiNodes(measureName(q), { fontSize: SZ.measure, bold: true, color: '#111111' }),
      alignment: 'right',
      verticalAlignment: 'middle',
      border: [false, false, false, false],
    };

    const scoreCell = {
      text: [{ text: scoreDisplay, fontSize: SZ.score, bold: true, color: '#111111' }],
      alignment: 'right',
      verticalAlignment: 'middle',
      border: [false, false, false, false],
    };

    const severityCell = {
      text: severity ? bidiNodes(severity, { fontSize: SZ.severity, color: '#555555' }) : [{ text: '' }],
      alignment: 'right',
      verticalAlignment: 'middle',
      border: [false, false, false, false],
    };

    // Spacer column pushes pills to the right edge of the * column.
    // verticalAlignment is ignored on nested table cells — margin handles it.
    const badgeCell = {
      stack: alerts.length > 0
        ? alerts.map((a, i) => ({
            columns: [
              { width: '*', text: '' },
              { width: 'auto', stack: [pillBadge(a.message, a.severity)], alignment: 'right' },
            ],
            marginBottom: i < alerts.length - 1 ? 2 : 0,
          }))
        : [{ text: '', fontSize: SZ.badge }],
      border: [false, false, false, false],
    };

    // col[0]=left=badge(*), col[1]=severity, col[2]=score, col[3]=right=measure
    return [badgeCell, severityCell, scoreCell, measureCell];
  });

  return {
    table: {
      widths: ['*', 'auto', 'auto', 'auto'],
      body: rows,
    },
    layout: {
      paddingLeft:   (i, node, col) => col === 0 ? 0 : col === 1 ? 12 : 4,
      paddingRight:  (i, node, col) => col === 3 ? 0 : 4,
      paddingTop:    () => 1,
      paddingBottom: () => 1,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    marginBottom: 0,
  };
}

// ── Detail sections ───────────────────────────────────────────────────────────

export function buildDetailSections(sessionState, config) {
  // Iterate completed sessions in answer order; look up the questionnaire definition.
  // This correctly handles instanceId-based sessionKeys and missing questionnaires.
  return Object.entries(sessionState.answers ?? {}).map(([sessionKey, answers]) => {
    const q = config.questionnaires?.find(q => q.id === sessionKey);
    if (!q) return null;

    return {
      stack: [
        buildSectionHeader(q, sessionState, sessionKey),
        buildSubscoresLine(q, sessionState, sessionKey),
        buildResponseTable(q, answers),
      ].filter(Boolean),
      marginBottom: 32,
    };
  }).filter(Boolean);
}

// ── Section header ────────────────────────────────────────────────────────────
// Same 4-column structure as summary, de-emphasized:
// smaller sizes, lighter colors, regular weight on measure name.

export function buildSectionHeader(q, sessionState, sessionKey) {
  sessionKey = sessionKey ?? q.id;
  const score        = sessionState.scores?.[sessionKey];
  const alerts       = sessionState.alerts?.[sessionKey] ?? [];
  const scoreDisplay = score?.total != null ? (formatScore(score.total) ?? 'הושלם') : 'הושלם';
  const severity     = score?.category ?? '';

  const measureCell = {
    text: bidiNodes(measureName(q), { fontSize: SZ.section_measure, bold: false, color: '#444444' }),
    alignment: 'right',
    verticalAlignment: 'middle',
    border: [false, false, false, false],
  };

  const scoreCell = {
    text: [{ text: scoreDisplay, fontSize: SZ.section_score, bold: true, color: '#333333' }],
    alignment: 'right',
    verticalAlignment: 'middle',
    border: [false, false, false, false],
  };

  const severityCell = {
    text: severity ? bidiNodes(severity, { fontSize: SZ.section_severity, color: '#888888' }) : [{ text: '' }],
    alignment: 'right',
    verticalAlignment: 'middle',
    border: [false, false, false, false],
  };

  const badgeCell = {
    stack: alerts.length > 0
      ? alerts.map((a, i) => ({
          columns: [
            { width: '*', text: '' },
            { width: 'auto', stack: [pillBadge(a.message, a.severity)], alignment: 'right' },
          ],
          marginBottom: i < alerts.length - 1 ? 2 : 0,
        }))
      : [{ text: '', fontSize: SZ.badge }],
    border: [false, false, false, false],
  };

  return {
    table: {
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [[badgeCell, severityCell, scoreCell, measureCell]],
    },
    layout: {
      paddingLeft:   (i, node, col) => col === 0 ? 0 : col === 1 ? 12 : 4,
      paddingRight:  (i, node, col) => col === 3 ? 0 : 4,
      paddingTop:    () => 1,
      paddingBottom: () => 1,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    marginBottom: 8,
  };
}

// ── Subscores line ────────────────────────────────────────────────────────────
// Uses columns:{} so each entry is isolated — BiDi never crosses boundaries.
// col[0]=leftmost, last col=rightmost (prefix). Entries reversed so entry[0]
// lands rightmost (immediately left of prefix).

export function buildSubscoresLine(q, sessionState, sessionKey) {
  sessionKey = sessionKey ?? q.id;
  const score   = sessionState.scores?.[sessionKey];
  const entries = Object.entries(score?.subscales ?? {});
  if (!entries.length) return null;

  const subscaleMethod = q.scoring?.subscaleMethod ?? 'sum';
  const entryColumns = [];
  entries.forEach(([subId, val], i) => {
    if (i > 0) {
      entryColumns.push({
        width: 'auto',
        text: [{ text: '·', color: '#CCCCCC', fontSize: SZ.subscores }],
        alignment: 'right',
      });
    }
    const label = q.subscaleLabels?.[subId] ?? subId;
    const display = formatSubscale(val, subscaleMethod);
    entryColumns.push({
      width: 'auto',
      text: [
        { text: display + NBSP, fontSize: SZ.subscores, bold: true, color: '#555555' },
        ...bidiNodes(label, { fontSize: SZ.subscores, color: '#999999' }),
      ],
      alignment: 'right',
    });
  });

  entryColumns.reverse();

  return {
    columns: [
      { width: '*', text: '' },
      ...entryColumns,
      {
        width: 'auto',
        text: bidiNodes('תתי-מדדים:', { fontSize: SZ.subscores, color: '#BBBBBB' }),
        alignment: 'right',
      },
    ],
    columnGap: 5,
    marginBottom: 8,
  };
}

// ── Response table ────────────────────────────────────────────────────────────

// Recursively flatten questionnaire items into a list of leaf items for PDF
// rendering. Items inside `if`/`randomize` control-flow nodes are only
// included when they were actually answered — i.e. their branch was taken.
// Top-level items are always included (shown as '—' when unanswered).
function flattenItems(nodes, answers, insideIf = false) {
  const result = [];
  for (const node of nodes ?? []) {
    if (node.type === 'if') {
      result.push(...flattenItems(node.then, answers, true));
      result.push(...flattenItems(node.else, answers, true));
    } else if (node.type === 'randomize') {
      result.push(...flattenItems(node.ids, answers, insideIf));
    } else {
      // Items inside a conditional branch: only show if the patient answered them.
      // Items at the top level: always show (even if unanswered, renders as '—').
      if (!insideIf || Object.prototype.hasOwnProperty.call(answers, node.id)) {
        result.push(node);
      }
    }
  }
  return result;
}

export function buildResponseTable(questionnaire, answers) {
  const items = flattenItems(questionnaire.items, answers);
  if (!items || items.length === 0) return null;

  const blocks    = [];
  const tableRows = [];
  let rowNum = 0;

  const flushTable = () => {
    if (!tableRows.length) return;
    blocks.push({
      table: {
        headerRows: 1,
        widths: COL_WIDTHS,
        body: [buildTableHeaderRow(), ...tableRows],
        dontBreakRows: true,
        keepWithHeaderRows: 1,
      },
      layout: {
        hLineColor: () => '#EBEBEB',
        vLineColor: () => '#EBEBEB',
        hLineWidth: (i) => (i === 0 || i === 1) ? 0.75 : 0.5,
        vLineWidth: () => 0.5,
        paddingLeft:   () => 5,  paddingRight:  () => 5,
        paddingTop:    () => 3,  paddingBottom: () => 3,
      },
      marginBottom: 4,
    });
    tableRows.length = 0;
    rowNum = 0;
  };

  for (const item of items) {
    if (item.type === 'instructions') {
      flushTable();
      blocks.push({ text: bidiNodes(item.text), style: 'instructionText' });
    } else if (item.type === 'text') {
      flushTable();
      blocks.push(buildTextBlock(item, answers[item.id]));
    } else if (item.type === 'multiselect') {
      flushTable();
      blocks.push(buildMultiselectBlock(item, answers[item.id]));
    } else {
      rowNum++;
      tableRows.push(buildItemRow(item, rowNum, answers[item.id], questionnaire));
    }
  }

  flushTable();

  const hasAnyAnswerable = items.some(i => i.type !== 'instructions');
  if (!hasAnyAnswerable) return null;

  return blocks.length === 1 ? blocks[0] : { stack: blocks };
}

// ── Table header row ──────────────────────────────────────────────────────────

export function buildTableHeaderRow() {
  const cell = (text, align = 'right') => ({ text, style: 'th', alignment: align });
  return [
    cell('ציון', 'center'),
    cell('תשובה'),
    cell('תוכן\u00a0הפריט'),
    cell('#', 'center'),
  ];
}

// ── Item row ──────────────────────────────────────────────────────────────────

export function buildItemRow(item, rowNum, rawAnswer, questionnaire) {
  const options  = resolveOptions(item, questionnaire);
  const answered = rawAnswer != null;

  const option  = options.find(o => o.value === rawAnswer) ?? null;
  const label   = option?.label ?? (answered ? String(rawAnswer) : '—');
  const risk    = answered ? calcRiskLevel(item, rawAnswer, options) : null;

  const fill  = risk === 'high' ? HIGHLIGHT_CRITICAL : risk === 'med' ? HIGHLIGHT_ELEVATED : null;
  const color = risk === 'high' ? HIGHLIGHT_CRITICAL_FG : risk === 'med' ? HIGHLIGHT_ELEVATED_FG : '#333333';

  const cell = (content, align = 'right') => ({
    text: content, alignment: align, color, fillColor: fill ?? undefined, fontSize: SZ.td,
  });

  return [
    cell(answered ? String(rawAnswer) : '—', 'center'),
    cell(bidiNodes(label)),
    cell(bidiNodes(item.text)),
    cell(String(rowNum), 'center'),
  ];
}

// ── Text item block ───────────────────────────────────────────────────────────

export function buildTextBlock(item, answer) {
  return {
    stack: [
      { text: bidiNodes(item.text), bold: true, fontSize: SZ.td, alignment: 'right', margin: [0, 0, 0, 3] },
      {
        text: answer ? bidiNodes(String(answer)) : [{ text: '—', color: '#AAAAAA' }],
        fontSize: SZ.td,
        alignment: 'right',
      },
    ],
    margin: [0, 6, 0, 10],
  };
}

// ── Multiselect item block ────────────────────────────────────────────────────

export function buildMultiselectBlock(item, answer) {
  const options  = item.options ?? [];
  const selected = Array.isArray(answer) ? answer : [];
  const labels   = selected
    .filter(i => i >= 1 && i <= options.length)
    .map(i => options[i - 1].label);

  // Each label through bidiNodes separately; ' | ' as neutral separator between
  const answerContent = labels.length > 0
    ? labels
        .flatMap((l, i) => i === 0 ? bidiNodes(l) : [{ text: ' | ' }, ...bidiNodes(l)])
        .map(n => ({ ...n, fontSize: SZ.td }))
    : [{ text: '—', color: '#AAAAAA', fontSize: SZ.td }];

  return {
    stack: [
      { text: bidiNodes(item.text), bold: true, fontSize: SZ.td, alignment: 'right', margin: [0, 0, 0, 3] },
      { text: answerContent, fontSize: SZ.td, alignment: 'right' },
    ],
    margin: [0, 6, 0, 10],
  };
}

// ── Risk calculation ──────────────────────────────────────────────────────────

export function calcRiskLevel(item, value, options) {
  if (item.type === 'slider') {
    const { min = 0, max = 10 } = item;
    const range = max - min;
    if (range <= 0) return null;
    const pos = (value - min) / range;
    if (pos >= 0.8) return 'high';
    if (pos >= 0.6) return 'med';
    return null;
  }

  if (!options || options.length === 0) return null;

  const values = options.map(o => o.value).sort((a, b) => a - b);
  const max    = values[values.length - 1];
  const second = values[values.length - 2];

  if (value === max) return 'high';
  if (item.type === 'select' && value === second) return 'med';
  return null;
}

// ── Option resolution ─────────────────────────────────────────────────────────

export function resolveOptions(item, questionnaire) {
  if (item.options) return item.options;
  const setId = item.optionSetId ?? questionnaire.defaultOptionSetId;
  return questionnaire.optionSets?.[setId] ?? [];
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function buildFooter() {
  const composerUrl = getComposerUrl();

  return (currentPage, pageCount) => ({
    columns: [{
      text: [
        { text: `עמוד${NBSP}${currentPage}${NBSP}מתוך${NBSP}${pageCount}` },
        { text: `${NBSP}${NBSP}|${NBSP}${NBSP}` },
        { text: composerUrl, link: composerUrl, color: '#1E9BAA' },
        { text: `${NBSP}${NBSP}|${NBSP}${NBSP}` },
        ...bidiNodes(`מדד — מדידה קלינית בלי חיכוך`),
      ],
      alignment: 'right',
      fontSize:  SZ.footer,
      color:     '#BBBBBB',
      margin:    [PAGE_MARGIN, 8, PAGE_MARGIN, 0],
    }],
  });
}

// ── Backward-compat exports ───────────────────────────────────────────────────
// These functions are tested directly and/or called from external code.
// buildHeader previously took (session, config, now) — config was used only for
// the version footer (now in buildFooter).

export { buildHeader as _buildHeaderNew };

/**
 * @param {object} session
 * @param {object} _config  — accepted for backward compat, ignored
 * @param {Date}   now
 */
export function buildHeaderCompat(session, _config, now) {
  return buildHeader(session, now);
}

// buildAlertSection — replaced by inline pills in summary/section headers.
// Kept as a no-op export so existing tests and imports don't break at runtime.
export function buildAlertSection() {
  return null;
}

// buildScoresLine — replaced by buildSubscoresLine (columns-based).
// Kept for test compatibility; returns null so callers degrade gracefully.
export function buildScoresLine() {
  return null;
}
