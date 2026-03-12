// @vitest-environment happy-dom
import '../../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';
import { fixture, html as testHtml } from '@open-wc/testing';
import './results-screen.js';

const sampleResults = [
  { title: 'PHQ-9', total: 12 },
  { title: 'PCL-5', total: 38 },
];

async function makeEl(props = {}) {
  const el = await fixture(testHtml`<results-screen></results-screen>`);
  Object.assign(el, props);
  await el.updateComplete;
  return el;
}

describe('rendering', () => {
  it('renders a title', async () => {
    const el = await makeEl();
    expect(el.shadowRoot.querySelector('.title').textContent).toContain('תוצאות');
  });

  it('renders one row per result', async () => {
    const el = await makeEl({ results: sampleResults });
    expect(el.shadowRoot.querySelectorAll('.score-row')).toHaveLength(2);
  });

  it('renders questionnaire name in each row', async () => {
    const el = await makeEl({ results: sampleResults });
    const names = [...el.shadowRoot.querySelectorAll('.score-name')]
      .map(n => n.textContent.trim());
    expect(names).toContain('PHQ-9');
    expect(names).toContain('PCL-5');
  });

  it('renders numeric score when total is a number', async () => {
    const el = await makeEl({ results: [{ title: 'PHQ-9', total: 12 }] });
    expect(el.shadowRoot.querySelector('.score-value').textContent.trim()).toBe('12');
  });

  it('renders em dash when total is null', async () => {
    const el = await makeEl({ results: [{ title: 'PHQ-9', total: null }] });
    expect(el.shadowRoot.querySelector('.score-value').textContent.trim()).toBe('—');
  });

  it('applies no-score class when total is null', async () => {
    const el = await makeEl({ results: [{ title: 'PHQ-9', total: null }] });
    expect(el.shadowRoot.querySelector('.score-value').classList.contains('no-score')).toBe(true);
  });

  it('does not apply no-score class when total is a number', async () => {
    const el = await makeEl({ results: [{ title: 'PHQ-9', total: 5 }] });
    expect(el.shadowRoot.querySelector('.score-value').classList.contains('no-score')).toBe(false);
  });

  it('renders no rows when results is empty', async () => {
    const el = await makeEl({ results: [] });
    expect(el.shadowRoot.querySelectorAll('.score-row')).toHaveLength(0);
  });
});

describe('pdf button', () => {
  it('renders a pdf button', async () => {
    const el = await makeEl({ results: sampleResults });
    expect(el.shadowRoot.querySelector('.pdf-btn')).toBeTruthy();
  });

  it('pdf button is enabled by default', async () => {
    const el = await makeEl({ results: sampleResults });
    expect(el.shadowRoot.querySelector('.pdf-btn').disabled).toBe(false);
  });

  it('pdf button is disabled while loading', async () => {
    const el = await makeEl({ results: sampleResults, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn').disabled).toBe(true);
  });

  it('shows loading label while loading', async () => {
    const el = await makeEl({ results: sampleResults, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn').textContent.trim()).toContain('מכין');
  });

  it('shows download label when not loading', async () => {
    const el = await makeEl({ results: sampleResults });
    expect(el.shadowRoot.querySelector('.pdf-btn').textContent.trim()).toContain('PDF');
  });

  it('calls onDownload when clicked', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const el = await makeEl({ results: sampleResults });
    el.onDownload = onDownload;
    await el.updateComplete;
    el.shadowRoot.querySelector('.pdf-btn').click();
    await el.updateComplete;
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('does not throw when clicked with no onDownload set', async () => {
    const el = await makeEl({ results: sampleResults });
    expect(() => el.shadowRoot.querySelector('.pdf-btn').click()).not.toThrow();
  });
});

describe('reactivity', () => {
  it('updates rows when results change', async () => {
    const el = await makeEl({ results: sampleResults });
    el.results = [{ title: 'OCI-R', total: 22 }];
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.score-row')).toHaveLength(1);
    expect(el.shadowRoot.querySelector('.score-name').textContent.trim()).toBe('OCI-R');
  });
});
