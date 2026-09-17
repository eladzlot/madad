// search.js — the composer's match/rank seam, backed by Fuse.js.
//
// The composer is a Hebrew-first tool, so the engine must tolerate Hebrew typos
// (a dropped yod: "דכאון" → "דיכאון") as well as Latin ones. uFuzzy was
// evaluated first per the plan but cannot tokenize Hebrew at all (it returns
// nothing for every Hebrew query, even with explicit \p{L} config); Fuse.js
// handles both scripts and passes the acceptance suite below, so it is the sole
// engine. Components and the store call only the four exports here — they never
// learn which library is underneath.
import Fuse from 'fuse.js';
import { LANGS, DEFAULT_LANG } from '../../shared/i18n/core.js';
import { titleIn, textIn } from './entry-text.js';

// Hebrew final forms fold to their medial form so a query fragment matches
// regardless of where it lands ("טראומ" vs a word ending in a final letter).
const HEBREW_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

// Normalize a query or field for comparison: lowercase, trim, strip combining
// marks (Hebrew niqqud / cantillation, Latin and Cyrillic diacritics — NFD
// then \p{M}), and fold Hebrew final forms.
export function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ךםןףץ]/g, (c) => HEBREW_FINALS[c]);
}

// Per-entry searchable record with each weighted field pre-normalized, in the
// clinician's UI language (with every other language's title and keywords as
// a lower-weight field, so a Hebrew clinician still finds "PHQ" and an English
// one still finds an instrument by its Hebrew name). Cached by entry identity
// and language — catalog entries are stable objects, so normalization runs at
// most once per entry per language for the life of the page.
const _records = new Map();   // lang → WeakMap(entry → record)
function toRecord(entry, lang) {
  if (!_records.has(lang)) _records.set(lang, new WeakMap());
  const cache = _records.get(lang);
  let rec = cache.get(entry);
  if (!rec) {
    const others = Object.entries(entry.i18n ?? {})
      .filter(([l]) => l !== lang)
      .flatMap(([, v]) => [v.title, ...(v.keywords ?? [])]);
    if (lang !== DEFAULT_LANG) others.push(entry.title, ...(entry.keywords ?? []));
    rec = {
      entry,
      title: normalize(titleIn(entry, lang)),
      keywords: normalize(textIn(entry, lang, 'keywords').join(' ')),
      id: normalize(entry.id),
      description: normalize(textIn(entry, lang, 'description')),
      other: normalize(others.join(' ')),
    };
    cache.set(entry, rec);
  }
  return rec;
}

// Field weighting per the plan: title 3 > keywords/id 2 > description 1;
// other languages' text 1.
const FUSE_OPTS = {
  includeScore: true,
  ignoreLocation: true, // match anywhere in a field, not just near its start
  threshold: 0.3, // single-error tolerance; tighter than Fuse's 0.6 default
  keys: [
    { name: 'title', weight: 3 },
    { name: 'keywords', weight: 2 },
    { name: 'id', weight: 2 },
    { name: 'description', weight: 1 },
    { name: 'other', weight: 1 },
  ],
};

const collate = (a, b, lang) =>
  titleIn(a, lang).localeCompare(titleIn(b, lang), LANGS[lang]?.locale ?? LANGS[DEFAULT_LANG].locale);

// Fuse scores are continuous (0 = perfect). Round to coarse buckets so the
// featured-first / alphabetical tie-break orders near-equal matches without
// overriding genuine relevance gaps.
function scoreBucket(score) {
  return Math.round((score ?? 0) * 20) / 20; // 0.05 granularity
}

// Browse order for the curated / full-catalog views (no active query):
// featured entries first, then alphabetical by title in the UI language.
export function sortForBrowse(entries, lang = DEFAULT_LANG) {
  return [...entries].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return collate(a, b, lang);
  });
}

// Result order for a query: fuzzy relevance, with featured-then-alphabetical as
// the tie-break within a relevance bucket. Empty query falls back to browse order.
export function rankForQuery(entries, query, lang = DEFAULT_LANG) {
  const q = normalize(query);
  if (!q) return sortForBrowse(entries, lang);
  const fuse = new Fuse(entries.map((e) => toRecord(e, lang)), FUSE_OPTS);
  return fuse
    .search(q)
    .sort((a, b) => {
      const ba = scoreBucket(a.score);
      const bb = scoreBucket(b.score);
      if (ba !== bb) return ba - bb;
      const ea = a.item.entry;
      const eb = b.item.entry;
      if (!!ea.featured !== !!eb.featured) return ea.featured ? -1 : 1;
      return collate(ea, eb, lang);
    })
    .map((r) => r.item.entry);
}

// Does an entry match a free-text query? Empty query matches everything. Routed
// through the same engine as rankForQuery so match and rank never disagree.
export function matchesQuery(entry, query, lang = DEFAULT_LANG) {
  const q = normalize(query);
  if (!q) return true;
  return rankForQuery([entry], query, lang).length > 0;
}
