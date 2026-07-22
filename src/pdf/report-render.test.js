// Tests for the score/label-rendering builders in report.js:
//   buildSectionHeader, buildSubscoresLine, buildSummaryBlock,
//   buildItemRow, buildTextBlock, buildMultiselectBlock
//
// These functions turn the session's numbers (total score, interpretation band,
// subscale values, per-item answers) into pdfmake doc-definition nodes — the
// numbers a clinician actually reads off the PDF. They were previously covered
// only transitively through buildDocDefinition's happy path; this file asserts
// their output directly, focusing on score/label correctness and the edges
// (missing scores, mean-vs-sum formatting, exclude/out-of-range, RTL prefix).
//
// All functions are pure builders — no pdfmake render, only bidi (initialised
// below). We inspect the returned node tree with a recursive text extractor.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildSectionHeader,
  buildSubscoresLine,
  buildSummaryBlock,
  buildItemRow,
  buildTextBlock,
  buildMultiselectBlock,
  initBidiForTesting,
} from './report.js';

beforeAll(async () => { await initBidiForTesting(); });

// ── helpers ─────────────────────────────────────────────────────────────────

// Recursively collect all rendered text from a pdfmake node tree.
function flatText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  if (node.text !== undefined) return flatText(node.text);
  if (node.stack) return node.stack.map(flatText).join('');
  if (node.columns) return node.columns.map(flatText).join('');
  if (node.table) return node.table.body.map(r => r.map(flatText).join('')).join('');
  return '';
}

// bidiNodes replaces spaces with NBSP; normalise for comparison against source.
const norm = (s) => flatText(s).replace(/ /g, ' ');

// ── fixtures ────────────────────────────────────────────────────────────────

const OPTIONS_FREQ = [
  { label: 'כלל לא',       value: 0 },
  { label: 'לפעמים',       value: 1 },
  { label: 'לעתים קרובות', value: 2 },
  { label: 'כמעט תמיד',    value: 3 },
];

// ── buildSectionHeader ────────────────────────────────────────────────────────

describe('buildSectionHeader', () => {
  const q = { id: 'phq9', title: 'שאלון דיכאון', abbr: 'PHQ-9', items: [] };

  it('renders the integer total score', () => {
    const state = { scores: { phq9: { total: 14, category: '' } } };
    const header = buildSectionHeader(q, state, 'phq9');
    expect(flatText(header)).toContain('14');
  });

  it('formats a mean/float total to one decimal', () => {
    const state = { scores: { phq9: { total: 2.5, category: '' } } };
    expect(flatText(buildSectionHeader(q, state, 'phq9'))).toContain('2.5');
  });

  it('renders the interpretation band (category) label', () => {
    const state = { scores: { phq9: { total: 14, category: 'דיכאון בינוני' } } };
    expect(norm(buildSectionHeader(q, state, 'phq9'))).toContain('דיכאון בינוני');
  });

  it('shows "הושלם" when there is no numeric total', () => {
    const state = { scores: { phq9: { category: 'x' } } };
    expect(flatText(buildSectionHeader(q, state, 'phq9'))).toContain('הושלם');
  });

  it('shows "הושלם" when the score has total: null', () => {
    const state = { scores: { phq9: { total: null } } };
    expect(flatText(buildSectionHeader(q, state, 'phq9'))).toContain('הושלם');
  });

  it('renders "הושלם" when the questionnaire has no score entry at all', () => {
    const header = buildSectionHeader(q, { scores: {} }, 'phq9');
    expect(flatText(header)).toContain('הושלם');
  });

  it('does not treat a total of 0 as missing', () => {
    const state = { scores: { phq9: { total: 0, category: '' } } };
    const badge = buildSectionHeader(q, state, 'phq9').table.body[0][2];
    expect(flatText(badge)).toBe('0');
    expect(flatText(badge)).not.toContain('הושלם');
  });

  it('includes the abbreviation in the measure name', () => {
    const state = { scores: { phq9: { total: 14, category: '' } } };
    const text = norm(buildSectionHeader(q, state, 'phq9'));
    expect(text).toContain('שאלון דיכאון');
    expect(text).toContain('PHQ-9');
  });

  it('defaults the sessionKey to q.id when omitted', () => {
    const state = { scores: { phq9: { total: 9, category: '' } } };
    expect(flatText(buildSectionHeader(q, state))).toContain('9');
  });

  it('renders one pill per alert', () => {
    const state = {
      scores: { phq9: { total: 20, category: 'חמור' } },
      alerts: { phq9: [
        { message: 'אובדנות', severity: 'critical' },
        { message: 'החמרה', severity: 'warning' },
      ] },
    };
    const badgeCell = buildSectionHeader(q, state, 'phq9').table.body[0][0];
    expect(badgeCell.stack).toHaveLength(2);
    const text = norm(badgeCell);
    expect(text).toContain('אובדנות');
    expect(text).toContain('החמרה');
  });

  it('renders no pills when there are no alerts', () => {
    const state = { scores: { phq9: { total: 3, category: '' } }, alerts: { phq9: [] } };
    const badgeCell = buildSectionHeader(q, state, 'phq9').table.body[0][0];
    // Empty state → single spacer node, not an alert stack
    expect(badgeCell.stack).toHaveLength(1);
    expect(norm(badgeCell).trim()).toBe('');
  });
});

