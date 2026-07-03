// Tests for parse-pdf.js — the zero-dep envelope extractor.
//
// Fixtures are synthetic PDFs built byte-for-byte in the shape pdfkit
// emits (Filespec + FlateDecode EmbeddedFile stream + EmbeddedFiles name
// tree). Compression uses node's zlib (same zlib format pdfkit writes).
// The full-fidelity check against a *real* pdfmake PDF is the e2e
// round-trip test (patient flow → download → aggregate upload).

import { describe, it, expect } from 'vitest';
import { deflateSync } from 'zlib';
import { parsePdfBytes, parsePdfFile, FAILURE } from './parse-pdf.js';
import { buildEnvelope, ENVELOPE_VERSION } from '../../shared/pdf/envelope-schema.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONFIG = {
  questionnaires: [{ id: 'phq9', title: 'שאלון דיכאון (PHQ-9)', configFile: 'standard' }],
};

function makeEnvelope(overrides = {}) {
  const env = buildEnvelope({
    sessionState: {
      answers: { phq9: { q1: 2 } },
      scores:  { phq9: { total: 12, category: 'בינוני' } },
      alerts:  {},
      questionnaireIds: { phq9: 'phq9' },
    },
    config: CONFIG,
    session: { pid: 'P001', name: 'ישראל' },
    appVersion: '1.0.0',
    now: new Date('2026-07-03T10:00:00Z'),
  });
  return { ...env, ...overrides };
}

const latin1 = (s) => Buffer.from(s, 'latin1');

/**
 * Builds a minimal synthetic PDF with an embedded file, mirroring pdfkit's
 * output shape. Options poke at individual structural variations.
 */
function buildPdf(payload, {
  compress = true,
  name = 'data.json',
  withLength = true,
  crlf = false,
  truncateStream = false,
} = {}) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  let data = compress ? deflateSync(json) : json;
  if (truncateStream) data = data.subarray(0, Math.floor(data.length / 2));

  const eol = crlf ? '\r\n' : '\n';
  const filter = compress ? ' /Filter /FlateDecode' : '';
  const length = withLength ? ` /Length ${data.length}` : '';

  return Buffer.concat([
    latin1(`%PDF-1.3${eol}`),
    latin1(`12 0 obj${eol}<< /Type /EmbeddedFile${filter}${length} >>${eol}stream${eol}`),
    data,
    latin1(`${eol}endstream${eol}endobj${eol}`),
    latin1(`13 0 obj${eol}<< /Type /Filespec /AFRelationship /Unspecified /F (${name}) /EF << /F 12 0 R >> /UF (${name}) >>${eol}endobj${eol}`),
    latin1(`14 0 obj${eol}<< /Names << /EmbeddedFiles << /Names [(${name}) 13 0 R] >> >> >>${eol}endobj${eol}`),
    latin1(`%%EOF${eol}`),
  ]);
}

// ── Happy paths ───────────────────────────────────────────────────────────────

describe('parsePdfBytes — happy paths', () => {
  it('extracts a compressed envelope and preserves Hebrew content', async () => {
    const envelope = makeEnvelope();
    const res = await parsePdfBytes(buildPdf(envelope));
    expect(res.ok).toBe(true);
    expect(res.envelope).toEqual(envelope);
    expect(res.envelope.name).toBe('ישראל');
    expect(res.envelope.instruments[0].title).toBe('שאלון דיכאון (PHQ-9)');
  });

  it('extracts an uncompressed stream (no /Filter)', async () => {
    const envelope = makeEnvelope();
    const res = await parsePdfBytes(buildPdf(envelope, { compress: false }));
    expect(res.ok).toBe(true);
    expect(res.envelope).toEqual(envelope);
  });

  it('falls back to endstream scanning when /Length is absent', async () => {
    const envelope = makeEnvelope();
    const res = await parsePdfBytes(buildPdf(envelope, { withLength: false }));
    expect(res.ok).toBe(true);
    expect(res.envelope).toEqual(envelope);
  });

  it('handles CRLF line endings', async () => {
    const envelope = makeEnvelope();
    const res = await parsePdfBytes(buildPdf(envelope, { crlf: true }));
    expect(res.ok).toBe(true);
    expect(res.envelope).toEqual(envelope);
  });

  it('accepts a sole unnamed embedded file (name other than data.json)', async () => {
    const envelope = makeEnvelope();
    const res = await parsePdfBytes(buildPdf(envelope, { name: 'other.json' }));
    expect(res.ok).toBe(true);
  });

  it('parsePdfFile wraps a File', async () => {
    const envelope = makeEnvelope();
    const file = new File([buildPdf(envelope)], 'report-P001.pdf', { type: 'application/pdf' });
    const res = await parsePdfFile(file);
    expect(res.ok).toBe(true);
    expect(res.envelope.pid).toBe('P001');
  });
});

// ── Failure modes (AGGREGATE_SPEC §5.7) ───────────────────────────────────────

describe('parsePdfBytes — failure modes', () => {
  it('rejects non-PDF bytes as not-pdf', async () => {
    const res = await parsePdfBytes(new Uint8Array(Buffer.from('hello, not a pdf')));
    expect(res).toEqual({ ok: false, reason: FAILURE.NOT_PDF });
  });

  it('rejects a PDF without embedded files as no-attachment', async () => {
    const res = await parsePdfBytes(new Uint8Array(latin1('%PDF-1.3\n1 0 obj\n<< >>\nendobj\n%%EOF')));
    expect(res).toEqual({ ok: false, reason: FAILURE.NO_ATTACHMENT });
  });

  it('rejects an envelope from a newer build as unsupported-version', async () => {
    const res = await parsePdfBytes(buildPdf(makeEnvelope({ schemaVersion: ENVELOPE_VERSION + 1 })));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(FAILURE.UNSUPPORTED_VERSION);
    expect(res.detail).toContain(String(ENVELOPE_VERSION + 1));
  });

  it('rejects a truncated (undecompressable) stream as malformed', async () => {
    const res = await parsePdfBytes(buildPdf(makeEnvelope(), { truncateStream: true }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(FAILURE.MALFORMED);
  });

  it('rejects invalid JSON as malformed', async () => {
    const json = Buffer.from('{ not json', 'utf8');
    const pdf = buildPdf({}, { compress: false });
    // splice bad content in place of the valid one via a rebuilt fixture
    const raw = pdf.toString('latin1').replace('{}', json.toString('latin1'));
    const res = await parsePdfBytes(new Uint8Array(latin1(raw.replace(/\/Length \d+/, `/Length ${json.length}`))));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(FAILURE.MALFORMED);
  });

  it('rejects a structurally invalid envelope as malformed, with detail', async () => {
    const res = await parsePdfBytes(buildPdf({ schemaVersion: 1, generatedAt: 'not a date', instruments: [], sessionState: {} }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(FAILURE.MALFORMED);
    expect(res.detail).toContain('generatedAt');
  });

  it('never throws on arbitrary binary garbage', async () => {
    const garbage = new Uint8Array(2048).map(() => Math.floor(Math.random() * 256));
    const res = await parsePdfBytes(garbage);
    expect(res.ok).toBe(false);
  });
});
