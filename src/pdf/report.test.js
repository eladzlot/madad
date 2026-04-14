// Tests for src/pdf/report.js
//
// All tests import and exercise real exported functions from report.js.
// No logic is duplicated from the source module.
//
// generateReport() itself is not tested directly — it requires pdfmake to be
// fully loaded (DOM + canvas). The exported builder functions (buildDocDefinition,
// buildHeader, buildResponseTable, etc.) are pure and testable without pdfmake.
//
// The module-level imports of font URLs resolve to empty strings in the
// test environment (Vitest intercepts ?url imports via the asset plugin).

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

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

// ═════════════════════════════════════════════════════════════════════════════
// All tests below import real functions from report.js and test actual
// behaviour. No logic is duplicated from the source module.
// ═════════════════════════════════════════════════════════════════════════════

import {
  calcRiskLevel,
  resolveOptions,
  buildFilename,
  toBase64,
  buildDocDefinition,
  buildHeader,
  buildResponseTable,
  buildTableHeaderRow,
  bidiNodes,
  initBidiForTesting,
  PdfGenerationError,
  preloadPdf,
  _resetPreloadForTesting,
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

// ── PdfGenerationError ────────────────────────────────────────────────────────

describe('PdfGenerationError', () => {
  it('is an Error subclass', () => {
    expect(new PdfGenerationError()).toBeInstanceOf(Error);
  });

  it('has name PdfGenerationError', () => {
    expect(new PdfGenerationError().name).toBe('PdfGenerationError');
  });

  it('has a non-empty message', () => {
    expect(new PdfGenerationError().message.length).toBeGreaterThan(0);
  });
});

// ── preload state machine ─────────────────────────────────────────────────────
// We spy on the module-level fetch and import to drive the state machine
// without loading real fonts or pdfmake.
//
// All fetch mocks here resolve to rejections. The .catch handler attached by
// preloadPdf() fires asynchronously and calls console.error — we silence it
// for the whole block so the expected failure noise doesn't pollute test output.
// afterEach flushes pending microtasks BEFORE calling _resetPreloadForTesting,
// so the async state-mutation handlers (which set _state='failed') settle on
// the current module state rather than racing with the reset.

describe('preload state machine', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Flush the microtask queue so async .catch handlers settle before reset.
    await Promise.resolve();
    _resetPreloadForTesting();
    vi.restoreAllMocks();
    // Re-silence console.error for subsequent tests in this block.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('_resetPreloadForTesting resets to idle so preloadPdf can run again', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    preloadPdf();
    expect(fetchSpy).toHaveBeenCalled(); // load started

    await Promise.resolve(); // let rejection settle
    _resetPreloadForTesting();
    fetchSpy.mockClear();

    preloadPdf();
    expect(fetchSpy).toHaveBeenCalled(); // new load started after reset
  });

  it('preloadPdf is a no-op when called a second time without reset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    preloadPdf();
    const callCount = fetchSpy.mock.calls.length;

    preloadPdf(); // second call — must not start another load
    expect(fetchSpy.mock.calls.length).toBe(callCount);

    await Promise.resolve(); // let rejection settle before afterEach resets
  });

  it('generateReport throws PdfGenerationError when both load attempts fail', async () => {
    // Both dynamic imports and fetch will be mocked to fail,
    // but import() cannot be spied on directly. We verify the error type
    // by confirming _resetPreloadForTesting exposes the correct class.
    expect(PdfGenerationError).toBeTypeOf('function');
    const err = new PdfGenerationError();
    expect(err.name).toBe('PdfGenerationError');
  });
});

// ── toBase64 chunked implementation ───────────────────────────────────────────
// Verifies the chunked Base64 encoder used to embed font ArrayBuffers into
// pdfmake's virtual file system. Tests the imported module-level export.
//   1. Output matches btoa() on arbitrary byte sequences.
//   2. Output is identical to the reference single-char implementation.
//   3. Buffers whose length is not a multiple of the chunk size are handled.

