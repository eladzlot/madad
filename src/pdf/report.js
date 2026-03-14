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


// FONT_PLACEHOLDER — replace these two lines once font files are in public/fonts/
import regularFontUrl from '../../public/fonts/NotoSansHebrew-Regular.ttf?url';
import boldFontUrl    from '../../public/fonts/NotoSansHebrew-Bold.ttf?url';

// ── Branding ──────────────────────────────────────────────────────────────────
const APP_URL  = 'https://example.com';          // TODO: parameterise via config

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_MARGIN   = 40;   // pt, all sides
// A4 width 595pt − 2×40pt margins = 515pt usable
const COL_NUM       = 25;   // item number
const COL_TEXT      = 265;  // item text (Hebrew)
const COL_LABEL     = 175;  // response label
const COL_SCORE     = 50;   // numeric score
const COL_WIDTHS    = [COL_SCORE, COL_LABEL, COL_TEXT, COL_NUM];  // RTL visual order: ערך | תשובה | תוכן | #

const FONT_NAME     = 'NotoSansHebrew';

// Risk highlight colours (match IMPLEMENTATION_SPEC §18)
const RISK_HIGH_BG  = '#FCE8E8';
const RISK_HIGH_FG  = '#8A1C1C';
const RISK_MED_BG   = '#FFF6DB';
const RISK_MED_FG   = '#8A6A00';

// Alert section colours
const ALERT_BG      = '#FFF4F4';
const ALERT_BORDER  = '#CC0000';

// ── Preload state ─────────────────────────────────────────────────────────────

let _ready = null;   // Promise<[pdfmakeModule, regularAB, boldAB]>

export function preloadPdf() {
  if (_ready) return;
  _ready = Promise.all([
    import('pdfmake/build/pdfmake'),
    fetch(regularFontUrl).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch font: ${regularFontUrl} (${r.status})`);
      return r.arrayBuffer();
    }),
    fetch(boldFontUrl).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch font: ${boldFontUrl} (${r.status})`);
      return r.arrayBuffer();
    }),
  ]);
  // Surface load failures immediately rather than hanging silently
  _ready.catch(err => console.error('[report] preload failed:', err));
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Builds the PDF and returns { blob, filename }.
 * Caller is responsible for download or share.
 *
 * @param {object} sessionState  — { answers, scores, alerts } from orchestrator
 * @param {object} config        — full QuestionnaireSet config
 * @param {object} session       — { name?, pid? } from app.js
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateReport(sessionState, config, session) {
  if (!_ready) preloadPdf();   // defensive: start if caller forgot
  const [pdfmakeModule, regularAB, boldAB] = await _ready;
  const pdfmake = pdfmakeModule.default ?? pdfmakeModule;

  // pdfmake 0.3.x API: addVirtualFileSystem expects base64 strings.
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

  const pdfDoc  = pdfmake.createPdf(docDefinition);
  const buffer  = await pdfDoc.getBuffer();
  const blob    = new Blob([buffer], { type: 'application/pdf' });

  return { blob, filename };
}

// ── Filename ──────────────────────────────────────────────────────────────────

export function buildFilename(session, now = new Date()) {
  const date = now.toISOString().slice(0, 10);   // YYYY-MM-DD
  const pid  = session?.pid ? `-${session.pid}` : '';
  return `report${pid}-${date}.pdf`;
}

// ── BiDi text helper ──────────────────────────────────────────────────────────
// pdfmake does not implement the Unicode Bidirectional Algorithm.
// For pure-script strings we just replace spaces with NBSP (pdfmake drops
// regular spaces between Hebrew words). For mixed Hebrew+Latin strings we:
//   1. Tokenise by word
//   2. Classify each token as Hebrew (RTL, level 1) or Latin (LTR, level 2)
//      using letter-majority — punctuation does not vote
//   3. Group consecutive same-level tokens into runs
//   4. Reverse run order for the RTL paragraph
//   5. Return an array of pdfmake text nodes — one node per run
//      (separate nodes prevent fontkit from treating Latin glyphs as RTL)
//
// The returned array is always safe to pass as `text:` in any pdfmake node.

