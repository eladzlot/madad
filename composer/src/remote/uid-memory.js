// uid-memory.js — the composer remembers which uids this browser has used.
//
// A therapist composes links for the same handful of patients week after
// week; with 8-character uids that is a lot of careful retyping. The store
// here keeps the uids that have actually produced a link (copy / open /
// share), most recent first, in localStorage, and the uid field offers them
// as a <datalist>. Local to the browser, never transmitted, and a uid is not
// a person — nothing identifying is stored (REMOTE_SPEC §8.2).

import { formatUid } from '../../../shared/remote/uid.js';

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
