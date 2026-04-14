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

describe('PDF error state', () => {
  it('shows error message when download fails', async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error('network'));
    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });

    el.shadowRoot.querySelector('.pdf-btn').click();
    await el.updateComplete;
    // Wait for the async handler to complete
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.pdf-error')).not.toBeNull();
  });

  it('error message is in Hebrew', async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error('network'));
    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });

    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    const msg = el.shadowRoot.querySelector('.pdf-error__msg');
    expect(msg).not.toBeNull();
    // Message must contain Hebrew characters
    expect(/[\u0590-\u05FF]/.test(msg.textContent)).toBe(true);
  });

  it('shows retry button after download failure', async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error('network'));
    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });

    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    // In error state, there is one button — the retry button
    const btn = el.shadowRoot.querySelector('.pdf-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent.trim()).toContain('נסה');
  });

  it('retry button invokes the original handler again', async () => {
    let callCount = 0;
    const onDownload = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('first fail'));
      return Promise.resolve();
    });
    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });

    // First click — fails
    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.pdf-error')).not.toBeNull();

    // Retry click — succeeds
    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    expect(onDownload).toHaveBeenCalledTimes(2);
    // Error cleared on success
    expect(el.shadowRoot.querySelector('.pdf-error')).toBeNull();
  });

  it('error state clears when a new attempt begins', async () => {
    const onDownload = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(undefined);

    const el = await makeEl({ results: sampleResults, canShare: false, onDownload });

    // Trigger failure
    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.pdf-error')).not.toBeNull();

    // Trigger retry — succeeds — error gone
    el.shadowRoot.querySelector('.pdf-btn').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.pdf-error')).toBeNull();
  });

  it('shows error after share failure too', async () => {
    const onShare = vi.fn().mockRejectedValue(new Error('share failed'));
    const el = await makeEl({ results: sampleResults, canShare: true, onShare });

    el.shadowRoot.querySelector('.pdf-btn--primary').click();
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.pdf-error')).not.toBeNull();
  });

  it('does not show error when no failure has occurred', async () => {
    const el = await makeEl({ results: sampleResults, canShare: false });
    expect(el.shadowRoot.querySelector('.pdf-error')).toBeNull();
  });
});
