// parse-pdf.js — extracts the embedded data.json envelope from a Madad PDF.
//
// Zero-dependency by design (TODO.md D-9): we only ever parse our own
// pdfmake/pdfkit output, whose structure is stable and known. Anything we
// cannot parse gets a typed per-file failure — never a crash — matching
// AGGREGATE_SPEC §5.7. If real-world PDFs rewritten by other tools start
// failing here, the escape hatch is swapping this module for a pdf-lib
// implementation; the contract below stays the same.
//
// How the attachment is found (see IMPLEMENTATION_SPEC §19.4a for the
// writer side):
//   1. A Filespec object binds the name (data.json) to an object ref:
//        << /Type /Filespec ... /F (data.json) /EF << /F 12 0 R >> ... >>
//   2. Object 12 is an EmbeddedFile stream, FlateDecode-compressed
//      (zlib format — pdfkit deflates all streams by default):
//        12 0 obj << /Type /EmbeddedFile /Filter /FlateDecode /Length N >>
//        stream ... endstream
//   3. Byte-level scanning is safe because PDF structure tokens are ASCII;
//      we decode the whole file as latin1 (1 char = 1 byte) for searching
//      and slice the untouched original bytes for stream data.

import { ENVELOPE_VERSION, validateEnvelope } from '../../shared/pdf/envelope-schema.js';

export const FAILURE = {
  NOT_PDF: 'not-pdf',                       // no %PDF header
  NO_ATTACHMENT: 'no-attachment',           // a PDF, but not one of ours
  UNSUPPORTED_VERSION: 'unsupported-version', // envelope newer than this build
  MALFORMED: 'malformed',                   // parse/shape error in the payload
};

const ATTACHMENT_NAME = 'data.json';

/**
 * Parse a File (or Blob) into its embedded envelope.
 * Never throws — all failures return `{ ok: false, reason, detail }`.
 *
 * @param {File} file
 * @returns {Promise<{ok: true, envelope: object} | {ok: false, reason: string, detail?: string}>}
 */
export async function parsePdfFile(file) {
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: FAILURE.MALFORMED, detail: 'file could not be read' };
  }
  return parsePdfBytes(bytes);
}

/**
 * Core parser, separated from the File wrapper for testability.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<{ok: true, envelope: object} | {ok: false, reason: string, detail?: string}>}
 */
export async function parsePdfBytes(bytes) {
  const raw = new TextDecoder('latin1').decode(bytes);

  if (!raw.startsWith('%PDF')) {
    return { ok: false, reason: FAILURE.NOT_PDF };
  }
  if (!raw.includes('/EmbeddedFiles')) {
    return { ok: false, reason: FAILURE.NO_ATTACHMENT };
  }

  const objNum = findAttachmentObjectNumber(raw);
  if (objNum === null) {
    return { ok: false, reason: FAILURE.NO_ATTACHMENT };
  }

  const stream = extractStream(raw, bytes, objNum);
  if (!stream) {
    return { ok: false, reason: FAILURE.MALFORMED, detail: `attachment object ${objNum} has no readable stream` };
  }

  let text;
  try {
    const data = stream.deflated ? await inflate(stream.data) : stream.data;
    text = new TextDecoder().decode(data);
  } catch {
    return { ok: false, reason: FAILURE.MALFORMED, detail: 'attachment stream could not be decompressed' };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, reason: FAILURE.MALFORMED, detail: 'attachment is not valid JSON' };
  }

  if (Number.isInteger(payload?.schemaVersion) && payload.schemaVersion > ENVELOPE_VERSION) {
    return {
      ok: false,
      reason: FAILURE.UNSUPPORTED_VERSION,
      detail: `envelope version ${payload.schemaVersion} (this build supports up to ${ENVELOPE_VERSION})`,
    };
  }

  const { valid, errors } = validateEnvelope(payload);
  if (!valid) {
    return { ok: false, reason: FAILURE.MALFORMED, detail: errors.join('; ') };
  }

  return { ok: true, envelope: payload };
}

// ── Locating the attachment ───────────────────────────────────────────────────

// Finds the object number of the EmbeddedFile stream bound to (data.json).
// Strategy: every `/EF << /F N 0 R >>` in the file is an embedded-file
// binding; prefer the one whose surrounding Filespec names data.json, and
// fall back to a sole binding regardless of name.
function findAttachmentObjectNumber(raw) {
  const bindings = [];
  const re = /\/EF\s*<<\s*\/F\s+(\d+)\s+0\s+R/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    // The Filespec dict opens shortly before /EF; a 300-char window is
    // generous (it only needs to span /Type /Filespec ... /F (name)).
    const windowStart = Math.max(0, m.index - 300);
    const window = raw.slice(windowStart, m.index);
    bindings.push({ objNum: Number(m[1]), named: window.includes(`(${ATTACHMENT_NAME})`) });
  }
  const named = bindings.find(b => b.named);
  if (named) return named.objNum;
  if (bindings.length === 1) return bindings[0].objNum;
  return null;
}

// ── Stream extraction ─────────────────────────────────────────────────────────

// Returns { data: Uint8Array, deflated: boolean } for the stream belonging
// to object `objNum`, or null when the object/stream cannot be located.
function extractStream(raw, bytes, objNum) {
  const objMatch = new RegExp(`(?:^|[\\r\\n])${objNum} 0 obj\\b`).exec(raw);
  if (!objMatch) return null;
  const objStart = objMatch.index;

  const streamKw = raw.indexOf('stream', objStart);
  if (streamKw === -1) return null;
  const dict = raw.slice(objStart, streamKw);

  // Stream data begins after the `stream` keyword and its EOL (\r\n or \n).
  let dataStart = streamKw + 'stream'.length;
  if (raw[dataStart] === '\r') dataStart++;
  if (raw[dataStart] === '\n') dataStart++;

  // Prefer the declared /Length (pdfkit writes it as a direct integer);
  // fall back to scanning for `endstream` when absent or indirect.
  let dataEnd = null;
  const lengthMatch = /\/Length\s+(\d+)(?!\s+0\s+R)/.exec(dict);
  if (lengthMatch) {
    dataEnd = dataStart + Number(lengthMatch[1]);
    if (dataEnd > bytes.length) dataEnd = null; // corrupt length — fall back
  }
  if (dataEnd === null) {
    const endKw = raw.indexOf('endstream', dataStart);
    if (endKw === -1) return null;
    dataEnd = endKw;
    // Trim the EOL that precedes `endstream`.
    if (raw[dataEnd - 1] === '\n') dataEnd--;
    if (raw[dataEnd - 1] === '\r') dataEnd--;
  }

  return {
    data: bytes.slice(dataStart, dataEnd),
    deflated: dict.includes('/FlateDecode'),
  };
}

// ── Inflate ───────────────────────────────────────────────────────────────────

// PDF FlateDecode is zlib format (RFC 1950), which is exactly what
// DecompressionStream('deflate') implements — browser-native, no library.
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
