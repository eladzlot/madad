// @vitest-environment happy-dom
// Tests for <trajectory-chart>. The geometry is pinned in
// chart-model.test.js; here we assert the component stamps the model into
// SVG and that the interaction layer (tooltip, keyboard, selection, table)
// behaves.
import '../../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './trajectory-chart.js';

const D = (iso) => new Date(iso);

function series(points) {
  return { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', points };
}

function pts(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({
    sessionId: i,
    sessionKey: 'phq9',
    date: D(`2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    total: i + 2,
    subscales: {},
    alerts: [],
    ...extra,
  }));
}

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<trajectory-chart></trajectory-chart>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

const markers = (el) => [...el.shadowRoot.querySelectorAll('.marker')];

describe('trajectory-chart — rendering', () => {
  it('renders title, markers, and a line for two points', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    expect(el.shadowRoot.querySelector('h3').textContent).toContain('PHQ-9');
    expect(markers(el)).toHaveLength(2);
    expect(el.shadowRoot.querySelector('path')).not.toBeNull();
  });

  it('renders a single point with no line', async () => {
    const el = await makeEl({ series: series(pts(1)) });
    expect(markers(el)).toHaveLength(1);
    expect(el.shadowRoot.querySelector('path')).toBeNull();
  });

  it('renders severity bands and cutoff lines from the questionnaire config', async () => {
    const el = await makeEl({
      series: series(pts(1)),
      questionnaire: {
        interpretations: {
          type: 'severity',
          ranges: [
            { min: 0, max: 9, label: 'קל' },
            { min: 10, max: 27, label: 'חמור' },
          ],
          cutoffs: [{ value: 10, label: 'סף' }],
        },
      },
    });
    expect(el.shadowRoot.querySelectorAll('rect')).toHaveLength(2);
    const texts = [...el.shadowRoot.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('קל');
    expect(texts).toContain('סף');
  });

  it('marks alert sessions with an alert ring', async () => {
    const el = await makeEl({
      series: series(pts(1, { alerts: [{ message: 'מחשבות אובדניות', severity: 'critical' }] })),
    });
    expect(el.shadowRoot.querySelectorAll('circle')).toHaveLength(2);   // marker + ring
  });

  it('pages backwards and forwards through more than 5 sessions', async () => {
    const el = await makeEl({ series: series(pts(7)) });
    const pagerText = () => el.shadowRoot.querySelector('.pager span').textContent;
    expect(pagerText()).toContain('3–7');

    el.shadowRoot.querySelectorAll('.pager button')[0].click();   // older
    await el.updateComplete;
    expect(pagerText()).toContain('1–2');

    el.shadowRoot.querySelectorAll('.pager button')[1].click();   // newer
    await el.updateComplete;
    expect(pagerText()).toContain('3–7');
  });
});

describe('trajectory-chart — tooltip', () => {
  it('shows a tooltip with total, category, subscales, and alerts on focus', async () => {
    const el = await makeEl({
      series: series(pts(1, {
        total: 12,
        category: 'בינוני',
        subscales: { washing: 2.5 },
        alerts: [{ message: 'התראה', severity: 'warning' }],
      })),
      questionnaire: { subscaleLabels: { washing: 'שטיפה' } },
    });
    markers(el)[0].dispatchEvent(new Event('focus'));
    await el.updateComplete;

    const tip = el.shadowRoot.querySelector('.tooltip');
    expect(tip).not.toBeNull();
    expect(tip.textContent).toContain('12');
    expect(tip.textContent).toContain('בינוני');
    expect(tip.textContent).toContain('שטיפה: 2.5');
    expect(tip.textContent).toContain('התראה');
  });

  it('hides the tooltip on blur', async () => {
    const el = await makeEl({ series: series(pts(1)) });
    markers(el)[0].dispatchEvent(new Event('focus'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tooltip')).not.toBeNull();

    markers(el)[0].dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tooltip')).toBeNull();
  });
});

describe('trajectory-chart — keyboard & selection', () => {
  it('markers are focusable with aria labels', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    const [first] = markers(el);
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('role')).toBe('button');
    expect(first.getAttribute('aria-label')).toBeTruthy();
  });

  it('arrow keys move focus between markers', async () => {
    const el = await makeEl({ series: series(pts(3)) });
    const ms = markers(el);
    const spy = vi.spyOn(ms[1], 'focus');
    ms[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(spy).toHaveBeenCalled();
  });

  it('click and Enter dispatch point-selected with the sessionId', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    const events = [];
    el.addEventListener('point-selected', (e) => events.push(e.detail));

    markers(el)[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events).toEqual([{ sessionId: 1, sessionKey: 'phq9', questionnaireId: 'phq9' }]);

    markers(el)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events[1]).toEqual({ sessionId: 0, sessionKey: 'phq9', questionnaireId: 'phq9' });
  });
});

describe('trajectory-chart — view as table', () => {
  it('toggles a table of the full series with subscale columns', async () => {
    const el = await makeEl({
      series: series(pts(7, { subscales: { washing: 2 }, category: 'קל' })),
      questionnaire: { subscaleLabels: { washing: 'שטיפה' } },
    });
    expect(el.shadowRoot.querySelector('table')).toBeNull();

    el.shadowRoot.querySelector('.table-toggle').click();
    await el.updateComplete;

    const table = el.shadowRoot.querySelector('table');
    expect(table).not.toBeNull();
    // Full series, not just the 5-session window.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    const headers = [...table.querySelectorAll('th')].map(t => t.textContent);
    expect(headers).toContain('שטיפה');

    el.shadowRoot.querySelector('.table-toggle').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('table')).toBeNull();
  });
});
