// Tests for the generateReport() public entry point.
//
// generateReport() requires pdfmake to be loaded. We mock the dynamic import
// of pdfmake at the module level so the full pipeline can be tested without a
// browser or real font files. Everything else (buildDocDefinition, toBase64,
// the preload state machine) runs for real.
//
// vi.mock hoisting: Vitest hoists vi.mock() calls to the top of the file so
// they intercept the import('pdfmake/build/pdfmake') inside _load() even
// though the import appears after the mock declaration in source order.

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// ── Mock pdfmake ──────────────────────────────────────────────────────────────
// The fake pdfmake records calls and returns a buffer from createPdf().getBuffer().

vi.mock('pdfmake/build/pdfmake', () => {
  const fakePdfmake = {
    addVirtualFileSystem: vi.fn(),
    addFonts:             vi.fn(),
    createPdf: vi.fn(() => ({
      getBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer),
      // 0x25504446 = "%PDF" — minimal realistic header
    })),
  };
  return { default: fakePdfmake };
});

// ── Mock font fetches ─────────────────────────────────────────────────────────
// report.js fetches font files via fetch(). Return minimal ArrayBuffers.
const FAKE_FONT_BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => FAKE_FONT_BYTES,
}));

import {
  generateReport,
  _resetPreloadStateOnly,
  initBidiForTesting,
  PdfGenerationError,
} from './report.js';

beforeAll(async () => {
  await initBidiForTesting();
});

afterEach(async () => {
  await Promise.resolve(); // flush microtasks
  _resetPreloadStateOnly(); // preserves _bidi — avoids re-importing bidi-js each test
  vi.clearAllMocks();
  // Re-stub fetch after clearAllMocks clears it
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => FAKE_FONT_BYTES,
  }));
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_STATE = {
  answers: { phq9: { '1': 0, '2': 1 } },
  scores:  { phq9: { total: 1, subscales: {}, category: null } },
  alerts:  { phq9: [] },
};

const CONFIG = {
  questionnaires: [{
    id: 'phq9',
    title: 'PHQ-9',
    defaultOptionSetId: 'freq',
    optionSets: { freq: [{ label: 'כלל לא', value: 0 }, { label: 'כמה ימים', value: 1 }] },
    items: [
      { id: '1', type: 'select', text: 'שאלה 1' },
      { id: '2', type: 'select', text: 'שאלה 2' },
    ],
    scoring: { method: 'sum' },
    alerts: [],
  }],
  batteries: [],
};

const SESSION = { name: 'ישראל', pid: 'T-001' };

// ── generateReport — return shape ─────────────────────────────────────────────

describe('generateReport — return shape', () => {
  it('returns an object with blob and filename properties', async () => {
    const result = await generateReport(SESSION_STATE, CONFIG, SESSION);
    expect(result).toHaveProperty('blob');
    expect(result).toHaveProperty('filename');
  });

  it('blob is a Blob instance with type application/pdf', async () => {
    const { blob } = await generateReport(SESSION_STATE, CONFIG, SESSION);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('blob is non-empty', async () => {
    const { blob } = await generateReport(SESSION_STATE, CONFIG, SESSION);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('filename matches buildFilename output for the given session', async () => {
    const { filename } = await generateReport(SESSION_STATE, CONFIG, SESSION);
    // buildFilename uses new Date() inside generateReport; we just verify shape
    expect(filename).toMatch(/^report-T-001-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('filename omits pid segment when session has no pid', async () => {
    const { filename } = await generateReport(SESSION_STATE, CONFIG, { name: 'ישראל' });
    expect(filename).toMatch(/^report-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(filename).not.toContain('undefined');
  });
});

// ── generateReport — pdfmake API wiring ───────────────────────────────────────

describe('generateReport — pdfmake API wiring', () => {
  it('calls pdfmake.addVirtualFileSystem with both font keys', async () => {
    const { default: pdfmake } = await import('pdfmake/build/pdfmake');
    await generateReport(SESSION_STATE, CONFIG, SESSION);
    expect(pdfmake.addVirtualFileSystem).toHaveBeenCalledOnce();
    const vfs = pdfmake.addVirtualFileSystem.mock.calls[0][0];
    expect(vfs).toHaveProperty('NotoSansHebrew-Regular.ttf');
    expect(vfs).toHaveProperty('NotoSansHebrew-Bold.ttf');
  });

  it('calls pdfmake.createPdf with a document definition object', async () => {
    const { default: pdfmake } = await import('pdfmake/build/pdfmake');
    await generateReport(SESSION_STATE, CONFIG, SESSION);
    expect(pdfmake.createPdf).toHaveBeenCalledOnce();
    const docDef = pdfmake.createPdf.mock.calls[0][0];
    expect(docDef).toHaveProperty('content');
    expect(docDef).toHaveProperty('pageSize', 'A4');
  });

  it('passes font ArrayBuffers from fetch through toBase64 into the VFS', async () => {
    const { default: pdfmake } = await import('pdfmake/build/pdfmake');
    await generateReport(SESSION_STATE, CONFIG, SESSION);
    const vfs = pdfmake.addVirtualFileSystem.mock.calls[0][0];
    // The VFS values should be Base64 strings (not raw bytes)
    expect(typeof vfs['NotoSansHebrew-Regular.ttf']).toBe('string');
    expect(typeof vfs['NotoSansHebrew-Bold.ttf']).toBe('string');
  });
});

// ── generateReport — error path ───────────────────────────────────────────────

describe('generateReport — error path', () => {
  it('throws PdfGenerationError when font fetch fails on both attempts', async () => {
    // Override fetch to always reject
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(generateReport(SESSION_STATE, CONFIG, SESSION))
      .rejects.toBeInstanceOf(PdfGenerationError);

    warnSpy.mockRestore();
  });
});