// ── buildSubscoresLine ────────────────────────────────────────────────────────

describe('buildSubscoresLine', () => {
  const q = {
    id: 'oci_r',
    title: 'OCI-R',
    subscaleLabels: { washing: 'רחיצה', checking: 'בדיקה' },
    scoring: { subscaleMethod: 'sum' },
    items: [],
  };

  it('returns null when the score has no subscales', () => {
    expect(buildSubscoresLine(q, { scores: { oci_r: { total: 5 } } }, 'oci_r')).toBeNull();
  });

  it('returns null when subscales is an empty object', () => {
    expect(buildSubscoresLine(q, { scores: { oci_r: { subscales: {} } } }, 'oci_r')).toBeNull();
  });

  it('returns null when there is no score entry', () => {
    expect(buildSubscoresLine(q, { scores: {} }, 'oci_r')).toBeNull();
  });

  it('renders each subscale value with its label', () => {
    const state = { scores: { oci_r: { subscales: { washing: 6, checking: 4 } } } };
    const text = norm(buildSubscoresLine(q, state, 'oci_r'));
    expect(text).toContain('6');
    expect(text).toContain('רחיצה');
    expect(text).toContain('4');
    expect(text).toContain('בדיקה');
  });

  it('falls back to the subscale id when no label is defined', () => {
    const state = { scores: { oci_r: { subscales: { hoarding: 2 } } } };
    expect(flatText(buildSubscoresLine(q, state, 'oci_r'))).toContain('hoarding');
  });

  it('forces one decimal for mean-method subscales (2 → "2.0")', () => {
    const meanQ = { ...q, scoring: { subscaleMethod: 'mean' } };
    const state = { scores: { oci_r: { subscales: { washing: 2 } } } };
    expect(flatText(buildSubscoresLine(meanQ, state, 'oci_r'))).toContain('2.0');
  });

  it('shows sum-method integers without a forced decimal', () => {
    const state = { scores: { oci_r: { subscales: { washing: 2 } } } };
    const text = flatText(buildSubscoresLine(q, state, 'oci_r'));
    expect(text).toContain('2');
    expect(text).not.toContain('2.0');
  });

  it('defaults subscaleMethod to sum when scoring block is absent', () => {
    const bare = { id: 'x', title: 'X', subscaleLabels: { a: 'א' }, items: [] };
    const state = { scores: { x: { subscales: { a: 3 } } } };
    const text = flatText(buildSubscoresLine(bare, state, 'x'));
    expect(text).toContain('3');
    expect(text).not.toContain('3.0');
  });

  it('renders a separator between multiple subscales', () => {
    const state = { scores: { oci_r: { subscales: { washing: 6, checking: 4 } } } };
    expect(flatText(buildSubscoresLine(q, state, 'oci_r'))).toContain('·');
  });

  it('includes the "תתי-מדדים:" prefix', () => {
    const state = { scores: { oci_r: { subscales: { washing: 6 } } } };
    expect(norm(buildSubscoresLine(q, state, 'oci_r'))).toContain('תתי-מדדים:');
  });

  it('defaults the sessionKey to q.id when omitted', () => {
    const state = { scores: { oci_r: { subscales: { washing: 6 } } } };
    expect(flatText(buildSubscoresLine(q, state))).toContain('6');
  });
});

