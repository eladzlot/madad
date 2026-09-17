// uid.js — the patient identifier on the remote deployment (REMOTE_SPEC §3).
//
// One uid = one patient under one therapist. It is minted by the operator,
// handed to the therapist, typed into the composer, carried in the patient
// link (`#pid=`), stored as `envelope.pid`, and looked up in the server
// registry. It is the ONLY patient key anywhere in the system, so the same
// rules must hold on every surface — this module is shared by the composer,
// the patient app, the server functions and the minting script.
//
// Format: 8 symbols of Crockford base32, displayed as XXXX-XXXX.
//   • symbols 1–7 are random (35 bits)
//   • symbol 8 is a check symbol: alphabet[(Σ wᵢ·vᵢ) mod 32] with odd
//     weights, so every single-symbol error is caught and adjacent
//     transpositions are caught unless the two symbols differ by exactly 16
//   • input is normalised before use: uppercase, hyphens/spaces dropped,
//     I/L → 1 and O → 0 (Crockford's hand-copy tolerance)
//
// 35 bits is a deliberate trade against hand-copy ergonomics; unguessability
// comes from registry sparsity plus server rate limiting (spec §7).

export const UID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const UID_BODY_LENGTH = 7;
export const UID_LENGTH = UID_BODY_LENGTH + 1;

const WEIGHTS = [1, 3, 5, 7, 9, 11, 13];
const SYMBOL_VALUE = new Map([...UID_ALPHABET].map((c, i) => [c, i]));

// Loose shape check for input fields — "looks like a uid" — before the check
// symbol is consulted. Accepts the optional hyphen and lowercase.
export const UID_PATTERN = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{4}-?[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{4}$/;

/** Uppercase, strip separators, fold the ambiguous glyphs. Never throws. */
export function normalizeUid(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/** The check symbol for a 7-symbol normalised body. */
export function checkSymbol(body) {
  let sum = 0;
  for (let i = 0; i < UID_BODY_LENGTH; i++) {
    sum += WEIGHTS[i] * SYMBOL_VALUE.get(body[i]);
  }
  return UID_ALPHABET[sum % UID_ALPHABET.length];
}

/** True when `raw` normalises to 8 alphabet symbols whose check symbol holds. */
export function isValidUid(raw) {
  const n = normalizeUid(raw);
  if (n.length !== UID_LENGTH) return false;
  for (const c of n) if (!SYMBOL_VALUE.has(c)) return false;
  return checkSymbol(n.slice(0, UID_BODY_LENGTH)) === n[UID_BODY_LENGTH];
}

/**
 * Canonical display form, XXXX-XXXX. Returns null for anything that is not
 * a valid uid, so callers can use it as "validate and canonicalise" in one
 * step.
 */
export function formatUid(raw) {
  if (!isValidUid(raw)) return null;
  const n = normalizeUid(raw);
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}

/**
 * Mint a fresh uid. `randomBytes(n)` must return n uniformly random bytes;
 * defaults to WebCrypto (browsers and node ≥ 19). Rejection sampling keeps
 * the symbol distribution uniform (256 is not a multiple of 32 — it is, but
 * the mask makes that explicit rather than relying on it).
 */
export function generateUid(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(UID_BODY_LENGTH);
  let body = '';
  for (let i = 0; i < UID_BODY_LENGTH; i++) body += UID_ALPHABET[bytes[i] & 31];
  return formatUid(body + checkSymbol(body));
}

function defaultRandomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * Live feedback for the composer's uid field. Empty → no message (the field
 * is simply not yet filled); otherwise a Hebrew explanation of what is wrong.
 */
export function uidWarning(raw) {
  if (!raw || !raw.trim()) return null;
  const n = normalizeUid(raw);
  if (n.length !== UID_LENGTH || [...n].some(c => !SYMBOL_VALUE.has(c))) return 'shape';
  if (!isValidUid(n)) return 'checksum';
  return null;
}
