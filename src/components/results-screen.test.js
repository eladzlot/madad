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

describe('action buttons — no share (desktop)', () => {
  it('renders exactly one button when canShare is false', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(el.shadowRoot.querySelectorAll('.pdf-btn')).toHaveLength(1);
  });

  it('single button is primary', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(el.shadowRoot.querySelector('.pdf-btn').classList.contains('pdf-btn--primary')).toBe(true);
  });

  it('single button shows download label', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(el.shadowRoot.querySelector('.pdf-btn').textContent.trim()).toContain('הורד');
  });

  it('single button is enabled by default', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(el.shadowRoot.querySelector('.pdf-btn').disabled).toBe(false);
  });

  it('single button is disabled while loading', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn').disabled).toBe(true);
  });

  it('shows loading label while loading', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn').textContent.trim()).toContain('מכין');
  });

  it('calls onDownload when clicked', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });
    el.shadowRoot.querySelector('.pdf-btn').click();
    await el.updateComplete;
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('does not throw when clicked with no onDownload set', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(() => el.shadowRoot.querySelector('.pdf-btn').click()).not.toThrow();
  });
});

describe('action buttons — with share (mobile)', () => {
  it('renders two buttons when canShare is true', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true });
    expect(el.shadowRoot.querySelectorAll('.pdf-btn')).toHaveLength(2);
  });

  it('primary button shows share label', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true });
    expect(el.shadowRoot.querySelector('.pdf-btn--primary').textContent.trim()).toContain('שתף');
  });

  it('secondary button shows download label', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true });
    expect(el.shadowRoot.querySelector('.pdf-btn--secondary').textContent.trim()).toContain('הורד');
  });

  it('both buttons disabled while loading', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true, loading: true });
    const btns = el.shadowRoot.querySelectorAll('.pdf-btn');
    expect([...btns].every(b => b.disabled)).toBe(true);
  });

  it('primary button calls onShare', async () => {
    const onShare = vi.fn().mockResolvedValue(undefined);
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const el = await makeEl({ results: sampleResults, canShare: true, onShare, onDownload });
    el.shadowRoot.querySelector('.pdf-btn--primary').click();
    await el.updateComplete;
    expect(onShare).toHaveBeenCalledOnce();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('secondary button calls onDownload', async () => {
    const onShare = vi.fn().mockResolvedValue(undefined);
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const el = await makeEl({ results: sampleResults, canShare: true, onShare, onDownload });
    el.shadowRoot.querySelector('.pdf-btn--secondary').click();
    await el.updateComplete;
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onShare).not.toHaveBeenCalled();
  });

  it('primary shows loading label while loading', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn--primary').textContent.trim()).toContain('מכין');
  });

  it('secondary always shows download label regardless of loading', async () => {
    const el = await makeEl({ results: sampleResults, canShare: true, loading: true });
    expect(el.shadowRoot.querySelector('.pdf-btn--secondary').textContent.trim()).toContain('הורד');
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
