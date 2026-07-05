// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './session-detail.js';

const OPTIONS = [
  { label: 'כלל לא', value: 0 },
  { label: 'כמה ימים', value: 1 },
  { label: 'כמעט כל יום', value: 3 },
];

const PHQ9_CONFIG = {
  id: 'phq9',
  title: 'שאלון דיכאון (PHQ-9)',
  defaultOptionSetId: 'freq',
  optionSets: { freq: OPTIONS },
  items: [
    { id: 'intro', type: 'instructions', text: 'הוראות' },
    { id: '1', type: 'select', text: 'עניין או הנאה מועטים' },
    { id: '2', type: 'select', text: 'תחושת דכדוך' },
    { type: 'if', condition: 'x', then: [{ id: '3', type: 'select', text: 'שאלה מותנית' }] },
  ],
  subscaleLabels: { mood: 'מצב רוח' },
};

const SESSION = {
  id: 0,
  fileName: 'report-P001-2026-07-01.pdf',
  file: new Blob(['%PDF-fake'], { type: 'application/pdf' }),
  envelope: {
    schemaVersion: 1,
    generatedAt: '2026-07-01T09:30:00Z',
    pid: 'P001',
    name: null,
    instruments: [
      { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' },
      { questionnaireId: 'oci_r', title: 'שאלון טורדנות כפייתית (OCI-R)', configFile: 'standard' },
    ],
    sessionState: {
      answers: { phq9: { 1: 3, 2: 1, 3: 0 }, oci_r: { 1: 4 } },
      scores: {
        phq9: { total: 4, subscales: { mood: 2 }, category: 'מינימלי' },
        oci_r: { total: 31, subscales: {}, category: 'חשד ל-OCD' },
      },
      alerts: { phq9: [{ id: 'suicidality', message: 'מחשבות אובדניות', severity: 'critical' }] },
      questionnaireIds: { phq9: 'phq9', oci_r: 'oci_r' },
    },
  },
};

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<session-detail></session-detail>`);
  Object.assign(el, {
    session: SESSION,
    sessionKey: 'phq9',
    questionnaireId: 'phq9',
    questionnaires: new Map([['phq9', PHQ9_CONFIG]]),
    ...props,
  });
  await el.updateComplete;
  return el;
}

describe('session-detail', () => {
  it('renders nothing without a session', async () => {
    const el = await makeEl({ session: null });
    expect(el.shadowRoot.querySelector('header')).toBeNull();
  });

  it('is scoped to the selected questionnaire only', async () => {
    const el = await makeEl();
    const text = el.shadowRoot.textContent;
    expect(text).toContain('PHQ-9');
    expect(text).not.toContain('OCI-R');   // other instrument from the same PDF
    expect(text).not.toContain('31');
  });

  it('shows total, category, subscales with Hebrew labels, and alerts', async () => {
    const el = await makeEl();
    const text = el.shadowRoot.textContent;
    expect(el.shadowRoot.querySelector('.total').textContent).toBe('4');
    expect(text).toContain('מינימלי');
    expect(text).toContain('מצב רוח');
    expect(text).toContain('מחשבות אובדניות');
  });

  it('lists every answered item with question text and response label', async () => {
    const el = await makeEl();
    const items = [...el.shadowRoot.querySelectorAll('ol.items li')];
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('עניין או הנאה מועטים');
    expect(items[0].textContent).toContain('כמעט כל יום');   // value 3 → label
    expect(items[1].textContent).toContain('כמה ימים');       // value 1 → label
    // Item inside an if-branch resolves too.
    expect(items[2].textContent).toContain('שאלה מותנית');
    expect(items[2].textContent).toContain('כלל לא');
  });

  it('falls back to raw ids and values when no config questionnaire is loaded', async () => {
    const el = await makeEl({ questionnaires: new Map() });
    const items = [...el.shadowRoot.querySelectorAll('ol.items li')];
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('1');   // raw item id
    expect(items[0].textContent).toContain('3');   // raw value
  });

  it('resolves instanceId session keys via questionnaireIds', async () => {
    const el = await makeEl({
      sessionKey: 'phq9#1',
      session: {
        ...SESSION,
        envelope: {
          ...SESSION.envelope,
          sessionState: {
            answers: { 'phq9#1': { 1: 1 } },
            scores: { 'phq9#1': { total: 1, subscales: {} } },
            alerts: {},
            questionnaireIds: { 'phq9#1': 'phq9' },
          },
        },
      },
    });
    const text = el.shadowRoot.textContent;
    expect(text).toContain('PHQ-9');
    expect(el.shadowRoot.querySelector('.total').textContent).toBe('1');
    expect(text).toContain('עניין או הנאה מועטים');
  });

  it('offers the original PDF as a download from the in-memory Blob', async () => {
    const el = await makeEl();
    const link = el.shadowRoot.querySelector('a.download');
    expect(link.getAttribute('download')).toBe('report-P001-2026-07-01.pdf');
    expect(link.getAttribute('href')).toBeTruthy();
  });

  it('close button and Escape dispatch panel-closed', async () => {
    const el = await makeEl();
    const events = [];
    el.addEventListener('panel-closed', () => events.push(1));

    el.shadowRoot.querySelector('.close').click();
    expect(events).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(events).toHaveLength(2);
  });
});
