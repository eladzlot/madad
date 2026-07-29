// composer-profile.js — the clinician's personal "recommended" profile.
//
// The composer ships an author-curated set of recommended instruments (the
// catalog's `featured` flag). A clinician can then shape that set: unpin ones
// they don't use, pin ones they do. We persist only the *difference* from the
// author defaults — an overlay of `{ added, removed }` id lists — so future
// author recommendations keep flowing in unless the clinician removed that
// specific instrument, and their own additions stick across catalog changes.
//
//   effective-pinned(id) = (featured(id) || added.includes(id))
//                          && !removed.includes(id)
//
// Storage is per-browser localStorage (survives reloads, does not follow the
// clinician across devices — there is no backend). The instrument ids stored
// here carry no patient data. Every access is guarded: private-mode / disabled
// storage / quota errors degrade to "pins just don't persist", never a throw.

export const PROFILE_KEY = 'madad.composer.profile.v1';

const EMPTY = () => ({ added: [], removed: [] });

// localStorage access can itself throw (sandboxed iframes, disabled storage),
// so even reaching for the object is wrapped.
export function safeLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const strings = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);

// Coerce any parsed blob into a well-formed overlay. Unknown/garbage shapes
// collapse to the empty overlay rather than propagating bad data downstream.
export function normalizeProfile(raw) {
  return { added: strings(raw?.added), removed: strings(raw?.removed) };
}

// Load the overlay from storage. Never throws; missing/corrupt → empty overlay.
export function loadProfile(storage = safeLocalStorage()) {
  if (!storage) return EMPTY();
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return EMPTY();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return EMPTY();
  }
}

// Persist the overlay. Never throws; quota/disabled storage is silently a no-op
// (the in-memory profile still works for the current session).
export function saveProfile(profile, storage = safeLocalStorage()) {
  if (!storage) return;
  try {
    storage.setItem(
      PROFILE_KEY,
      JSON.stringify({ v: 1, added: strings(profile?.added), removed: strings(profile?.removed) }),
    );
  } catch {
    /* quota exceeded / storage disabled — pins won't persist, app still works */
  }
}
