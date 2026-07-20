// search.js — the composer's match/rank seam.
//
// Stage 3 keeps this deliberately simple: case-insensitive substring matching
// across a catalog entry's id, title, description, and keywords, with a stable
// browse order (featured first, then alphabetical). Stage 5 swaps the internals
// for uFuzzy (niqqud-stripping, single-error tolerance) behind these same two
// exports — components and the store never learn which engine is underneath.

// Normalize a query or field for comparison. Lowercase only for now; Stage 5
// adds niqqud stripping and Hebrew final-form folding here.
export function normalize(str) {
  return String(str ?? '').trim().toLowerCase();
}

// Does an entry match a free-text query? Empty query matches everything.
export function matchesQuery(entry, query) {
  const q = normalize(query);
  if (!q) return true;
  return (
    entry.id.toLowerCase().includes(q) ||
    entry.title.toLowerCase().includes(q) ||
    (entry.description != null && entry.description.toLowerCase().includes(q)) ||
    (entry.keywords != null && entry.keywords.some(k => k.toLowerCase().includes(q)))
  );
}

// Browse order for the curated / full-catalog views (no active query):
// featured entries first, then alphabetical by title (Hebrew collation).
export function sortForBrowse(entries) {
  return [...entries].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, 'he');
  });
}

// Result order for an active query. Substring matching has no graded score, so
// we rank by *where* the query lands (title beats keywords/id beats description)
// then fall back to browse order. Stage 5 replaces this with real fuzzy scores.
export function rankForQuery(entries, query) {
  const q = normalize(query);
  const rankOf = (e) => {
    if (e.title.toLowerCase().includes(q)) return 0;
    if (e.id.toLowerCase().includes(q)) return 1;
    if (e.keywords?.some(k => k.toLowerCase().includes(q))) return 2;
    return 3; // description-only match
  };
  return [...entries]
    .filter(e => matchesQuery(e, query))
    .sort((a, b) => {
      const ra = rankOf(a), rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      return a.title.localeCompare(b.title, 'he');
    });
}