// ── buildSummaryBlock ─────────────────────────────────────────────────────────

describe('buildSummaryBlock', () => {
  const qA = { id: 'phq9', title: 'דיכאון', items: [] };
  const qB = { id: 'gad7', title: 'חרדה', items: [] };
  const config = { questionnaires: [qA, qB] };

  it('renders one row per completed questionnaire', () => {
    const state = {
      answers: { phq9: {}, gad7: {} },
      scores: { phq9: { total: 10 }, gad7: { total: 8 } },
    };
    expect(buildSummaryBlock(state, config).table.body).toHaveLength(2);
  });

  it('orders rows by config questionnaire order regardless of answer order', () => {
    const state = {
      answers: { gad7: {}, phq9: {} }, // reverse insertion order
      scores: { phq9: { total: 10 }, gad7: { total: 8 } },
    };
    const body = buildSummaryBlock(state, config).table.body;
    // row = [badge, severity, score, measure]; measure is col[3]
    expect(norm(body[0][3])).toContain('דיכאון'); // qA first
    expect(norm(body[1][3])).toContain('חרדה');   // qB second
  });

  it('drops sessions whose questionnaire is not in the config', () => {
    const state = { answers: { unknown: {} }, scores: { unknown: { total: 1 } } };
    expect(buildSummaryBlock(state, config).table.body).toHaveLength(0);
  });

  it('resolves the questionnaire via the questionnaireIds map (instanceId)', () => {
    const state = {
      answers: { inst1: {} },
      questionnaireIds: { inst1: 'phq9' },
      scores: { inst1: { total: 12 } },
    };
    const body = buildSummaryBlock(state, config).table.body;
    expect(body).toHaveLength(1);
    expect(norm(body[0][3])).toContain('דיכאון');
    expect(flatText(body[0][2])).toContain('12');
  });

  it('falls back to treating the sessionKey as the questionnaire id', () => {
    const state = { answers: { phq9: {} }, scores: { phq9: { total: 7 } } };
    const body = buildSummaryBlock(state, config).table.body;
    expect(body).toHaveLength(1);
    expect(flatText(body[0][2])).toContain('7');
  });

  it('shows "הושלם" for a questionnaire with no numeric total', () => {
    const state = { answers: { phq9: {} }, scores: { phq9: {} } };
    const body = buildSummaryBlock(state, config).table.body;
    expect(flatText(body[0][2])).toContain('הושלם');
  });

  it('renders the severity category in the severity column', () => {
    const state = { answers: { phq9: {} }, scores: { phq9: { total: 15, category: 'בינוני' } } };
    const body = buildSummaryBlock(state, config).table.body;
    expect(norm(body[0][1])).toContain('בינוני');
  });

  it('renders alert pills in the badge column', () => {
    const state = {
      answers: { phq9: {} },
      scores: { phq9: { total: 22 } },
      alerts: { phq9: [{ message: 'אובדנות', severity: 'critical' }] },
    };
    const body = buildSummaryBlock(state, config).table.body;
    expect(norm(body[0][0])).toContain('אובדנות');
  });

  it('tolerates an empty session with no answers', () => {
    expect(buildSummaryBlock({}, config).table.body).toHaveLength(0);
  });
});

// ── buildItemRow ──────────────────────────────────────────────────────────────

