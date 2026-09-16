// index.js — string access for the clinician surfaces (nav, Composer,
// Aggregate, Help).
//
//   import { t, currentLang, bootLang } from '../../clinician/i18n/index.js';
//   const lang = await bootLang({ title: 'composer.title' });   // once, at boot
//   t('cart.copy')                                              // → 'העתק קישור' | 'Copy link'
//
// The UI language is a per-browser preference: ?lang= wins, then the stored
// choice, then the browser language (docs/I18N_SPEC.md L-7). Switching it
// writes the preference and reloads (L-11), so `t` never changes language
// within a page lifetime. Hebrew is static (the fallback); other languages are
// lazy chunks so they never count against the surfaces' bundle budgets.

import { he } from './he.js';
import {
  makeT, LANGS, DEFAULT_LANG, isLang, applyDocumentLang,
  resolveClinicianLang, storeClinicianLang, withLangParam,
} from '../../shared/i18n/core.js';

const LOADERS = {
  en: () => import('./en.js').then(m => m.en),
};

let _lang = DEFAULT_LANG;
let _t = makeT({ table: he, locale: LANGS[DEFAULT_LANG].locale });

export function currentLang() { return _lang; }
export function t(key, params) { return _t(key, params); }

export async function loadStrings(lang) {
  if (!isLang(lang)) throw new RangeError(`Unknown language "${lang}"`);
  const table = lang === DEFAULT_LANG ? he : await LOADERS[lang]();
  _lang = lang;
  _t = makeT({ table, fallback: he, locale: LANGS[lang].locale });
  return table;
}

// Resolves the clinician language, loads its strings, stamps <html lang/dir>
// (and the document title from `titleKey`), and returns the code. Every
// clinician surface calls this before mounting anything.
export async function bootLang({ titleKey = null, win = globalThis.window } = {}) {
  const lang = resolveClinicianLang({
    search:    win?.location?.search ?? '',
    storage:   safeStorage(win),
    navigator: win?.navigator ?? null,
  });
  try {
    await loadStrings(lang);
  } catch (err) {
    console.error('[i18n] strings failed to load, staying Hebrew:', err);
  }
  applyDocumentLang(currentLang(), { title: titleKey ? t(titleKey) : undefined, document: win?.document });
  return currentLang();
}

// The nav's language toggle: remember the choice, then reload the same page
// with ?lang= set so the whole surface (static HTML included) re-renders.
export function switchLang(lang, win = globalThis.window) {
  if (!isLang(lang) || !win) return;
  storeClinicianLang(lang, safeStorage(win));
  win.location.assign(withLangParam(win.location.href, lang));
}

function safeStorage(win) {
  try { return win?.localStorage ?? null; } catch { return null; }
}

/** For tests only. */
export function _resetStringsForTesting() {
  _lang = DEFAULT_LANG;
  _t = makeT({ table: he, locale: LANGS[DEFAULT_LANG].locale });
}
