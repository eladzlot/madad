// translation-parity.js — structural equality between a translated config and
// its canonical (Hebrew) twin.
//
// A translation lives at configs/prod/<lang>/<id>.json and must be the Hebrew
// file with only its text replaced (docs/I18N_SPEC.md §4). Scoring, item ids,
// option values, alerts, interpretations and taxonomy are therefore identical
// by construction, and the CI validator proves it here: strip every
// text-bearing field from both files and deep-compare what remains. Any
// difference is a scoring/structure drift that would let two languages of the
// same instrument mean different things.
//
// Pure module (no fs) so scripts/validate-configs.mjs and the tests share it.

// Keys whose values are patient- or clinician-facing text and may differ.
const TEXT_KEYS = new Set(['title', 'description', 'keywords', 'text', 'label', 'message', 'ratingText']);
// Keys dropped before comparison: text whose *presence* may differ (Hebrew
// files predate the provenance field).
const DROPPED_KEYS = new Set(['source']);
// Keys whose *values* are text but whose *keys* are structural (subscale ids,
// slider ends): values are blanked, keys must match.
const TEXT_MAP_KEYS = new Set(['subscaleLabels', 'labels']);
// Top-level keys that legitimately differ between a file and its translation.
const IGNORED_TOP = new Set(['version', 'dev', 'dependencies']);

const BLANK = '§';

function strip(node, key = null, depth = 0) {
  if (TEXT_KEYS.has(key)) return BLANK;
  if (Array.isArray(node)) return node.map(v => strip(v, null, depth + 1));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node).sort()) {
      if (depth === 0 && IGNORED_TOP.has(k)) continue;
      if (DROPPED_KEYS.has(k)) continue;
      if (TEXT_MAP_KEYS.has(k) && node[k] && typeof node[k] === 'object') {
        out[k] = Object.fromEntries(Object.keys(node[k]).sort().map(sk => [sk, BLANK]));
      } else {
        out[k] = strip(node[k], k, depth + 1);
      }
    }
    return out;
  }
  return node;
}

// First differing JSON path between two stripped trees, or null.
function firstDiff(a, b, path = '') {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path || '/'} (array vs non-array)`;
    if (a.length !== b.length) return `${path || '/'} (length ${a.length} vs ${b.length})`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}/${i}`);
      if (d) return d;
    }
    return null;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      if (!(k in a)) return `${path}/${k} (only in translation)`;
      if (!(k in b)) return `${path}/${k} (missing from translation)`;
      const d = firstDiff(a[k], b[k], `${path}/${k}`);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path || '/'} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
}

/**
 * checkTranslationParity — errors for a translated config against its canonical twin.
 *
 * @param {object} canonical   parsed configs/prod/<id>.json
 * @param {object} translated  parsed configs/prod/<lang>/<id>.json
 * @param {string} lang        the translation's language code
 * @returns {string[]} human-readable errors (empty when the files agree)
 */
export function checkTranslationParity(canonical, translated, lang) {
  const errors = [];

  const diff = firstDiff(strip(canonical), strip(translated));
  if (diff) {
    errors.push(
      `Structure differs from the Hebrew file at ${diff}. A translation may change only text ` +
      `(${[...TEXT_KEYS, ...DROPPED_KEYS].join(', ')}, and the values of ${[...TEXT_MAP_KEYS].join('/')}); ` +
      `everything else — ids, option values, scoring, alerts, interpretations, meta — must be identical.`
    );
  }

  // Dependencies point into the same language directory, one for one.
  const expected = (canonical.dependencies ?? []).map(d => d.replace(/configs\/prod\//, `configs/prod/${lang}/`));
  const actual = translated.dependencies ?? [];
  if (JSON.stringify([...expected].sort()) !== JSON.stringify([...actual].sort())) {
    errors.push(
      `"dependencies" must be the Hebrew file's list rewritten into configs/prod/${lang}/ — ` +
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`
    );
  }

  // Provenance is mandatory on every translated questionnaire (L-9).
  for (const q of translated.questionnaires ?? []) {
    if (!q.meta?.source) {
      errors.push(`Questionnaire "${q.id}": meta.source is required on translated files — cite the publication or official translation the text was taken from.`);
    }
  }

  return errors;
}
