// uid-memory.js — which uids this browser has used, shared by both clinician
// surfaces (composer and aggregate). It lives in shared/ because lint forbids
// one surface importing another, and localStorage is per-origin, so the two
// genuinely see the same list.
//
// What it is for: a uid is meaningless without the therapist's own records —
// that is the whole design (D-2) — so this is NOT patient selection. It is
// typing assistance. You glance at your handout, type two characters, and the
// rest completes, which avoids retyping an 8-character code and the typos the
// check symbol catches but cannot repair.
//
// Written when a uid actually gets used: a link composed in the composer, or a
// viewing link requested from the aggregate. Local to the browser, never
// transmitted, nothing identifying stored (REMOTE_SPEC §8.2).

import { formatUid } from './uid.js';

export const STORAGE_KEY = 'madad.remote.recentUids';
export const MAX_REMEMBERED = 50;

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Most-recent-first list of remembered uids; [] when storage is unavailable. */
export function loadRecentUids(storage = safeStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(u => formatUid(u) === u) : [];
  } catch {
    return [];
  }
}

/** Move `raw` (any spelling of a valid uid) to the front; returns the new list. */
export function rememberUid(raw, storage = safeStorage()) {
  const uid = formatUid(raw);
  const current = loadRecentUids(storage);
  if (!uid) return current;
  const next = [uid, ...current.filter(u => u !== uid)].slice(0, MAX_REMEMBERED);
  save(next, storage);
  return next;
}

export function forgetUid(raw, storage = safeStorage()) {
  const uid = formatUid(raw);
  const next = loadRecentUids(storage).filter(u => u !== uid);
  save(next, storage);
  return next;
}

function save(list, storage) {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota / private mode */ }
}
