// @vitest-environment happy-dom
import '../tests/setup-dom.js';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./components/item-select.js',       () => ({}));
vi.mock('./components/item-binary.js',       () => ({}));
vi.mock('./components/item-instructions.js', () => ({}));
vi.mock('./components/item-text.js',         () => ({}));
vi.mock('./components/item-slider.js',       () => ({}));
vi.mock('./components/item-multiselect.js',  () => ({}));
vi.mock('./components/app-shell.js',         () => ({}));
vi.mock('./components/progress-bar.js',      () => ({}));
vi.mock('./components/welcome-screen.js',    () => ({}));
vi.mock('./components/results-screen.js',    () => ({}));
vi.mock('./config/loader.js',       () => ({ loadConfig: vi.fn() }));
vi.mock('./resolve-items.js',       () => ({ resolveItems: vi.fn() }));
vi.mock('./controller.js',          () => ({ createController: vi.fn() }));
vi.mock('./engine/orchestrator.js', () => ({ createOrchestrator: vi.fn() }));
vi.mock('./router.js',              () => ({ createRouter: vi.fn() }));
vi.mock('./pdf/report.js',          () => ({ preloadPdf: vi.fn() }));

import { showLoading, showError, readPid } from './app.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanup(container) { container.remove(); }

// ─── showLoading ──────────────────────────────────────────────────────────────

describe('showLoading', () => {
  it('renders a status region for screen readers', () => {
    const c = makeContainer();
    showLoading(c);
    expect(c.querySelector('[role="status"]')).toBeTruthy();
    cleanup(c);
  });

  it('status region has an accessible label', () => {
    const c = makeContainer();
    showLoading(c);
    expect(c.querySelector('[role="status"]').getAttribute('aria-label')).toBeTruthy();
    cleanup(c);
  });

  it('uses the boot-screen layout class', () => {
    const c = makeContainer();
    showLoading(c);
    expect(c.querySelector('.boot-screen')).toBeTruthy();
    cleanup(c);
  });

  it('renders an SVG spinner hidden from assistive technology', () => {
    const c = makeContainer();
    showLoading(c);
    const svg = c.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    cleanup(c);
  });

  it('displays a loading message', () => {
    const c = makeContainer();
    showLoading(c);
    expect(c.querySelector('.boot-screen__message')).toBeTruthy();
    expect(c.textContent).toContain('טוען');
    cleanup(c);
  });

  it('replaces any previous container content', () => {
    const c = makeContainer();
    c.innerHTML = '<p class="old">stale</p>';
    showLoading(c);
    expect(c.querySelector('.old')).toBeNull();
    cleanup(c);
  });
});

// ─── showError ────────────────────────────────────────────────────────────────

describe('showError — base behaviour', () => {
  it('renders an alert region for screen readers', () => {
    const c = makeContainer();
    showError(c, 'שגיאה');
    expect(c.querySelector('[role="alert"]')).toBeTruthy();
    cleanup(c);
  });

  it('uses the boot-screen layout class', () => {
    const c = makeContainer();
    showError(c, 'שגיאה');
    expect(c.querySelector('.boot-screen')).toBeTruthy();
    cleanup(c);
  });

  it('displays the message in the title element', () => {
    const c = makeContainer();
    showError(c, 'הקישור שגוי');
    expect(c.querySelector('.boot-screen__title').textContent).toBe('הקישור שגוי');
    cleanup(c);
  });

  it('displays the detail text in the hint element', () => {
    const c = makeContainer();
    showError(c, 'שגיאה', 'פרטים נוספים');
    expect(c.querySelector('.boot-screen__hint').textContent).toBe('פרטים נוספים');
    cleanup(c);
  });

  it('falls back to a default hint when detail is omitted', () => {
    const c = makeContainer();
    showError(c, 'שגיאה');
    expect(c.querySelector('.boot-screen__hint').textContent.length).toBeGreaterThan(0);
    cleanup(c);
  });

  it('replaces any previous container content', () => {
    const c = makeContainer();
    c.innerHTML = '<p class="old">stale</p>';
    showError(c, 'שגיאה');
    expect(c.querySelector('.old')).toBeNull();
    cleanup(c);
  });

  it('renders message and detail as text, never as markup (XSS guard)', () => {
    const c = makeContainer();
    const payload = '<img src=x onerror=alert(1)>';
    showError(c, payload, payload);
    // The string must appear verbatim as text and must NOT create an element.
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('.boot-screen__title').textContent).toBe(payload);
    expect(c.querySelector('.boot-screen__hint').textContent).toBe(payload);
    cleanup(c);
  });
});

describe('showError — non-retryable (default)', () => {
  it('does not render a retry button by default', () => {
    const c = makeContainer();
    showError(c, 'הקישור שגוי');
    expect(c.querySelector('.boot-screen__retry')).toBeNull();
    cleanup(c);
  });

  it('does not render a retry button when retryable is explicitly false', () => {
    const c = makeContainer();
    showError(c, 'שגיאה', '', { retryable: false });
    expect(c.querySelector('.boot-screen__retry')).toBeNull();
    cleanup(c);
  });
});

describe('showError — retryable', () => {
  it('renders a retry button when retryable is true', () => {
    const c = makeContainer();
    showError(c, 'שגיאת רשת', '', { retryable: true });
    expect(c.querySelector('.boot-screen__retry')).toBeTruthy();
    cleanup(c);
  });

  it('retry button calls location.reload when clicked', () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { reload: reloadSpy });

    const c = makeContainer();
    showError(c, 'שגיאת רשת', '', { retryable: true });
    c.querySelector('.boot-screen__retry').click();
    expect(reloadSpy).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
    cleanup(c);
  });
});

// ─── readPid ────────────────────────────────────────────────────────────────────

describe('readPid — fragment/query precedence', () => {
  it('reads the pid from the URL fragment (new links)', () => {
    expect(readPid({ hash: '#pid=TRC-001', search: '' })).toBe('TRC-001');
  });

  it('falls back to the query string (legacy links)', () => {
    expect(readPid({ hash: '', search: '?items=phq9&pid=TRC-002' })).toBe('TRC-002');
  });

  it('prefers the fragment when both are present', () => {
    expect(readPid({ hash: '#pid=FROM-HASH', search: '?pid=FROM-QUERY' })).toBe('FROM-HASH');
  });

  it('decodes percent-encoded pids from the fragment', () => {
    expect(readPid({ hash: '#pid=a%20b', search: '' })).toBe('a b');
  });

  it('returns null when no pid is present anywhere', () => {
    expect(readPid({ hash: '#other=1', search: '?items=phq9' })).toBeNull();
  });
});

