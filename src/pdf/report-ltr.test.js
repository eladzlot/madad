// LTR (English) rendering of the PDF builders.
//
// report.js is authored in RTL visual order; layoutFor('en') must flip column
// order, left-align paragraphs, skip the bidi pre-reversal, use the English
// string table and the en-GB date format — while leaving the Hebrew path
// (report.test.js, report-render.test.js) byte-identical.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildDocDefinition,
  buildHeader,
  buildTableHeaderRow,
  buildItemRow,
  buildSectionHeader,
  buildSubscoresLine,
  buildRatedTextBlock,
  buildFooter,
  setReportLanguage,
  initBidiForTesting,
} from './report.js';
import { loadStrings, _resetStringsForTesting } from '../i18n/index.js';

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

const Q = {
  id: 'phq9',
  title: 'Patient Health Questionnaire (PHQ-9)',
  optionSets: { f: [{ label: 'Not at all', value: 0 }, { label: 'Nearly every day', value: 3 }] },
  defaultOptionSetId: 'f',
  items: [{ id: 'q1', type: 'select', text: 'Little interest or pleasure in doing things' }],
  scoring: { method: 'subscales', subscales: { a: ['q1'] } },
  subscaleLabels: { a: 'Anhedonia' },
  alerts: [],
};
const STATE = {
  answers: { phq9: { q1: 3 } },
  scores:  { phq9: { total: 3, category: 'Minimal', subscales: { a: 3 } } },
  alerts:  { phq9: [{ id: 'sui', message: 'Suicidality', severity: 'critical' }] },
  questionnaireIds: { phq9: 'phq9' },
};
const NOW = new Date('2026-03-12T07:05:00Z');

beforeAll(async () => {
  await initBidiForTesting();
  await loadStrings('en');
  setReportLanguage('en');
});
afterAll(() => {
  _resetStringsForTesting();
  setReportLanguage('he');
});

describe('LTR document', () => {
  it('left-aligns the default style and instruction text', () => {
    const def = buildDocDefinition(STATE, { questionnaires: [Q] }, { pid: 'P1' }, NOW, { lang: 'en' });
    expect(def.defaultStyle.alignment).toBe('left');
    expect(def.styles.instructionText.alignment).toBe('left');
  });

  it('stamps lang into the embedded envelope', () => {
    const def = buildDocDefinition(STATE, { questionnaires: [Q] }, { pid: 'P1' }, NOW, { lang: 'en' });
    const b64 = def.files['data.json'].src.split(',')[1];
    const env = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(env.lang).toBe('en');
  });

  it('puts the row number first and the score last in the table header', () => {
    const row = buildTableHeaderRow();
    expect(row[0].text).toBe('#');
    expect(row[1].text).toBe('Item');
    expect(row[2].text).toBe('Answer');
    expect(row[3].text).toBe('Score');
    expect(row[1].alignment).toBe('left');
  });

  it('orders data rows to match the header', () => {
    const row = buildItemRow(Q.items[0], 1, 3, Q);
    expect(row[0].text).toBe('1');
    expect(flatText(row[1])).toContain('Little interest');
    expect(flatText(row[2])).toBe('Nearly every day');
    expect(row[3].text).toBe('3');
  });

  it('does not fuse LTR text with NBSP or mirror it', () => {
    const row = buildItemRow(Q.items[0], 1, 3, Q);
    expect(flatText(row[1])).not.toContain(' ');
  });

  it('renders the header as name | pid | date with an English date', () => {
    const header = buildHeader({ pid: 'P1', name: 'Jane Doe' }, NOW);
    const cells = header.table.body[0];
    expect(flatText(cells[0])).toContain('Name');
    expect(flatText(cells[0])).toContain('Jane Doe');
    expect(flatText(cells[1])).toContain('Patient ID');
    expect(flatText(cells[2])).toContain('Date');
    expect(flatText(cells[2])).toMatch(/12\/03\/2026/);
  });

  it('section header reads measure | score | severity | badge', () => {
    const cells = buildSectionHeader(Q, STATE, 'phq9').table.body[0];
    expect(flatText(cells[0])).toContain('PHQ-9');
    expect(flatText(cells[1])).toBe('3');
    expect(flatText(cells[2])).toBe('Minimal');
    expect(flatText(cells[3])).toContain('Suicidality');
    expect(cells[0].alignment).toBe('left');
  });

  it('subscores line starts with the English prefix', () => {
    const line = buildSubscoresLine(Q, STATE, 'phq9');
    expect(flatText(line.columns[0])).toBe('Subscales:');
    expect(flatText(line)).toContain('Anhedonia');
    expect(line.columns[line.columns.length - 1].width).toBe('*');
  });

  it('rated-text block reads "Rating:" then the value', () => {
    const block = buildRatedTextBlock({ id: 'r', type: 'rated_text', text: 'Thought', max: 100 }, 40, 'a stuck point');
    const cols = block.stack[2].columns;
    expect(flatText(cols[0])).toBe('Rating:');
    expect(flatText(cols[1])).toContain('40');
  });

  it('footer is English and left-aligned', () => {
    const footer = buildFooter()(2, 5);
    expect(flatText(footer.columns[0])).toContain('Page 2 of 5');
    expect(flatText(footer.columns[0])).toContain('Madad · CTR');
    expect(footer.columns[0].alignment).toBe('left');
  });

  it('leaves the Hebrew path unchanged after switching back', () => {
    setReportLanguage('he');
    const row = buildTableHeaderRow();
    expect(row[3].text).toBe('#');
    setReportLanguage('en');
  });
});
