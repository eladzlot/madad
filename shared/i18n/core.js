// core.js — the language model shared by every surface and by Node scripts.
//
// Pure and framework-free: no DOM access except inside applyDocumentLang,
// which takes the document as an argument. Adding a language is one row in
// LANGS plus string tables (src/i18n, clinician/i18n), config files under
// public/configs/prod/<lang>/, and — for non-Latin scripts — fonts.
//
// The patient language rides in the patient URL (`lang=`; absent ⇒ Hebrew)
// and selects the config directory via configBaseFor(). The clinician UI
// language is a per-browser preference resolved by resolveClinicianLang().
// See docs/I18N_SPEC.md.

export const LANGS = Object.freeze({
  he: Object.freeze({ dir: 'rtl', locale: 'he-IL', label: 'עברית' }),
  en: Object.freeze({ dir: 'ltr', locale: 'en-GB', label: 'English' }),
});

export const DEFAULT_LANG = 'he';

export const LANG_CODES = Object.freeze(Object.keys(LANGS));

export const isLang = (x) => typeof x === 'string' && Object.hasOwn(LANGS, x);

// Config directory for a language. Hebrew is the canonical tree at
// configs/prod/; every other language is a sibling subdirectory holding
// files with the same ids (docs/I18N_SPEC.md §4). Short-name resolution and
// configFileLabel() in shared/config/loader.js key off this prefix.
export function configBaseFor(lang) {
  if (!isLang(lang)) throw new RangeError(`Unknown language "${lang}"`);
  return lang === DEFAULT_LANG ? 'configs/prod/' : `configs/prod/${lang}/`;
}

// Parses a config path relative to public/ (or a URL path) into its language
// and short name, or null when it is not a prod config path.
//   'configs/prod/phq9.json'    → { lang: 'he', id: 'phq9' }
//   'configs/prod/en/phq9.json' → { lang: 'en', id: 'phq9' }
export function parseConfigPath(path) {
  const m = /(?:^|\/)configs\/prod\/(?:([a-z]{2,3})\/)?([^/]+)\.json$/.exec(path);
  if (!m) return null;
  const lang = m[1] ?? DEFAULT_LANG;
  if (!isLang(lang) || lang === DEFAULT_LANG && m[1]) return null;
  return { lang, id: m[2] };
}

// ── Strings ───────────────────────────────────────────────────────────────────

// makeT builds a translation function over a flat table of dotted keys.
//
//   const t = makeT({ table: en, fallback: he, locale: 'en-GB' });
//   t('welcome.begin')                       → 'Begin'
//   t('progress.item', { current: 2, total: 9 })   → 'Question 2 of 9'
//   t('upload.summary', { n: 3 })            → plural entry picked by Intl.PluralRules
//
// A table value is a string or a plural object keyed by CLDR category
// ({ one, two, few, many, other } — `other` is required). `{name}` tokens are
// replaced from params; a missing key falls back to the fallback table, then
// to the key itself (never blank, never a throw — a missing translation must
// not take a patient screen down).
export function makeT({ table, fallback = null, locale = LANGS[DEFAULT_LANG].locale } = {}) {
  const rules = new Intl.PluralRules(locale);
  return function t(key, params) {
    let entry = table?.[key];
    if (entry === undefined) entry = fallback?.[key];
    if (entry === undefined) return key;
    if (typeof entry === 'object' && entry !== null) {
      const n = Number(params?.n);
      entry = entry[Number.isFinite(n) ? rules.select(n) : 'other'] ?? entry.other ?? key;
    }
    if (!params) return entry;
    return entry.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  };
}

// Every table in a set must carry exactly the keys of the default table.
// Returns { missing, extra } so a unit test can print both.
export function diffTableKeys(reference, candidate) {
  const ref = new Set(Object.keys(reference));
  const cand = new Set(Object.keys(candidate));
  return {
    missing: [...ref].filter(k => !cand.has(k)),
    extra:   [...cand].filter(k => !ref.has(k)),
  };
}

// ── Document ──────────────────────────────────────────────────────────────────

export function applyDocumentLang(lang, { title, document: doc = globalThis.document } = {}) {
  if (!doc) return;
  const { dir } = LANGS[lang] ?? LANGS[DEFAULT_LANG];
  doc.documentElement.setAttribute('lang', lang);
  doc.documentElement.setAttribute('dir', dir);
  if (title) doc.title = title;
}

// ── Clinician preference ──────────────────────────────────────────────────────

export const LANG_STORAGE_KEY = 'madad.lang.v1';

// Precedence: explicit ?lang= → stored preference → browser languages → Hebrew.
// Invalid values at any level are skipped, never trusted.
export function resolveClinicianLang({ search = '', storage = null, navigator: nav = null } = {}) {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;

  let stored = null;
  try { stored = storage?.getItem?.(LANG_STORAGE_KEY) ?? null; } catch { /* storage blocked */ }
  if (isLang(stored)) return stored;

  const langs = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  for (const tag of langs) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (primary === 'he' || primary === 'iw') return 'he';
    if (isLang(primary)) return primary;
  }
  return DEFAULT_LANG;
}

export function storeClinicianLang(lang, storage) {
  if (!isLang(lang)) return;
  try { storage?.setItem?.(LANG_STORAGE_KEY, lang); } catch { /* storage blocked */ }
}

// Returns the URL to navigate to when the clinician switches language:
// same page, ?lang= set, everything else preserved.
export function withLangParam(href, lang) {
  const url = new URL(href, 'http://x/');
  url.searchParams.set('lang', lang);
  return url.pathname + url.search + url.hash;
}