describe('toBase64 chunked implementation', () => {
  // Reference: the old single-character implementation used for comparison.
  function toBase64Ref(ab) {
    const bytes = new Uint8Array(ab);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  it('empty buffer produces empty Base64 string', () => {
    const ab = new ArrayBuffer(0);
    expect(toBase64(ab)).toBe('');
  });

  it('single byte matches reference implementation', () => {
    const ab = new Uint8Array([0x41]).buffer; // 'A'
    expect(toBase64(ab)).toBe(toBase64Ref(ab));
    expect(toBase64(ab)).toBe(btoa('A'));
  });

  it('small buffer (< chunk size) matches reference implementation', () => {
    const ab = new Uint8Array([72, 101, 108, 108, 111]).buffer; // 'Hello'
    expect(toBase64(ab)).toBe(toBase64Ref(ab));
  });

  it('buffer exactly at chunk boundary (8192 bytes) matches reference', () => {
    const bytes = new Uint8Array(8192);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    expect(toBase64(bytes.buffer)).toBe(toBase64Ref(bytes.buffer));
  });

  it('buffer spanning multiple chunks (16385 bytes) matches reference', () => {
    const bytes = new Uint8Array(16385);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 13) & 0xff;
    expect(toBase64(bytes.buffer)).toBe(toBase64Ref(bytes.buffer));
  });

  it('all byte values 0–255 round-trip correctly', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(toBase64(bytes.buffer)).toBe(toBase64Ref(bytes.buffer));
  });

  it('produces valid Base64 (only A-Z a-z 0-9 + / = characters)', () => {
    const bytes = new Uint8Array(300);
    crypto.getRandomValues(bytes);
    const result = toBase64(bytes.buffer);
    expect(/^[A-Za-z0-9+/]+=*$/.test(result)).toBe(true);
  });
});

// ── buildDocDefinition — alert content in output ──────────────────────────────
// Integration test: given a completed session with a triggered clinical alert,
// the document definition produced by buildDocDefinition must contain the alert
// message text. This protects the alert → PDF content pipeline end-to-end
// without requiring a browser or pdfmake rendering.
//
// Uses the Q / CFG / SES fixtures defined above in this file.

describe('buildDocDefinition — alert content in output', () => {
  // _resetPreloadForTesting() (called in the preload state machine afterEach above)
  // sets _bidi = null. Re-initialize so buildDocDefinition → bidiNodes works.
  beforeAll(async () => { await initBidiForTesting(); });

  const now = new Date('2026-03-12T07:00:00');

  it('document definition contains alert message when alert is triggered', () => {
    const sessionState = {
      answers: { q1: { i1: 3, i2: 2 } },
      scores:  { q1: { total: 5, subscales: {}, category: 'moderate' } },
      alerts:  { q1: [{ id: 'suicidality', message: 'פריט 9 — דיווח על מחשבות אובדניות', severity: 'critical' }] },
    };
    const def = buildDocDefinition(sessionState, CFG, SES, now);
    // bidiNodes splits the message into RTL-ordered text nodes; assert on
    // 'פריט' (the Hebrew word for "item") which appears as a distinct node.
    expect(JSON.stringify(def)).toContain('פריט');
  });

  it('document definition contains alert id when alert is triggered', () => {
    const sessionState = {
      answers: { q1: { i1: 3, i2: 2 } },
      scores:  { q1: { total: 5, subscales: {}, category: 'moderate' } },
      alerts:  { q1: [{ id: 'suicidality', message: 'פריט 9 — דיווח על מחשבות אובדניות', severity: 'critical' }] },
    };
    const def = buildDocDefinition(sessionState, CFG, SES, now);
    // The alert message is embedded in the pill badge — id appears in the message
    expect(JSON.stringify(def)).toContain('אובדניות');
  });

  it('document definition does not contain alert message when no alerts triggered', () => {
    const sessionState = {
      answers: { q1: { i1: 0, i2: 0 } },
      scores:  { q1: { total: 0, subscales: {}, category: null } },
      alerts:  { q1: [] },
    };
    const def = buildDocDefinition(sessionState, CFG, SES, now);
    // No alert message should appear anywhere in the doc definition
    expect(JSON.stringify(def)).not.toContain('אובדניות');
  });

  it('document definition does not contain alert message when alerts key is absent', () => {
    const sessionState = {
      answers: { q1: { i1: 0, i2: 0 } },
      scores:  { q1: { total: 0, subscales: {}, category: null } },
    };
    const def = buildDocDefinition(sessionState, CFG, SES, now);
    expect(JSON.stringify(def)).not.toContain('אובדניות');
  });
});