describe('buildItemRow', () => {
  const q = { id: 'phq9', optionSets: { freq: OPTIONS_FREQ }, defaultOptionSetId: 'freq', items: [] };
  const item = { id: 'q1', type: 'select', text: 'מעט עניין או הנאה' };

  it('puts the raw numeric answer in the score column and the label in the answer column', () => {
    const [scoreCell, answerCell, contentCell, numCell] = buildItemRow(item, 1, 2, q);
    expect(flatText(scoreCell)).toBe('2');
    expect(norm(answerCell)).toContain('לעתים קרובות'); // label for value 2
    expect(norm(contentCell)).toContain('מעט עניין או הנאה');
    expect(flatText(numCell)).toBe('1');
  });

  it('renders an em-dash for an unanswered item', () => {
    const [scoreCell, answerCell] = buildItemRow(item, 3, null, q);
    expect(flatText(scoreCell)).toBe('—');
    expect(flatText(answerCell)).toContain('—');
  });

  it('renders "·" in the number column for a conditional (null rowNum) row', () => {
    const row = buildItemRow(item, null, 1, q);
    expect(flatText(row[3])).toBe('·');
  });

  it('highlights a high-risk answer with a fill colour', () => {
    const row = buildItemRow(item, 1, 3, q); // value 3 = max → high
    expect(row[0].fillColor).toMatch(/^#/);
  });

  it('highlights a medium-risk answer with a different fill from high-risk', () => {
    const high = buildItemRow(item, 1, 3, q)[0].fillColor; // max → high
    const med  = buildItemRow(item, 1, 2, q)[0].fillColor; // second-highest → med
    expect(med).toMatch(/^#/);
    expect(med).not.toBe(high);
  });

  it('leaves a low-risk answer unfilled', () => {
    const row = buildItemRow(item, 1, 0, q); // value 0 → no risk
    expect(row[0].fillColor).toBeUndefined();
  });

  it('shows the raw value when no option matches it', () => {
    const [scoreCell, answerCell] = buildItemRow(item, 1, 9, q); // 9 not in option set
    expect(flatText(scoreCell)).toBe('9');
    expect(flatText(answerCell)).toContain('9');
  });
});

// ── buildTextBlock ────────────────────────────────────────────────────────────

describe('buildTextBlock', () => {
  const item = { id: 't1', type: 'text', text: 'תאר את התלונה העיקרית' };

  it('renders the item prompt in bold and the free-text answer below it', () => {
    const block = buildTextBlock(item, 'קושי בשינה');
    expect(block.stack[0].bold).toBe(true);
    expect(norm(block.stack[0])).toContain('תאר את התלונה העיקרית');
    expect(norm(block.stack[1])).toContain('קושי בשינה');
  });

  it('renders an em-dash when the answer is empty', () => {
    const block = buildTextBlock(item, '');
    expect(flatText(block.stack[1])).toContain('—');
  });

  it('renders an em-dash when the answer is null', () => {
    const block = buildTextBlock(item, null);
    expect(flatText(block.stack[1])).toContain('—');
  });
});

// ── buildMultiselectBlock ─────────────────────────────────────────────────────

describe('buildMultiselectBlock', () => {
  const item = {
    id: 'm1',
    type: 'multiselect',
    text: 'סמן את התסמינים',
    options: [{ label: 'עייפות' }, { label: 'כאב ראש' }, { label: 'בחילה' }],
  };

  it('renders the labels for the selected (1-indexed) options', () => {
    const text = norm(buildMultiselectBlock(item, [1, 3]));
    expect(text).toContain('עייפות');  // option 1
    expect(text).toContain('בחילה');   // option 3
    expect(text).not.toContain('כאב ראש'); // option 2 not selected
  });

  it('separates multiple selected labels', () => {
    expect(flatText(buildMultiselectBlock(item, [1, 2]))).toContain('|');
  });

  it('filters out-of-range indices', () => {
    const block = buildMultiselectBlock(item, [9]);
    expect(flatText(block.stack[1])).toContain('—');
  });

  it('renders an em-dash for an empty selection', () => {
    expect(flatText(buildMultiselectBlock(item, []).stack[1])).toContain('—');
  });

  it('renders an em-dash when the answer is not an array', () => {
    expect(flatText(buildMultiselectBlock(item, undefined).stack[1])).toContain('—');
  });

  it('renders the item prompt in bold', () => {
    const block = buildMultiselectBlock(item, [1]);
    expect(block.stack[0].bold).toBe(true);
    expect(norm(block.stack[0])).toContain('סמן את התסמינים');
  });
});
