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
vi.mock('./components/completion-screen.js', () => ({}));
vi.mock('./components/results-screen.js',    () => ({}));
vi.mock('./config/loader.js',       () => ({ loadConfig: vi.fn() }));
vi.mock('./resolve-items.js',       () => ({ resolveItems: vi.fn() }));
vi.mock('./controller.js',          () => ({ createController: vi.fn() }));
vi.mock('./engine/orchestrator.js', () => ({ createOrchestrator: vi.fn() }));
vi.mock('./router.js',              () => ({ createRouter: vi.fn() }));
vi.mock('./pdf/report.js',          () => ({ preloadPdf: vi.fn() }));

import { showLoading, showError, findMissingDependencies } from './app.js';

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

// ─── findMissingDependencies ──────────────────────────────────────────────────
// Tests the exported pure function that main() delegates to for dependency
// validation. Each test calls the real app.js code — no inline logic copies.

describe('findMissingDependencies', () => {
  it('returns missing dependency when it is absent from configSources', () => {
    const result = findMissingDependencies(
      ['configs/prod/intake.json'],
      ['configs/prod/trauma.json'],
    );
    expect(result).toEqual(['configs/prod/trauma.json']);
  });

  it('returns empty array when all dependencies are present in configSources', () => {
    const result = findMissingDependencies(
      ['configs/prod/intake.json', 'configs/prod/trauma.json', 'configs/prod/standard.json'],
      ['configs/prod/standard.json', 'configs/prod/trauma.json'],
    );
    expect(result).toHaveLength(0);
  });

  it('normalises a leading slash before comparing', () => {
    // URL may supply /configs/prod/trauma.json (absolute) while the dependency
    // is declared as configs/prod/trauma.json (relative) — must match.
    const result = findMissingDependencies(
      ['/configs/prod/intake.json', '/configs/prod/trauma.json'],
      ['configs/prod/trauma.json'],
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty array when dependencies array is empty', () => {
    const result = findMissingDependencies(['configs/prod/standard.json'], []);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when dependencies is null or undefined', () => {
    expect(findMissingDependencies(['configs/prod/standard.json'], null)).toHaveLength(0);
    expect(findMissingDependencies(['configs/prod/standard.json'], undefined)).toHaveLength(0);
  });

  it('detects multiple missing dependencies', () => {
    const result = findMissingDependencies(
      ['configs/prod/intake.json'],
      ['configs/prod/trauma.json', 'configs/prod/standard.json'],
    );
    expect(result).toHaveLength(2);
    expect(result).toContain('configs/prod/trauma.json');
    expect(result).toContain('configs/prod/standard.json');
  });
});
