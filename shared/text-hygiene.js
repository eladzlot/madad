// text-hygiene.js
// Shared cleanup for free-text that reaches a rendered surface — the PDF, the
// Aggregate charts, an exported SVG.
//
// Used by:
//   - the write path (src/components/welcome-screen.js) — the name the patient
//     types, before it enters the PDF
//   - the read path (shared/pdf/envelope-schema.js) — the name and pid carried
//     by an uploaded PDF, before they enter the Aggregate surface
//
// Both paths need the same treatment for the same reason, so the rules live
// here rather than being written twice and drifting apart.

// Unicode BiDi control characters: LRM/RLM, the embedding/override set, and
// the isolate set. In a right-to-left document these reorder the glyphs around
// them, so a string carrying them can render as something other than what it
// contains — a name or patient id that reads differently than it is stored.
// Neither pdfmake nor an exported SVG resolves them the way a browser does, so
// strip rather than escape: nothing legitimate in a name or id needs them.
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/g;

export const MAX_NAME_LENGTH = 200;
export const MAX_PID_LENGTH = 64;   // matches PID_PATTERN in shared/pid.js

export function stripBidi(s) {
  return typeof s === 'string' ? s.replace(BIDI_CONTROLS, '') : s;
}

// Cleans a display string: strips BiDi controls and caps the length.
// Returns null for anything that is not a string, so callers can treat
// "absent" and "unusable" alike.
export function cleanText(s, maxLength) {
  if (typeof s !== 'string') return null;
  return stripBidi(s).slice(0, maxLength);
}
