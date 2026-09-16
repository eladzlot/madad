import { describe, it, expect } from 'vitest';
import {
  LANGS, DEFAULT_LANG, isLang, configBaseFor, parseConfigPath,
  makeT, diffTableKeys, applyDocumentLang,
  resolveClinicianLang, storeClinicianLang, withLangParam, LANG_STORAGE_KEY,
} from './core.js';

describe('language table', () => {
  it('Hebrew is the default and is RTL', () => {
    expect(DEFAULT_LANG).toBe('he');
    expect(LANGS.he.dir).toBe('rtl');
    expect(LANGS.en.dir).toBe('ltr');
  });

  it('isLang accepts only known codes', () => {
    expect(isLang('he')).toBe(true);
    expect(isLang('en')).toBe(true);
    expect(isLang('ru')).toBe(false);
    expect(isLang('')).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(isLang('__proto__')).toBe(false);
  });

  it('configBaseFor maps Hebrew to the canonical tree and others to a subdirectory', () => {
    expect(configBaseFor('he')).toBe('configs/prod/');
    expect(configBaseFor('en')).toBe('configs/prod/en/');
    expect(() => configBaseFor('xx')).toThrow(RangeError);
  });

  it('parseConfigPath recognises canonical and language paths', () => {
    expect(parseConfigPath('configs/prod/phq9.json')).toEqual({ lang: 'he', id: 'phq9' });
    expect(parseConfigPath('public/configs/prod/en/phq9.json')).toEqual({ lang: 'en', id: 'phq9' });
    expect(parseConfigPath('/configs/prod/en/phq9.json')).toEqual({ lang: 'en', id: 'phq9' });
    expect(parseConfigPath('configs/prod/he/phq9.json')).toBeNull();   // Hebrew never lives in he/
    expect(parseConfigPath('configs/prod/xx/phq9.json')).toBeNull();
    expect(parseConfigPath('configs/other/phq9.json')).toBeNull();
    expect(parseConfigPath('configs/prod/deep/en/phq9.json')).toBeNull();
  });
});

describe('makeT', () => {
  const he = { 'a.plain': 'שלום', 'a.tpl': 'שאלה {current} מתוך {total}', 'only.he': 'עברית',
    'n.reports': { one: 'דוח אחד', other: '{n} דוחות' } };
  const en = { 'a.plain': 'Hello', 'a.tpl': 'Question {current} of {total}',
    'n.reports': { one: '{n} report', other: '{n} reports' } };

  it('returns plain strings and interpolates params', () => {
    const t = makeT({ table: en, locale: 'en-GB' });
    expect(t('a.plain')).toBe('Hello');
    expect(t('a.tpl', { current: 2, total: 9 })).toBe('Question 2 of 9');
  });

  it('leaves unknown tokens intact and returns the key when nothing matches', () => {
    const t = makeT({ table: en, locale: 'en-GB' });
    expect(t('a.tpl', { current: 2 })).toBe('Question 2 of {total}');
    expect(t('nope')).toBe('nope');
  });

  it('falls back to the fallback table', () => {
    const t = makeT({ table: en, fallback: he, locale: 'en-GB' });
    expect(t('only.he')).toBe('עברית');
  });

  it('selects plural forms by locale', () => {
    const t = makeT({ table: en, locale: 'en-GB' });
    expect(t('n.reports', { n: 1 })).toBe('1 report');
    expect(t('n.reports', { n: 3 })).toBe('3 reports');
    expect(t('n.reports', { n: 0 })).toBe('0 reports');
    const th = makeT({ table: he, locale: 'he-IL' });
    expect(th('n.reports', { n: 1 })).toBe('דוח אחד');
    expect(th('n.reports', { n: 2 })).toBe('2 דוחות');
  });

  it('uses "other" when n is absent from a plural entry', () => {
    const t = makeT({ table: en, locale: 'en-GB' });
    expect(t('n.reports')).toBe('{n} reports');
  });
});

describe('diffTableKeys', () => {
  it('reports missing and extra keys', () => {
    expect(diffTableKeys({ a: 1, b: 2 }, { a: 1, c: 3 })).toEqual({ missing: ['b'], extra: ['c'] });
  });
});

describe('applyDocumentLang', () => {
  it('sets lang, dir and title on the given document', () => {
    const attrs = {};
    const doc = { title: '', documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
    applyDocumentLang('en', { title: 'Madad', document: doc });
    expect(attrs).toEqual({ lang: 'en', dir: 'ltr' });
    expect(doc.title).toBe('Madad');
    applyDocumentLang('he', { document: doc });
    expect(attrs).toEqual({ lang: 'he', dir: 'rtl' });
    expect(doc.title).toBe('Madad');
  });

  it('is a no-op without a document', () => {
    expect(() => applyDocumentLang('en', { document: null })).not.toThrow();
  });
});

describe('resolveClinicianLang', () => {
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

  it('defaults to Hebrew with nothing to go on', () => {
    expect(resolveClinicianLang({})).toBe('he');
  });

  it('?lang= wins over everything', () => {
    const storage = mem(); storage.setItem(LANG_STORAGE_KEY, 'he');
    expect(resolveClinicianLang({ search: '?x=1&lang=en', storage, navigator: { languages: ['he'] } })).toBe('en');
  });

  it('ignores an invalid ?lang= and falls through', () => {
    const storage = mem(); storage.setItem(LANG_STORAGE_KEY, 'en');
    expect(resolveClinicianLang({ search: '?lang=xx', storage })).toBe('en');
  });

  it('uses the stored preference before the browser', () => {
    const storage = mem(); storage.setItem(LANG_STORAGE_KEY, 'en');
    expect(resolveClinicianLang({ storage, navigator: { languages: ['he-IL'] } })).toBe('en');
  });

  it('follows the browser language when nothing is stored', () => {
    expect(resolveClinicianLang({ navigator: { languages: ['en-US', 'he'] } })).toBe('en');
    expect(resolveClinicianLang({ navigator: { languages: ['he-IL', 'en'] } })).toBe('he');
    expect(resolveClinicianLang({ navigator: { languages: ['iw'] } })).toBe('he');
    expect(resolveClinicianLang({ navigator: { language: 'en' } })).toBe('en');
    expect(resolveClinicianLang({ navigator: { languages: ['ru', 'de'] } })).toBe('he');
  });

  it('survives a throwing storage', () => {
    const storage = { getItem() { throw new Error('blocked'); } };
    expect(resolveClinicianLang({ storage, navigator: { languages: ['en'] } })).toBe('en');
  });

  it('storeClinicianLang writes only valid codes', () => {
    const storage = mem();
    storeClinicianLang('xx', storage);
    expect(storage.getItem(LANG_STORAGE_KEY)).toBeNull();
    storeClinicianLang('en', storage);
    expect(storage.getItem(LANG_STORAGE_KEY)).toBe('en');
  });
});

describe('withLangParam', () => {
  it('sets or replaces lang and keeps the rest', () => {
    expect(withLangParam('/composer/?a=1#pid=x', 'en')).toBe('/composer/?a=1&lang=en#pid=x');
    expect(withLangParam('/composer/?lang=en', 'he')).toBe('/composer/?lang=he');
    expect(withLangParam('https://app.ezmadad.com/aggregate/', 'en')).toBe('/aggregate/?lang=en');
  });
});
