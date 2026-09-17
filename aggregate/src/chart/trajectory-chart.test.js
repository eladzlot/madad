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

  it('marks alert sessions with a doubled, achromatic alert ring', async () => {
    const el = await makeEl({
      series: series(pts(1, { alerts: [{ message: 'מחשבות אובדניות', severity: 'critical' }] })),
    });
    const circles = [...el.shadowRoot.querySelectorAll('circle')];
    expect(circles).toHaveLength(3);   // marker + two rings

    // The ring takes --clin-alert-ring, NOT --color-no. A red ring 4px from a
    // green marker measured ΔE 6.9 under deuteranopia (REMOTE_SPEC §8.4), so it
    // separates by lightness instead — and it is doubled, which is what keeps it
    // reading as an alert rather than as the focus state.
    const rings = circles.filter(c => c.getAttribute('fill') === 'none');
    expect(rings).toHaveLength(2);
    expect(rings.map(c => c.getAttribute('r'))).toEqual(['8.5', '11.5']);
    for (const ring of rings) {
      expect(ring.getAttribute('stroke')).toContain('--clin-alert-ring');
      expect(ring.getAttribute('stroke')).not.toContain('--color-no');
    }
  });

  it('shows every session with no pagination (D-13)', async () => {
    const el = await makeEl({ series: series(pts(12)) });
    expect(markers(el)).toHaveLength(12);
    expect(el.shadowRoot.querySelector('.pager')).toBeNull();
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

describe('trajectory-chart — item heatmap', () => {
  const QUESTIONNAIRE = {
    defaultOptionSetId: 'freq',
    optionSets: { freq: [{ label: 'a', value: 0 }, { label: 'b', value: 3 }] },
    items: [
      { id: 'q1', type: 'select', text: 'שאלה ראשונה' },
      { id: 'q2', type: 'select', text: 'שאלה שנייה' },
    ],
  };

  it('switches to a heatmap grid with one row per answered item', async () => {
    const el = await makeEl({
      series: series(pts(2, { answers: { q1: 3, q2: 0 } })),
      questionnaire: QUESTIONNAIRE,
    });
    expect(el.shadowRoot.querySelector('table.heatmap')).toBeNull();

    el.shadowRoot.querySelector('[data-view="heatmap"]').click();
    await el.updateComplete;

    const heatmap = el.shadowRoot.querySelector('table.heatmap');
    expect(heatmap).not.toBeNull();
    // Views are mutually exclusive (D-16): the chart SVG is gone.
    expect(el.shadowRoot.querySelector('svg')).toBeNull();
    expect(heatmap.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(heatmap.querySelectorAll('tbody td.cell')).toHaveLength(4);   // 2 items × 2 sessions
    // Hot and cold cells get different fills.
    const [hot, cold] = [...heatmap.querySelectorAll('tbody tr')].map(
      tr => tr.querySelector('td').getAttribute('style'));
    expect(hot).not.toBe(cold);
  });

  it('clicking a heatmap cell or column header dispatches point-selected for that column', async () => {
    const el = await makeEl({
      series: series(pts(2, { answers: { q1: 3, q2: 0 } })),
      questionnaire: QUESTIONNAIRE,
    });
    const events = [];
    el.addEventListener('point-selected', (e) => events.push(e.detail));

    el.shadowRoot.querySelector('[data-view="heatmap"]').click();
    await el.updateComplete;

    // Columns render reversed in the RTL table: DOM-first = newest session.
    el.shadowRoot.querySelector('table.heatmap th.col-head')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events).toEqual([{ sessionId: 1, sessionKey: 'phq9', questionnaireId: 'phq9' }]);

    const lastCell = [...el.shadowRoot.querySelectorAll('table.heatmap tbody tr:first-child td.cell')].at(-1);
    lastCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events[1]).toEqual({ sessionId: 0, sessionKey: 'phq9', questionnaireId: 'phq9' });
  });

  it('offers no heatmap view without a config questionnaire', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    expect(el.shadowRoot.querySelector('[data-view="heatmap"]')).toBeNull();
  });

  it('renders compact color chips (no in-cell numbers, tooltips instead) past the threshold', async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      sessionId: i,
      sessionKey: 'phq9',
      date: D(`2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
      total: 1,
      subscales: {},
      alerts: [],
      answers: { q1: 3 },
    }));
    const el = await makeEl({ series: series(points), questionnaire: QUESTIONNAIRE });
    el.shadowRoot.querySelector('[data-view="heatmap"]').click();
    await el.updateComplete;

    const heatmap = el.shadowRoot.querySelector('table.heatmap');
    expect(heatmap.classList.contains('compact')).toBe(true);
    const cell = heatmap.querySelector('tbody td.cell');
    expect(cell.textContent.trim()).toBe('');
    expect(cell.getAttribute('title')).toMatch(/· 3$/);
  });
});

describe('trajectory-chart — image export (§6)', () => {
  it('offers PNG and SVG export buttons', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    expect(el.shadowRoot.querySelector('.export-png')).not.toBeNull();
    expect(el.shadowRoot.querySelector('.export-svg')).not.toBeNull();
  });

  it('offers the pid checkbox (default off) only when all points share one pid', async () => {
    const withPid = await makeEl({ series: series(pts(2, { pid: 'TRC-001' })) });
    const checkbox = withPid.shadowRoot.querySelector('.export-pid input');
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);

    const noPid = await makeEl({ series: series(pts(2)) });
    expect(noPid.shadowRoot.querySelector('.export-pid')).toBeNull();
  });
});

describe('trajectory-chart — copy to clipboard (§6)', () => {
  function stubClipboard() {
    const written = [];
    // Swallow the pending blob promise — happy-dom never fires Image.onload,
    // so rasterization stays pending; the copy contract under test is the
    // synchronous ClipboardItem construction + clipboard.write call.
    globalThis.ClipboardItem = class {
      constructor(items) {
        this.types = Object.keys(items);
        Object.values(items).forEach(v => Promise.resolve(v).catch(() => {}));
      }
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: vi.fn(async (items) => written.push(...items)) },
      configurable: true,
    });
    return written;
  }

  it('copy writes an image/png ClipboardItem and shows transient feedback', async () => {
    const written = stubClipboard();
    try {
      const el = await makeEl({ series: series(pts(2)) });
      const btn = el.shadowRoot.querySelector('.export-copy');
      expect(btn).not.toBeNull();
      expect(btn.textContent).toContain('העתקה');

      btn.click();
      await new Promise(r => setTimeout(r));
      await el.updateComplete;

      expect(written).toHaveLength(1);
      expect(written[0].types).toEqual(['image/png']);
      expect(el.shadowRoot.querySelector('.export-copy').textContent).toContain('הועתק');
    } finally {
      delete globalThis.ClipboardItem;
    }
  });

  it('hides the copy button when the Clipboard API is unavailable', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    expect(el.shadowRoot.querySelector('.export-copy')).toBeNull();
  });
});

describe('trajectory-chart — view as table', () => {
  it('switches to a table of the full series with subscale columns and back', async () => {
    const el = await makeEl({
      series: series(pts(7, { subscales: { washing: 2 }, category: 'קל' })),
      questionnaire: { subscaleLabels: { washing: 'שטיפה' } },
    });
    expect(el.shadowRoot.querySelector('table')).toBeNull();

    el.shadowRoot.querySelector('[data-view="table"]').click();
    await el.updateComplete;

    const table = el.shadowRoot.querySelector('table');
    expect(table).not.toBeNull();
    // Views are mutually exclusive (D-16): the chart SVG is gone.
    expect(el.shadowRoot.querySelector('svg')).toBeNull();
    // Full series, not just the 5-session window.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    const headers = [...table.querySelectorAll('th')].map(t => t.textContent);
    expect(headers).toContain('שטיפה');

    el.shadowRoot.querySelector('[data-view="chart"]').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('table')).toBeNull();
    expect(el.shadowRoot.querySelector('svg')).not.toBeNull();
  });

  it('click or Enter on a table row dispatches point-selected for that session', async () => {
    const el = await makeEl({ series: series(pts(2)) });
    const events = [];
    el.addEventListener('point-selected', (e) => events.push(e.detail));

    el.shadowRoot.querySelector('[data-view="table"]').click();
    await el.updateComplete;

    const rows = [...el.shadowRoot.querySelectorAll('tr.session-row')];
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events).toEqual([{ sessionId: 1, sessionKey: 'phq9', questionnaireId: 'phq9' }]);

    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events[1]).toEqual({ sessionId: 0, sessionKey: 'phq9', questionnaireId: 'phq9' });
  });
});

// ── tooltip survival across re-render ────────────────────────────────────────

describe('tooltip persistence (willUpdate)', () => {
  const seriesOf = (ids) => ({
    questionnaireId: 'phq9',
    title: 'PHQ-9',
    points: ids.map((id, i) => ({ sessionId: id, date: new Date(2026, 0, i + 1), value: 10 + i, alerts: [], answers: {} })),
  });

  // A tooltip marker must be complete enough for _renderTooltip: it reads
  // label, total, category, subscales, alerts and baseline.
  const markerFor = (id) => ({
    sessionId: id, label: `1.${id + 1}.2026`, total: 10 + id, category: null,
    subscales: {}, alerts: [], baseline: false,
  });

  async function withTooltip(ids) {
    const el = await fixture(testHtml`<trajectory-chart></trajectory-chart>`);
    el.series = seriesOf(ids);
    await el.updateComplete;
    // Simulate focusing the first marker: this is all _showTip stores.
    el._tooltip = { marker: markerFor(ids[0]), x: 10, y: 10 };
    await el.updateComplete;
    return el;
  }

  it('survives a re-render that merely hands over equivalent data', async () => {
    // The aggregate loads configs asynchronously and re-renders when they
    // arrive, handing over fresh objects with identical contents.
    const el = await withTooltip([0, 1]);
    el.series = seriesOf([0, 1]);
    await el.updateComplete;
    expect(el._tooltip).not.toBeNull();
  });

  it('clears when its own point is gone', async () => {
    const el = await withTooltip([0, 1]);
    el.series = seriesOf([1, 2]);            // session 0 filtered out
    await el.updateComplete;
    expect(el._tooltip).toBeNull();
  });

  it('clears when the tooltip has no session to anchor to', async () => {
    const el = await withTooltip([0]);
    el._tooltip = { marker: { ...markerFor(0), sessionId: null }, x: 0, y: 0 };
    el.series = seriesOf([0]);
    await el.updateComplete;
    expect(el._tooltip).toBeNull();
  });
});