const NBSP = '\u00a0';

// Classify a word token: 2 = LTR (Latin-dominant), 1 = RTL (Hebrew-dominant)
function _tokenLevel(tok) {
  let rtl = 0, ltr = 0;
  for (const c of tok) {
    if (/[\u0590-\u05FF]/.test(c)) rtl++;
    else if (/[A-Za-z]/.test(c)) ltr++;
  }
  return (ltr > 0 && rtl === 0) ? 2 : 1;
}

/**
 * Convert a user-facing string to pdfmake text nodes with correct BiDi order.
 * For pure-script strings returns a single-element array.
 * Pass opts to inherit style properties onto each node (e.g. bold, fontSize).
 *
 * @param   {string} str
 * @param   {object} [opts]  — pdfmake text node properties to merge in
 * @returns {Array}          — array of pdfmake text node objects
 */
export function bidiNodes(str, opts = {}) {
  if (!str) return [{ text: '', ...opts }];
  str = String(str);

  const hasHebrew = /[\u0590-\u05FF]/.test(str);
  const hasLatin  = /[A-Za-z]/.test(str);

  // Pure script — single node, just normalise spaces
  if (!hasLatin || !hasHebrew) {
    return [{ text: str.replace(/ /g, NBSP), ...opts }];
  }

  // Mixed — tokenise, classify, group into runs
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === ' ') { i++; continue; }
    let j = i;
    while (j < str.length && str[j] !== ' ') j++;
    tokens.push({ tok: str.slice(i, j), level: _tokenLevel(str.slice(i, j)) });
    i = j;
  }

  // Group consecutive same-level tokens into runs
  const runs = [];
  for (const t of tokens) {
    const prev = runs[runs.length - 1];
    if (prev && prev.level === t.level) prev.words.push(t.tok);
    else runs.push({ level: t.level, words: [t.tok] });
  }

  // RTL paragraph: reverse run order for visual display
  const visual = [...runs].reverse();

  // One text node per run; NBSP separator nodes between runs
  const nodes = [];
  visual.forEach((run, idx) => {
    nodes.push({ text: run.words.join(NBSP), ...opts });
    if (idx < visual.length - 1) nodes.push({ text: NBSP });
  });
  return nodes;
}

// ── Document definition ───────────────────────────────────────────────────────

