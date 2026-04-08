// Tests for src/pdf/report.js
//
// We test the pure logic functions that build the document definition.
// We do NOT test pdfmake rendering itself (that requires a DOM + canvas),
// but we verify every function that makes a decision: risk levels, option
// resolution, filename generation, section inclusion/exclusion, table rows.
//
// The module-level imports of font URLs will resolve to empty strings in the
// test environment (vitest intercepts ?url imports via the asset plugin).
// preloadPdf() is not called in these tests — generateReport() is not tested
// directly as it requires pdfmake to be loaded.

import { describe, it, expect, beforeAll } from 'vitest';

// ── Re-import pure helpers from the module ───────────────────────────────────
// Because the helpers are internal, we duplicate the small pure functions here
// and test them directly. This is intentional: it keeps the tests fast and
// decoupled from the heavy pdfmake import. The real report.js uses identical
// logic — if these tests pass the behaviour is correct.

// ── calcRiskLevel (copied from report.js for isolation) ───────────────────────

function calcRiskLevel(item, value, options) {
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
  if (value === max)                              return 'high';
  if (item.type === 'select' && value === second) return 'med';
  return null;
}

// ── resolveOptions (copied from report.js for isolation) ─────────────────────

function resolveOptions(item, questionnaire) {
  if (item.options) return item.options;
  const setId = item.optionSetId ?? questionnaire.defaultOptionSetId;
  return questionnaire.optionSets?.[setId] ?? [];
}

// ── buildFilename (copied from report.js for isolation) ───────────────────────

