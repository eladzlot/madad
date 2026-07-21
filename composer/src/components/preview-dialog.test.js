// @vitest-environment happy-dom
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './preview-dialog.js';
import { buildPreviewModel } from '../preview/preview-model.js';

const Q_CONFIG = {
  questionnaires: [{
    id: 'demo',
    title: 'שאלון הדגמה',
    description: 'תיאור לגילוי',
    keywords: ['depression', 'demo'],
    meta: { domains: ['depression'], type: 'severity', populations: ['adult'], featured: true },
    defaultOptionSetId: 'freq',
    optionSets: { freq: [{ label: 'כלל לא', value: 0 }, { label: 'הרבה', value: 3 }] },
    items: [
      { id: 'intro', type: 'instructions', text: 'הוראות פתיחה' },
      { id: 'q1', type: 'select', text: 'שאלה ראשונה' },
      { id: 't1', type: 'text', text: 'הערות', inputType: 'multiline', required: true },
      { id: 's1', type: 'slider', text: 'דרג', min: 0, max: 10, labels: { min: 'נמוך', max: 'גבוה' } },
      { id: 'm1', type: 'multiselect', text: 'תסמינים', options: [{ label: 'עייפות' }, { label: 'כאב' }] },
      { id: 'if1', type: 'if', condition: 'item.q1 >= 2', then: [
        { id: 'q2', type: 'select', text: 'שאלת המשך', options: [{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }] },
      ], else: [] },
    ],
    scoring: { method: 'sum' },
    interpretations: { ranges: [{ min: 0, max: 4, label: 'קל' }, { min: 5, max: 10, label: 'חמור' }] },
    alerts: [{ id: 'a', condition: 'item.q1 == 3', message: 'סיכון', severity: 'critical' }],
  }],
};

const B_CONFIG = {
  batteries: [{
    id: 'bat', title: 'סוללת הדגמה', meta: { domains: ['intake'] },
    sequence: [
      { questionnaireId: 'demo' },
      { type: 'if', condition: 'item.demo.q1 == 1', then: [{ questionnaireId: 'demo2' }], else: [] },
    ],
  }],
  questionnaires: [
    Q_CONFIG.questionnaires[0],
    { id: 'demo2', title: 'שאלון שני', items: [{ id: 'x', type: 'text', text: 'טקסט' }] },
  ],
};

async function makeEl(model, props = {}) {
  const el = await fixture(html`<preview-dialog></preview-dialog>`);
  Object.assign(el, { model, ...props });
  await el.updateComplete;
  return el;
}

describe('preview-dialog — questionnaire', () => {
  const model = buildPreviewModel(Q_CONFIG, 'demo');

  it('renders the summary: title, description, meta badges', async () => {
    const el = await makeEl(model);
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('שאלון הדגמה');
    expect(txt).toContain('תיאור לגילוי');
    expect(txt).toContain('חומרה');      // type label
    expect(txt).toContain('דיכאון');     // domain label
  });

  it('renders scoring and interpretation; alert shows its message always', async () => {
    const el = await makeEl(model);
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('סכום');         // scoring method, translated (sum → סכום)
    expect(txt).toContain('קל');
    expect(txt).toContain('סיכון');       // alert message
  });

  it('renders each item type read-only', async () => {
    const el = await makeEl(model);
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('הוראות פתיחה');       // instructions
    expect(txt).toContain('כלל לא');             // resolved select option
    expect(txt).toContain('תשובה חופשית');       // text field
    expect(txt).toContain('רב-שורות');           // inputType label
    expect(txt).toContain('חובה');               // required marker
    expect(txt).toContain('☐');                  // multiselect glyph
    expect(txt).toContain('נמוך');               // slider min label
  });

  it('shows the "מוצג בתנאי" divider and the conditional item', async () => {
    const el = await makeEl(model);
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('מוצג בתנאי');
    expect(txt).toContain('שאלת המשך');
  });

  it('hides ids and condition DSL until the mechanics toggle is on', async () => {
    const el = await makeEl(model);
    // Default: mechanics off → no ids, no raw DSL.
    expect(el.shadowRoot.textContent).not.toContain('id:');
    expect(el.shadowRoot.textContent).not.toContain('item.q1 ≥ 2');
    expect(el.shadowRoot.textContent).not.toContain('item.q1 = 3');
    // Turn mechanics on.
    el.shadowRoot.querySelector('.mech-btn').click();
    await el.updateComplete;
    const txt = el.shadowRoot.textContent;
    expect(txt).toContain('id: q1');          // item id, labelled
    expect(txt).toContain('item.q1 ≥ 2');     // condition DSL (prettified)
    expect(txt).toContain('item.q1 = 3');     // alert DSL (prettified)
  });

  it('renders the ↗ live link when a liveUrl is given', async () => {
    const el = await makeEl(model, { liveUrl: '/?items=demo' });
    const link = el.shadowRoot.querySelector('a[href="/?items=demo"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('emits preview-close when the ✕ button is clicked', async () => {
    const el = await makeEl(model);
    let closed = false;
    el.addEventListener('preview-close', () => { closed = true; });
    // The ✕ is the icon-btn without an href (the ↗ is an <a>).
    el.shadowRoot.querySelector('button.icon-btn').click();
    expect(closed).toBe(true);
  });

  it('closes on a backdrop click (target is the dialog) but not on a content click', async () => {
    const el = await makeEl(model);
    let closes = 0;
    el.addEventListener('preview-close', () => { closes++; });
    // Content click: bubbles to the dialog but target is an inner node → no close.
    el.shadowRoot.querySelector('.title').click();
    expect(closes).toBe(0);
    // Backdrop click: target is the dialog element itself → close.
    const dlg = el.shadowRoot.querySelector('dialog');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closes).toBe(1);
  });
});

describe('preview-dialog — battery', () => {
  const model = buildPreviewModel(B_CONFIG, 'bat');

  it('renders an all-collapsed accordion of steps', async () => {
    const el = await makeEl(model);
    const steps = el.shadowRoot.querySelectorAll('details.step');
    expect(steps.length).toBe(2);
    for (const d of steps) expect(d.hasAttribute('open')).toBe(false);
  });

  it('shows step titles and the gating condition; DSL appears with mechanics on', async () => {
    const el = await makeEl(model);
    let txt = el.shadowRoot.textContent;
    expect(txt).toContain('שאלון הדגמה');    // first step (resolved title)
    expect(txt).toContain('שאלון שני');       // conditional step
    expect(txt).toContain('מוצג בתנאי');      // gate label (no DSL yet)
    expect(txt).not.toContain('item.demo.q1 = 1');
    el.shadowRoot.querySelector('.mech-btn').click();
    await el.updateComplete;
    txt = el.shadowRoot.textContent;
    expect(txt).toContain('item.demo.q1 = 1'); // prettified gate DSL
  });
});

describe('preview-dialog — open plumbing', () => {
  it('reflects the open attribute and does not render content without a model', async () => {
    const el = await makeEl(null);
    expect(el.shadowRoot.querySelector('.title')).toBeNull();
  });
});
