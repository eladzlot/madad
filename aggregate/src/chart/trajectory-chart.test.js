// @vitest-environment happy-dom
// Smoke tests for <trajectory-chart>. The geometry is pinned in
// chart-model.test.js; here we only assert the component stamps the model
// into SVG and that paging works.
import '../../../tests/setup-dom.js';
import { describe, it, expect } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './trajectory-chart.js';

const D = (iso) => new Date(iso);

function series(points) {
  return { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', points };
}

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<trajectory-chart></trajectory-chart>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

describe('trajectory-chart', () => {
  it('renders title, markers, and a line for two points', async () => {
    const el = await makeEl({
      series: series([
        { date: D('2026-07-01T10:00:00Z'), total: 12, alerts: [] },
        { date: D('2026-07-08T10:00:00Z'), total: 8, alerts: [] },
      ]),
    });
    expect(el.shadowRoot.querySelector('h3').textContent).toContain('PHQ-9');
    expect(el.shadowRoot.querySelectorAll('circle')).toHaveLength(2);
    expect(el.shadowRoot.querySelector('path')).not.toBeNull();
  });

  it('renders a single point with no line', async () => {
    const el = await makeEl({
      series: series([{ date: D('2026-07-01T10:00:00Z'), total: 12, alerts: [] }]),
    });
    expect(el.shadowRoot.querySelectorAll('circle')).toHaveLength(1);
    expect(el.shadowRoot.querySelector('path')).toBeNull();
  });

  it('renders severity bands and cutoff lines from interpretations', async () => {
    const el = await makeEl({
      series: series([{ date: D('2026-07-01T10:00:00Z'), total: 12, alerts: [] }]),
      interpretations: {
        type: 'severity',
        ranges: [
          { min: 0, max: 9, label: 'קל' },
          { min: 10, max: 27, label: 'חמור' },
        ],
        cutoffs: [{ value: 10, label: 'סף' }],
      },
    });
    expect(el.shadowRoot.querySelectorAll('rect')).toHaveLength(2);
    const texts = [...el.shadowRoot.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('קל');
    expect(texts).toContain('סף');
  });

  it('pages backwards and forwards through more than 5 sessions', async () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      date: D(`2026-01-0${i + 1}T10:00:00Z`), total: i, alerts: [],
    }));
    const el = await makeEl({ series: series(points) });

    const pagerText = () => el.shadowRoot.querySelector('.pager span').textContent;
    expect(pagerText()).toContain('3–7');

    el.shadowRoot.querySelectorAll('.pager button')[0].click();   // older
    await el.updateComplete;
    expect(pagerText()).toContain('1–2');

    el.shadowRoot.querySelectorAll('.pager button')[1].click();   // newer
    await el.updateComplete;
    expect(pagerText()).toContain('3–7');
  });

  it('marks alert sessions with an alert ring', async () => {
    const el = await makeEl({
      series: series([{
        date: D('2026-07-01T10:00:00Z'), total: 20,
        alerts: [{ message: 'מחשבות אובדניות', severity: 'critical' }],
      }]),
    });
    // marker circle + alert ring
    expect(el.shadowRoot.querySelectorAll('circle')).toHaveLength(2);
  });
});
