// Tests for export-svg.js — the standalone export image (AGGREGATE_SPEC §6).
// The spec's content contract is clinical-privacy-relevant and pinned hard:
// title/date-range/timestamp/footer always present, pid strictly opt-in,
// patient name never representable (the builder has no name input).
import { describe, it, expect } from 'vitest';
import { buildExportSvg, exportFilename, uniquePid, EXPORT_DIMS } from './export-svg.js';

const D = (iso) => new Date(iso);

function series(points, extra = {}) {
  return { questionnaireId: 'phq9', title: 'שאלון דיכאון (PHQ-9)', points, ...extra };
}

function pts(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({
    date: D(`2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    total: i + 2,
    subscales: {},
    alerts: [],
    pid: 'TRC-001',
    ...extra,
  }));
}

const NOW = D('2026-07-05T12:30:00Z');

describe('buildExportSvg — always-on content (§6)', () => {
  it('contains title, date range, generation timestamp, and the מדד footer', () => {
    const { svg } = buildExportSvg({ series: series(pts(3)), now: NOW });
    expect(svg).toContain('שאלון דיכאון (PHQ-9)');
    // Date range: first – last session (he-IL day.month.year).
    expect(svg).toContain('1.3.2026');
    expect(svg).toContain('3.3.2026');
    expect(svg).toContain('הופק');
    expect(svg).toContain('5.7.2026');
    expect(svg).toContain('מדד');
  });

  it('a single session shows a single date, not a range', () => {
    const { svg } = buildExportSvg({ series: series(pts(1)), now: NOW });
    expect(svg).toContain('1.3.2026');
    expect(svg).not.toContain('–');
  });

  it('is a self-contained SVG document at the spec dimensions (800×500 logical)', () => {
    const { svg, width, height } = buildExportSvg({ series: series(pts(2)), now: NOW });
    expect(width).toBe(EXPORT_DIMS.width);
    expect(height).toBe(EXPORT_DIMS.height);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    // Opaque background — a transparent PNG is unreadable in dark viewers.
    expect(svg).toContain('fill="#ffffff"');
    // Self-contained: no CSS custom properties, no external references.
    expect(svg).not.toContain('var(');
    expect(svg).not.toContain('href');
  });
});

describe('buildExportSvg — pid is opt-in (§6)', () => {
  it('omits pid by default', () => {
    const { svg } = buildExportSvg({ series: series(pts(3)), now: NOW });
    expect(svg).not.toContain('TRC-001');
    expect(svg).not.toContain('מזהה');
  });

  it('stamps pid only when explicitly passed', () => {
    const { svg } = buildExportSvg({ series: series(pts(3)), pid: 'TRC-001', now: NOW });
    expect(svg).toContain('מזהה: TRC-001');
  });
});

describe('buildExportSvg — chart content', () => {
  it('renders one marker per session and a connecting line', () => {
    const { svg } = buildExportSvg({ series: series(pts(4)), now: NOW });
    expect(svg.match(/class="marker"/g)).toHaveLength(4);
    expect(svg).toContain('<path d="M ');
  });

  it('a single session renders a marker with no line (§5.4)', () => {
    const { svg } = buildExportSvg({ series: series(pts(1)), now: NOW });
    expect(svg.match(/class="marker"/g)).toHaveLength(1);
    expect(svg).not.toContain('<path');
  });

  it('renders severity bands and cutoff lines from the questionnaire config', () => {
    const { svg } = buildExportSvg({
      series: series(pts(2)),
      questionnaire: {
        interpretations: {
          type: 'severity',
          ranges: [{ min: 0, max: 9, label: 'קל' }, { min: 10, max: 27, label: 'חמור' }],
          cutoffs: [{ value: 10, label: 'סף קליני' }],
        },
      },
      now: NOW,
    });
    expect(svg).toContain('קל');
    expect(svg).toContain('חמור');
    expect(svg).toContain('סף קליני');
    expect(svg).toContain('stroke="#b45309"');   // cutoff line
  });

  it('marks alert sessions with an alert ring', () => {
    const { svg } = buildExportSvg({
      series: series(pts(1, { alerts: [{ message: 'התראה', severity: 'critical' }] })),
      now: NOW,
    });
    expect(svg).toContain('r="8.5"');
  });

  it('escapes markup in text content', () => {
    const { svg } = buildExportSvg({
      series: series(pts(1), { title: 'a <b> & "c"' }),
      now: NOW,
    });
    expect(svg).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).not.toContain('<b>');
  });
});

describe('exportFilename', () => {
  it('builds madad-{id}-{yyyy-mm-dd}.{ext}', () => {
    expect(exportFilename('phq9', D('2026-07-05T12:00:00'), 'png')).toBe('madad-phq9-2026-07-05.png');
    expect(exportFilename('gad7', D('2026-01-09T12:00:00'), 'svg')).toBe('madad-gad7-2026-01-09.svg');
  });
});

describe('uniquePid', () => {
  it('returns the pid shared by every point', () => {
    expect(uniquePid(pts(3))).toBe('TRC-001');
  });

  it('returns null for mixed pids — one id must not label another patient\'s data', () => {
    const mixed = [...pts(2), ...pts(1, { pid: 'TRC-002' })];
    expect(uniquePid(mixed)).toBeNull();
  });

  it('returns null when any point is unidentified, or all are', () => {
    expect(uniquePid([...pts(2), ...pts(1, { pid: null })])).toBeNull();
    expect(uniquePid(pts(2, { pid: null }))).toBeNull();
    expect(uniquePid([])).toBeNull();
  });
});
