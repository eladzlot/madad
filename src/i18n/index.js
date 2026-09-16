// index.js — the patient app's string access point.
//
//   import { t, currentLang, loadStrings } from './i18n/index.js';
//   await loadStrings(lang);        // once, at boot, before the first render
//   t('welcome.begin')              // → 'התחל' | 'Begin'
//
// Hebrew is imported statically (it is the fallback table and the language
// of every link without `lang=`); every other language is a lazy chunk so
// it costs nothing against the patient bundle budget unless requested.
// The PDF generator reads the same table — the report is in the patient's
// language (docs/I18N_SPEC.md L-2).

import { he } from './he.js';
import { makeT, LANGS, DEFAULT_LANG, isLang } from '../../shared/i18n/core.js';

// Explicit loaders (not import(`./${lang}.js`)) so Vite emits one chunk per
// language and nothing else in this directory is bundled by accident.
const LOADERS = {
  en: () => import('./en.js').then(m => m.en),
};

let _lang = DEFAULT_LANG;
let _t = makeT({ table: he, locale: LANGS[DEFAULT_LANG].locale });

export function currentLang() { return _lang; }

export function t(key, params) { return _t(key, params); }

// Loads and activates a language. Unknown codes throw — callers validate
// with isLang() first and show the malformed-link screen.
export async function loadStrings(lang) {
  if (!isLang(lang)) throw new RangeError(`Unknown language "${lang}"`);
  const table = lang === DEFAULT_LANG ? he : await LOADERS[lang]();
  _lang = lang;
  _t = makeT({ table, fallback: he, locale: LANGS[lang].locale });
  return table;
}

/** For tests only — back to Hebrew without a dynamic import. */
export function _resetStringsForTesting() {
  _lang = DEFAULT_LANG;
  _t = makeT({ table: he, locale: LANGS[DEFAULT_LANG].locale });
}
