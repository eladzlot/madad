// pid.js
// Single source of truth for patient-identifier validation.
//
// Used by both:
//   - the patient app (src/app.js) — sanitises the URL parameter
//   - the composer (composer/src/composer-state.js) — warns the clinician
//
// Rules (kept identical across both surfaces):
//   - allowed characters: ASCII letters/digits, Hebrew letters, hyphen, underscore
//   - length: 1-64 characters
//   - empty string: not a PID, no warning
//
// Public API:
//   PID_PATTERN     — RegExp matching valid PID strings (1-64 chars)
//   sanitizePid(raw) → string | null
//                     Returns the PID if valid, null otherwise.
//                     Use this when reading from an untrusted URL parameter.
//   pidWarning(raw) → string | null
//                     Returns a Hebrew warning message if the PID is non-empty
//                     but invalid; null otherwise. Use this for live UI feedback.

export const PID_PATTERN = /^[a-zA-Z0-9\u0590-\u05FF_-]{1,64}$/;

export function sanitizePid(raw) {
  if (!raw) return null;
  return PID_PATTERN.test(raw) ? raw : null;
}

export function pidWarning(raw) {
  if (!raw) return null;
  if (!PID_PATTERN.test(raw)) {
    if (raw.length > 64) {
      return 'המזהה ארוך מדי. הגבל ל-64 תווים.';
    }
    return 'המזהה מכיל תווים לא מומלצים. השתמש באותיות, ספרות, מקף או קו תחתון.';
  }
  return null;
}