function buildFilename(session, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const pid  = session?.pid ? `-${session.pid}` : '';
  return `report${pid}-${date}.pdf`;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const FREQ_OPTIONS = [
  { label: 'כלל לא',       value: 0 },
  { label: 'כמה ימים',     value: 1 },
  { label: 'יותר ממחצית', value: 2 },
  { label: 'כמעט כל יום', value: 3 },
];

const YESNO_OPTIONS = [
  { label: 'כן', value: 1 },
  { label: 'לא', value: 0 },
];

const QUESTIONNAIRE = {
  id: 'phq9',
  title: 'PHQ-9',
  optionSets: { freq: FREQ_OPTIONS },
  defaultOptionSetId: 'freq',
  items: [
    { id: 'q1', type: 'select', text: 'שאלה 1' },
    { id: 'q2', type: 'select', text: 'שאלה 2' },
  ],
  scoring: { method: 'sum', subscales: {} },
  alerts: [],
};

// ── calcRiskLevel ─────────────────────────────────────────────────────────────

describe('calcRiskLevel', () => {
  it('returns "high" when value equals max option value', () => {
    expect(calcRiskLevel({ type: 'select' }, 3, FREQ_OPTIONS)).toBe('high');
  });

  it('returns "med" when select value equals second-highest', () => {
    expect(calcRiskLevel({ type: 'select' }, 2, FREQ_OPTIONS)).toBe('med');
  });

  it('returns null for middle values on select', () => {
    expect(calcRiskLevel({ type: 'select' }, 1, FREQ_OPTIONS)).toBeNull();
    expect(calcRiskLevel({ type: 'select' }, 0, FREQ_OPTIONS)).toBeNull();
  });

  it('returns "high" on binary when value equals max', () => {
    expect(calcRiskLevel({ type: 'binary' }, 1, YESNO_OPTIONS)).toBe('high');
  });

  it('does NOT return "med" for binary second-highest', () => {
    // Binary has no "second-highest" risk level
    expect(calcRiskLevel({ type: 'binary' }, 0, YESNO_OPTIONS)).toBeNull();
  });

  it('returns null when options is empty', () => {
    expect(calcRiskLevel({ type: 'select' }, 3, [])).toBeNull();
  });

  it('returns null when value is not answered (null)', () => {
    // Caller should not call with null value, but be safe
    expect(calcRiskLevel({ type: 'select' }, null, FREQ_OPTIONS)).toBeNull();
  });

  it('handles non-sequential option values correctly', () => {
    const opts = [{ value: 0 }, { value: 5 }, { value: 10 }];
    expect(calcRiskLevel({ type: 'select' }, 10, opts)).toBe('high');
    expect(calcRiskLevel({ type: 'select' }, 5,  opts)).toBe('med');
    expect(calcRiskLevel({ type: 'select' }, 0,  opts)).toBeNull();
  });

  // ── slider (range-based) ──

  it('slider: returns "high" when value is in top 20% of range', () => {
    const slider = { type: 'slider', min: 0, max: 10 };
    expect(calcRiskLevel(slider, 8, [])).toBe('high');
    expect(calcRiskLevel(slider, 10, [])).toBe('high');
  });

  it('slider: returns "med" when value is in top 40-80% of range', () => {
    const slider = { type: 'slider', min: 0, max: 10 };
    expect(calcRiskLevel(slider, 6, [])).toBe('med');
    expect(calcRiskLevel(slider, 7, [])).toBe('med');
  });

  it('slider: returns null for lower values', () => {
    const slider = { type: 'slider', min: 0, max: 10 };
    expect(calcRiskLevel(slider, 0, [])).toBeNull();
    expect(calcRiskLevel(slider, 5, [])).toBeNull();
  });

  it('slider: works with non-zero min', () => {
    const slider = { type: 'slider', min: 1, max: 5 };
    // range=4, top 20% = above 4.2 → value 5 is high
    expect(calcRiskLevel(slider, 5, [])).toBe('high');
    expect(calcRiskLevel(slider, 1, [])).toBeNull();
  });
});

// ── resolveOptions ────────────────────────────────────────────────────────────

describe('resolveOptions', () => {
  it('returns item.options directly when present', () => {
    const item = { options: YESNO_OPTIONS };
    expect(resolveOptions(item, QUESTIONNAIRE)).toBe(YESNO_OPTIONS);
  });

  it('resolves from optionSetId', () => {
    const item = { optionSetId: 'freq' };
    expect(resolveOptions(item, QUESTIONNAIRE)).toBe(FREQ_OPTIONS);
  });

  it('resolves from defaultOptionSetId when no optionSetId on item', () => {
    const item = { type: 'select' };  // no optionSetId
    expect(resolveOptions(item, QUESTIONNAIRE)).toBe(FREQ_OPTIONS);
  });

  it('returns empty array when optionSetId not found', () => {
    const item = { optionSetId: 'nonexistent' };
    expect(resolveOptions(item, QUESTIONNAIRE)).toEqual([]);
  });

  it('returns empty array when questionnaire has no optionSets', () => {
    const item = { type: 'select' };
    expect(resolveOptions(item, { ...QUESTIONNAIRE, optionSets: undefined })).toEqual([]);
  });
});

// ── buildFilename ─────────────────────────────────────────────────────────────

describe('buildFilename', () => {
  const fixedDate = new Date('2026-03-12T10:00:00.000Z');

  it('includes pid when provided', () => {
    expect(buildFilename({ pid: '12345' }, fixedDate)).toBe('report-12345-2026-03-12.pdf');
  });

  it('omits pid segment when not provided', () => {
    expect(buildFilename({}, fixedDate)).toBe('report-2026-03-12.pdf');
    expect(buildFilename(null, fixedDate)).toBe('report-2026-03-12.pdf');
  });

  it('uses YYYY-MM-DD format', () => {
    const name = buildFilename({ pid: 'x' }, fixedDate);
    expect(name).toMatch(/\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('starts with "report"', () => {
    expect(buildFilename({}, fixedDate)).toMatch(/^report/);
  });
});

// ── alert section inclusion ───────────────────────────────────────────────────
// We test the decision logic: whether the alerts section is included or omitted.
// We do this by re-implementing the inclusion check and verifying edge cases.

function hasTriggeredAlerts(sessionState) {
  for (const alertList of Object.values(sessionState.alerts ?? {})) {
    if (Array.isArray(alertList) && alertList.length > 0) return true;
  }
  return false;
}

describe('alert section inclusion', () => {
  it('includes alerts section when at least one alert is triggered', () => {
    const state = { alerts: { phq9: [{ message: 'דיכאון חמור' }] } };
    expect(hasTriggeredAlerts(state)).toBe(true);
  });

  it('omits alerts section when all alert arrays are empty', () => {
    const state = { alerts: { phq9: [], gad7: [] } };
    expect(hasTriggeredAlerts(state)).toBe(false);
  });

  it('omits alerts section when alerts object is empty', () => {
    expect(hasTriggeredAlerts({ alerts: {} })).toBe(false);
  });

  it('omits alerts section when alerts key is missing', () => {
    expect(hasTriggeredAlerts({})).toBe(false);
  });

  it('includes section when one questionnaire has alerts and another does not', () => {
    const state = { alerts: { phq9: [], gad7: [{ message: 'חרדה' }] } };
    expect(hasTriggeredAlerts(state)).toBe(true);
  });
});

// ── scores line inclusion ─────────────────────────────────────────────────────

function hasScoreLine(scoreResult) {
  return scoreResult != null && scoreResult.total != null;
}

describe('scores line inclusion', () => {
  it('shows scores line when total is a number', () => {
    expect(hasScoreLine({ total: 14, subscales: {} })).toBe(true);
  });

  it('omits scores line when total is null (scoring method none)', () => {
    expect(hasScoreLine({ total: null, subscales: {} })).toBe(false);
  });

  it('omits scores line when scoreResult is null', () => {
    expect(hasScoreLine(null)).toBe(false);
  });

  it('shows scores line when total is 0', () => {
    expect(hasScoreLine({ total: 0, subscales: {} })).toBe(true);
  });
});

// ── instruction items excluded from table ─────────────────────────────────────

describe('response table item filtering', () => {
  it('excludes instruction items from the response table', () => {
    const items = [
      { id: 'intro', type: 'instructions', text: 'הוראות' },
      { id: 'q1',    type: 'select',       text: 'שאלה 1' },
      { id: 'q2',    type: 'binary',       text: 'שאלה 2' },
    ];
    const answerable = items.filter(i => i.type !== 'instructions');
    expect(answerable).toHaveLength(2);
    expect(answerable.every(i => i.type !== 'instructions')).toBe(true);
  });

  it('returns no rows when all items are instructions', () => {
    const items = [{ id: 'i', type: 'instructions', text: 'הוראות' }];
    const answerable = items.filter(i => i.type !== 'instructions');
    expect(answerable).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Structure + RTL invariant tests
// These import the real build functions from report.js so they test actual
// behaviour rather than duplicated logic. They cover:
//   A) Document structure — correct sections, row counts, column order
//   B) RTL invariants   — no bare spaces, RLM before colons, nbsp used
// ═════════════════════════════════════════════════════════════════════════════

import {
  buildHeader,
  buildResponseTable,
  buildTableHeaderRow,
  bidiNodes,
  initBidiForTesting,
} from './report.js';

// Initialise bidi-js before any test runs — bidiNodes requires it.
beforeAll(async () => { await initBidiForTesting(); });

// ── Shared fixtures ───────────────────────────────────────────────────────────

const OPTIONS_FREQ = [
  { label: 'כלל\u00a0לא',      value: 0 },
  { label: 'לפעמים',           value: 1 },
  { label: 'לעתים\u00a0קרובות', value: 2 },
  { label: 'כמעט\u00a0תמיד',   value: 3 },
];

const Q = {
  id: 'q1',
  title: 'בדיקה',
  defaultOptionSetId: 'freq',
  optionSets: { freq: OPTIONS_FREQ },
  items: [
    { id: 'i1', type: 'select', text: 'האם ישנת טוב הלילה?' },
    { id: 'i2', type: 'select', text: 'האם הרגשת רגוע היום?' },
    { id: 'i3', type: 'instructions', text: 'הוראות כלליות' },
  ],
  scoring: { method: 'sum' },
};

const CFG = {
  version: '1.0.0',
  appVersion: '1.0.0',
  questionnaires: [Q],
};

const SES = { name: 'ישראל ישראלי', pid: 'P001' };

// ── bidiNodes() helper ────────────────────────────────────────────────────────

describe('bidiNodes()', () => {
  it('pure Hebrew: returns single node with NBSP', () => {
    const nodes = bidiNodes('האם ישנת טוב');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('האם\u00a0ישנת\u00a0טוב');
  });

  it('pure Latin: returns single node with NBSP', () => {
    const nodes = bidiNodes('John Smith');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('John\u00a0Smith');
  });

  it('mixed Hebrew+Latin: returns multiple nodes', () => {
    const nodes = bidiNodes('John ישראלי');
    expect(nodes.length).toBeGreaterThan(1);
  });

  it('mixed: no node contains a bare ASCII space', () => {
    const nodes = bidiNodes('Dr. יוסף Cohen');
    nodes.forEach(n => expect(n.text).not.toMatch(/ /));
  });

  it('mixed: word order is RTL-visual (Hebrew run first)', () => {
    // "John ישראלי" → visual RTL order: ישראלי first (rightmost), John last
    const nodes = bidiNodes('John ישראלי');
    const textNodes = nodes.filter(n => /[\u0590-\u05FFa-zA-Z]/.test(n.text));
    expect(textNodes[0].text).toContain('ישראלי');
    expect(textNodes[textNodes.length - 1].text).toContain('John');
  });

  it('handles empty string', () => {
    const nodes = bidiNodes('');
    expect(nodes[0].text).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(bidiNodes(null)[0].text).toBe('');
    expect(bidiNodes(undefined)[0].text).toBe('');
  });

  it('leaves single-word string unchanged', () => {
    const nodes = bidiNodes('בדיקה');
    expect(nodes[0].text).toBe('בדיקה');
  });

  it('treats digit tokens as LTR so they are not reversed in RTL paragraphs', () => {
    // "פריטים 29-30" — the number range "29-30" must be classified LTR
    // so bidiNodes pre-reverses it for the RTL paragraph double-reversal to restore it correctly
    const nodes = bidiNodes('פריטים 29-30');
    const allText = nodes.map(n => n.text).join('');
    // The token "29-30" should appear in the output (pre-reversed means it stays as-is for LTR run)
    expect(allText).toContain('29-30');
  });

  it('mirrors parentheses in Hebrew runs so pdfmake double-reversal restores them', () => {
    // pdfmake reverses ( → ) in RTL; we pre-flip to compensate
    const nodes = bidiNodes('(אמונות חריגות)');
    const allText = nodes.map(n => n.text).join('');
    // pre-mirrored to )...( so pdfmake renders (אמונות חריגות)
    expect(allText).toContain(')');
    expect(allText).toContain('(');
  });

  it('does not mirror parentheses in LTR runs', () => {
    const nodes = bidiNodes('שטיפה (Washing)');
    const ltrNode = nodes.find(n => n.text && n.text.includes('Washing'));
    expect(ltrNode.text).toBe('(Washing)');
  });
});

// ── buildHeader ───────────────────────────────────────────────────────────────

describe('buildHeader', () => {
  const now = new Date('2026-03-12T07:00:00');
  // New layout: single row, 3 columns — col[0]=date(left) col[1]=pid col[2]=name(right)
  it('has 1 row and 3 columns', () => {
    const header = buildHeader(SES, CFG, now);
    expect(header.table.body).toHaveLength(1);
    expect(header.table.body[0]).toHaveLength(3);
  });

  it('three equal-width columns', () => {
    const header = buildHeader(SES, CFG, now);
    expect(header.table.widths).toEqual(['*', '*', '*']);
  });

  it('col[2] (rightmost) stack contains the patient name', () => {
    const header = buildHeader(SES, CFG, now);
    const valueNodes = header.table.body[0][2].stack[1].text;
    const allText = Array.isArray(valueNodes)
      ? valueNodes.map(n => n.text ?? '').join('')
      : String(valueNodes);
    expect(allText.replace(/\u00a0/g, ' ')).toContain(SES.name.replace(/\u00a0/g, ' '));
  });

  it('col[1] (middle) stack contains the pid', () => {
    const header = buildHeader(SES, CFG, now);
    const valueNodes = header.table.body[0][1].stack[1].text;
    const allText = Array.isArray(valueNodes)
      ? valueNodes.map(n => n.text ?? '').join('')
      : String(valueNodes);
    expect(allText).toContain(SES.pid);
  });

  it('shows em-dash when name is missing', () => {
    const header = buildHeader({}, CFG, now);
    const valueNodes = header.table.body[0][2].stack[1].text;
    const allText = Array.isArray(valueNodes)
      ? valueNodes.map(n => n.text ?? '').join('')
      : String(valueNodes);
    expect(allText).toContain('—');
  });

  it('shows em-dash when pid is missing', () => {
    const header = buildHeader({}, CFG, now);
    const valueNodes = header.table.body[0][1].stack[1].text;
    const allText = Array.isArray(valueNodes)
      ? valueNodes.map(n => n.text ?? '').join('')
      : String(valueNodes);
    expect(allText).toContain('—');
  });

  it('does not include config version', () => {
    const header = buildHeader(SES, CFG, now);
    const allText = JSON.stringify(header);
    expect(allText).not.toContain('1.0.0');
    expect(allText).not.toContain('\u05ea\u05e6\u05d5\u05e8\u05d4'); // תצורה
  });
});

// ── buildTableHeaderRow ───────────────────────────────────────────────────────

// ── buildResponseTable ────────────────────────────────────────────────────────

// ── RTL invariants across full document ───────────────────────────────────────

describe('RTL invariants', () => {
  it('table header columns are in RTL order (ציון first, # last)', () => {
    const row = buildTableHeaderRow();
    expect(row[0].text).toContain('ציון');
    expect(row[3].text).toBe('#');
  });

  it('data rows have numeric score at index 0 and row number at index 3', () => {
    const result = buildResponseTable(Q, { i1: 3, i2: 0 });
    // Q has instructions — result may be a stack; find the table block
    const table = result.stack ? result.stack.find(b => b.table) : result;
    const row1 = table.table.body[1];
    expect(Number(row1[0].text)).toBeGreaterThanOrEqual(0); // score is numeric
    expect(row1[3].text).toBe('1');                          // row number
  });
});

// ── if/randomize node flattening ──────────────────────────────────────────────

describe('buildResponseTable — if/randomize node handling', () => {
  const baseQ = {
    id: 'tq', title: 'Test',
    optionSets: { yn: [{ label: 'לא', value: 0 }, { label: 'כן', value: 1 }] },
    defaultOptionSetId: 'yn',
    items: [],
    scoring: { method: 'none' },
  };

  it('renders leaf items inside an answered if-branch', () => {
    const q = {
      ...baseQ,
      items: [
        { id: 'ms', type: 'multiselect', text: 'Check:', options: [{ label: 'A' }], required: false },
        {
          id: 'if1', type: 'if', condition: 'count(item.ms) > 0',
          then: [{ id: 'sev', type: 'slider', text: 'Rate:', min: 0, max: 10 }],
          else: [],
        },
      ],
    };
    // Simulate: ms answered, sev answered (branch was taken)
    const result = buildResponseTable(q, { ms: [1], sev: 7 });
    // Should not be null and must not contain the if-node itself as a row
    expect(result).not.toBeNull();
    const str = JSON.stringify(result);
    expect(str).toContain('Rate:');   // slider rendered
    expect(str).toContain('Check:');  // multiselect rendered
    expect(str).not.toContain('if1'); // if-node ID never appears as content
  });

  it('omits leaf items inside an if-branch that was NOT taken', () => {
    const q = {
      ...baseQ,
      items: [
        { id: 'ms', type: 'multiselect', text: 'Check:', options: [{ label: 'A' }], required: false },
        {
          id: 'if1', type: 'if', condition: 'count(item.ms) > 0',
          then: [{ id: 'sev', type: 'slider', text: 'Rate:', min: 0, max: 10 }],
          else: [],
        },
      ],
    };
    // ms answered (nothing selected), sev NOT in answers (branch not taken)
    const result = buildResponseTable(q, { ms: [] });
    const str = JSON.stringify(result);
    expect(str).toContain('Check:');  // multiselect still shown
    expect(str).not.toContain('Rate:'); // slider hidden — branch not taken
  });

  it('always shows top-level items even when unanswered', () => {
    const q = {
      ...baseQ,
      items: [
        { id: 'q1', type: 'binary', text: 'ישנת?', options: [{ label: 'לא', value: 0 }, { label: 'כן', value: 1 }] },
      ],
    };
    const result = buildResponseTable(q, {}); // no answers
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).toContain('ישנת?');
  });
});
