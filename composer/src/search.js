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

// Hebrew final forms fold to their medial form so a query fragment matches
// regardless of where it lands ("טראומ" vs a word ending in a final letter).
const HEBREW_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

// Normalize a query or field for comparison: lowercase, trim, strip Hebrew
// niqqud / cantillation marks (U+0591–U+05C7), and fold final forms.
export function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => HEBREW_FINALS[c]);
}

// Per-entry searchable record with each weighted field pre-normalized. Cached by
// entry identity — catalog entries are stable objects, so normalization runs at
// most once per entry for the life of the page.
const _records = new WeakMap();
function toRecord(entry) {
  let rec = _records.get(entry);
  if (!rec) {
    rec = {
      entry,
      title: normalize(entry.title),
      keywords: normalize((entry.keywords ?? []).join(' ')),
      id: normalize(entry.id),
      description: normalize(entry.description ?? ''),
    };
    _records.set(entry, rec);
  }
  return rec;
}

// Field weighting per the plan: title 3 > keywords/id 2 > description 1.
const FUSE_OPTS = {
  includeScore: true,
  ignoreLocation: true, // match anywhere in a field, not just near its start
  threshold: 0.3, // single-error tolerance; tighter than Fuse's 0.6 default
  keys: [
    { name: 'title', weight: 3 },
    { name: 'keywords', weight: 2 },
    { name: 'id', weight: 2 },
    { name: 'description', weight: 1 },
  ],
};

// Fuse scores are continuous (0 = perfect). Round to coarse buckets so the
// featured-first / alphabetical tie-break orders near-equal matches without
// overriding genuine relevance gaps.
function scoreBucket(score) {
  return Math.round((score ?? 0) * 20) / 20; // 0.05 granularity
}

// Browse order for the curated / full-catalog views (no active query):
// featured entries first, then alphabetical by title (Hebrew collation).
export function sortForBrowse(entries) {
  return [...entries].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, 'he');
  });
}

// Result order for a query: fuzzy relevance, with featured-then-alphabetical as
// the tie-break within a relevance bucket. Empty query falls back to browse order.
export function rankForQuery(entries, query) {
  const q = normalize(query);
  if (!q) return sortForBrowse(entries);
  const fuse = new Fuse(entries.map(toRecord), FUSE_OPTS);
  return fuse
    .search(q)
    .sort((a, b) => {
      const ba = scoreBucket(a.score);
      const bb = scoreBucket(b.score);
      if (ba !== bb) return ba - bb;
      const ea = a.item.entry;
      const eb = b.item.entry;
      if (!!ea.featured !== !!eb.featured) return ea.featured ? -1 : 1;
      return ea.title.localeCompare(eb.title, 'he');
    })
    .map((r) => r.item.entry);
}

// Does an entry match a free-text query? Empty query matches everything. Routed
// through the same engine as rankForQuery so match and rank never disagree.
export function matchesQuery(entry, query) {
  const q = normalize(query);
  if (!q) return true;
  return rankForQuery([entry], query).length > 0;
}