export function buildDocDefinition(sessionState, config, session, now = new Date()) {

  const content = [
    buildHeader(session, config, now),
    buildAlertSection(sessionState, config),
    ...buildQuestionnaireSections(sessionState, config),
  ].filter(Boolean);

  return {
    pageSize:    'A4',
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: {
      font:      FONT_NAME,
      fontSize:  10,
      alignment: 'right',
    },
    styles:  buildStyles(),
    content,
    footer:  buildFooter(config),
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

function buildStyles() {
  return {
    sectionTitle: {
      fontSize:    13,
      bold:        true,
      alignment:   'right',
      margin:      [0, 0, 0, 8],
    },
    tableHeader: {
      fontSize:  9,
      bold:      true,
      alignment: 'right',
      color:     '#555555',
    },
    headerLabel: {
      fontSize:  9,
      color:     '#888888',
      alignment: 'right',
    },
    headerValue: {
      fontSize:  10,
      bold:      false,
      alignment: 'right',
    },
    alertTitle: {
      fontSize:  11,
      bold:      true,
      color:     ALERT_BORDER,
      alignment: 'right',
      marginBottom: 4,
    },
    alertItem: {
      fontSize:  10,
      alignment: 'right',
      marginBottom: 2,
    },
    scoresLine: {
      fontSize:  10,
      alignment: 'right',
      marginBottom: 8,
      color:     '#444444',
    },
  };
}

// ── Header ────────────────────────────────────────────────────────────────────

export function buildHeader(session, config, now) {
  const dateStr = now.toLocaleDateString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const timeStr = now.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit',
  });

  // Each value cell uses bidiNodes() so mixed Hebrew/Latin names render correctly.
  // Date/time is always Hebrew locale digits — pure RTL, no mixing needed.
  const rows = [
    { label: 'שם:',    value: bidiNodes(session?.name  || '—') },
    { label: 'מזהה:',  value: bidiNodes(session?.pid   || '—') },
    { label: 'תאריך:', value: [{ text: `${dateStr}${NBSP}${timeStr}` }] },
  ];

  return {
    table: {
      // RTL: index 0 renders on the RIGHT.
      // value ('*') first → right side, label ('auto') second → left side.
      widths: ['*', 'auto'],
      body: rows.map(({ label, value }) => [
        { text: value, style: 'headerValue', border: [false, false, false, false], alignment: 'right' },
        { text: label, style: 'headerLabel', border: [false, false, false, false], alignment: 'right' },
      ]),
    },
    layout:      'noBorders',
    marginBottom: 16,
  };
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function buildAlertSection(sessionState, config) {
  const triggered = [];
  for (const [key, alertList] of Object.entries(sessionState.alerts ?? {})) {
    if (!Array.isArray(alertList) || alertList.length === 0) continue;
    const q = config.questionnaires.find(q => q.id === key);
    for (const alert of alertList) {
      triggered.push({ qTitle: q?.title ?? key, message: alert.message });
    }
  }

  if (triggered.length === 0) return null;

  return {
    table: {
      widths: ['*'],
      body: [
        [{ text: '⚠\u00a0התראות\u00a0קליניות', style: 'alertTitle', border: [true, true, true, false] }],
        ...triggered.map(a => [{
          // qTitle and message may contain mixed Hebrew/Latin — use bidiNodes
          text: [
            ...bidiNodes(a.qTitle),
            { text: '\u200f:\u00a0' },   // RLM + colon + NBSP separator
            ...bidiNodes(a.message),
          ],
          style:  'alertItem',
          border: [true, false, true, false],
        }]),
        [{ text: '', border: [true, false, true, true], marginBottom: 0 }],
      ],
    },
    layout: {
      hLineColor: () => ALERT_BORDER,
      vLineColor: () => ALERT_BORDER,
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1.5 : 0,
      vLineWidth: () => 3,
      fillColor:  () => ALERT_BG,
      paddingLeft:   () => 10,
      paddingRight:  () => 10,
      paddingTop:    () => 8,
      paddingBottom: () => 8,
    },
    marginBottom: 16,
  };
}

// ── Questionnaire sections ────────────────────────────────────────────────────

export function buildQuestionnaireSections(sessionState, config) {
  return Object.entries(sessionState.answers ?? {}).map(([key, answers]) => {
    const q = config.questionnaires.find(q => q.id === key);
    if (!q) return null;

    const scoreResult = sessionState.scores?.[key] ?? null;

    return {
      stack: [
        { text: bidiNodes(q.title), style: 'sectionTitle' },
        buildScoresLine(scoreResult, q),
        buildResponseTable(q, answers),
      ].filter(Boolean),
      marginBottom: 20,
    };
  }).filter(Boolean);
}

// ── Scores line ───────────────────────────────────────────────────────────────

export function buildScoresLine(scoreResult, q) {
  if (!scoreResult || scoreResult.total == null) return null;

  const parts = [];

  parts.push({ text: 'ציון\u00a0כולל\u200f:\u00a0' + String(scoreResult.total) });

  const subscaleEntries = Object.entries(scoreResult.subscales ?? {});
  for (const [subId, subVal] of subscaleEntries) {
    const subDef   = q.scoring?.subscales?.[subId];
    const subLabel = subDef?.title ?? subId;
    parts.push({ text: '\u00a0\u00a0' });
    parts.push(...bidiNodes(subLabel));
    parts.push({ text: '\u200f:\u00a0' + String(subVal ?? '—') });
  }

  return { text: parts, style: 'scoresLine', margin: [0, 0, 0, 8] };
}

// ── Response table ────────────────────────────────────────────────────────────

export function buildResponseTable(questionnaire, answers) {
  const answerableItems = questionnaire.items.filter(item =>
    item.type !== 'instructions'
  );

  if (answerableItems.length === 0) return null;

  const headerRow = buildTableHeaderRow();
  const bodyRows  = answerableItems.map((item, idx) =>
    buildItemRow(item, idx + 1, answers[item.id], questionnaire)
  );

  return {
    table: {
      headerRows: 1,
      widths:     COL_WIDTHS,
      body:       [headerRow, ...bodyRows],
    },
    layout: {
      hLineColor: () => '#DDDDDD',
      vLineColor: () => '#DDDDDD',
      hLineWidth: (i) => (i === 0 || i === 1) ? 1 : 0.5,
      vLineWidth: () => 0.5,
      paddingLeft:   () => 4,
      paddingRight:  () => 4,
      paddingTop:    () => 4,
      paddingBottom: () => 4,
    },
    marginBottom: 8,
  };
}

export function buildTableHeaderRow() {
  const cell = (text) => ({ text, style: 'tableHeader', fillColor: '#F5F5F5' });
  return [cell('ערך'), cell('תשובה'), cell('תוכן\u00a0הפריט'), cell('#')];
}

export function buildItemRow(item, rowNum, rawAnswer, questionnaire) {
  const options  = resolveOptions(item, questionnaire);
  const answered = rawAnswer != null;

  const option       = options.find(o => o.value === rawAnswer) ?? null;
  const label        = option?.label ?? (answered ? String(rawAnswer) : '—');
  const numericValue = answered ? rawAnswer : null;

  const riskLevel = answered ? calcRiskLevel(item, rawAnswer, options) : null;

  const rowFill = riskLevel === 'high' ? RISK_HIGH_BG
                : riskLevel === 'med'  ? RISK_MED_BG
                : null;

  const textColor = riskLevel === 'high' ? RISK_HIGH_FG
                  : riskLevel === 'med'  ? RISK_MED_FG
                  : '#222222';

  function cell(textOrNodes, align = 'right', bold = false) {
    return {
      text:      textOrNodes,
      alignment: align,
      color:     textColor,
      bold,
      fillColor: rowFill ?? undefined,
    };
  }

  // TODO: type 'text' — render answer as full-width text cell, no score column

  // RTL visual order: ערך (score) | תשובה (label) | תוכן (text) | # (num)
  return [
    cell(numericValue != null ? String(numericValue) : '—', 'center'),
    cell(bidiNodes(label)),
    cell(bidiNodes(item.text)),
    cell(String(rowNum), 'center'),
  ];
}

// ── Risk calculation ──────────────────────────────────────────────────────────

export function calcRiskLevel(item, value, options) {
  if (!options || options.length === 0) return null;

  const values = options.map(o => o.value).sort((a, b) => a - b);
  const max    = values[values.length - 1];
  const second = values[values.length - 2];

  if (value === max) return 'high';
  if (item.type === 'likert' && value === second) return 'med';
  return null;
}

// ── Option resolution ─────────────────────────────────────────────────────────

export function resolveOptions(item, questionnaire) {
  if (item.options) return item.options;
  const setId = item.optionSetId ?? questionnaire.defaultOptionSetId;
  return questionnaire.optionSets?.[setId] ?? [];
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function buildFooter(config) {
  const appVer  = config.appVersion  ?? '—';
  const cfgVer  = config.version     ?? '—';

  return (currentPage, pageCount) => ({
    columns: [
      {
        text: [
          { text: 'עמוד\u00a0' + currentPage + '\u200f\u00a0מתוך\u00a0' + pageCount },
          { text: '\u00a0\u00a0|\u00a0\u00a0' },
          { text: 'גרסת\u00a0אפליקציה\u200f:\u00a0' + appVer },
          { text: '\u00a0\u00a0' },
          { text: 'גרסת\u00a0תצורה\u200f:\u00a0' + cfgVer },
          { text: '\u00a0\u00a0|\u00a0\u00a0' },
          { text: 'הערכה\u00a0קלינית' },
          { text: '\u00a0\u00a0' + APP_URL },
        ],
        alignment: 'right',
        fontSize:  8,
        color:     '#888888',
        margin:    [PAGE_MARGIN, 8, PAGE_MARGIN, 0],
      },
    ],
  });
}
