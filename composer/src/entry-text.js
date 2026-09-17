// entry-text.js — a catalog entry's clinician-facing text in a UI language.
//
// Catalog v2 keeps the Hebrew title/description/keywords as the canonical
// fields and carries translations under `i18n[lang]`. These helpers fall back
// to Hebrew when an entry has no translation for the UI language — a
// Hebrew-only instrument shown in an English UI keeps its Hebrew name, which
// is honest: that is what the patient would get.
//
// Kept in its own module because both the store and the search seam need it
// (and they import each other otherwise).

import { DEFAULT_LANG } from '../../shared/i18n/core.js';

export function textIn(entry, lang, field) {
  const v = lang === DEFAULT_LANG ? undefined : entry?.i18n?.[lang]?.[field];
  return v ?? entry?.[field] ?? (field === 'keywords' ? [] : '');
}

export const titleIn = (entry, lang) => textIn(entry, lang, 'title') || entry?.id || '';
