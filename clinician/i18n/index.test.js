import { describe, it, expect, afterEach, vi } from 'vitest';
import { he } from './he.js';
import { en } from './en.js';
import { t, currentLang, loadStrings, bootLang, switchLang, _resetStringsForTesting } from './index.js';
import { diffTableKeys, LANG_CODES, LANG_STORAGE_KEY } from '../../shared/i18n/core.js';

const TABLES = { he, en };

describe('clinician string tables', () => {
  it('exist for every language in LANGS', () => {
    for (const lang of LANG_CODES) expect(TABLES[lang], `table for ${lang}`).toBeTruthy();
  });

  it.each(Object.keys(TABLES))('%s carries exactly the Hebrew keys', (lang) => {
    expect(diffTableKeys(he, TABLES[lang])).toEqual({ missing: [], extra: [] });
  });

  it('interpolated keys use the same tokens in every language', () => {
    const tokens = s => (typeof s === 'string' ? s : Object.values(s).join(' ')).match(/\{\w+\}/g)?.sort() ?? [];
    for (const k of Object.keys(he)) expect(tokens(en[k]), k).toEqual(tokens(he[k]));
  });
});

describe('bootLang / switchLang', () => {
  afterEach(() => _resetStringsForTesting());

  const fakeWin = ({ search = '', stored = null, languages = [] } = {}) => {
    const store = new Map(stored ? [[LANG_STORAGE_KEY, stored]] : []);
    const attrs = {};
    return {
      location: { search, href: `http://x/composer/${search}`, assign: vi.fn() },
      localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
      navigator: { languages },
      document: { title: '', documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
      attrs, store,
    };
  };

  it('defaults to Hebrew and stamps the document', async () => {
    const win = fakeWin();
    expect(await bootLang({ titleKey: 'composer.title', win })).toBe('he');
    expect(win.attrs).toEqual({ lang: 'he', dir: 'rtl' });
    expect(win.document.title).toBe(he['composer.title']);
    expect(t('cart.copy')).toBe('העתק קישור');
  });

  it('honours ?lang=en and loads the English table', async () => {
    const win = fakeWin({ search: '?lang=en' });
    expect(await bootLang({ titleKey: 'composer.title', win })).toBe('en');
    expect(win.attrs).toEqual({ lang: 'en', dir: 'ltr' });
    expect(win.document.title).toBe(en['composer.title']);
    expect(currentLang()).toBe('en');
    expect(t('cart.copy')).toBe('Copy link');
    expect(t('cart.dropped', { n: 2, lang: 'English' })).toBe('2 questionnaires were removed — not available in English.');
  });

  it('follows the stored preference, then the browser', async () => {
    expect(await bootLang({ win: fakeWin({ stored: 'en', languages: ['he'] }) })).toBe('en');
    _resetStringsForTesting();
    expect(await bootLang({ win: fakeWin({ languages: ['en-US'] }) })).toBe('en');
  });

  it('switchLang stores the choice and navigates to the same page with ?lang=', () => {
    const win = fakeWin({ search: '?x=1' });
    switchLang('en', win);
    expect(win.store.get(LANG_STORAGE_KEY)).toBe('en');
    expect(win.location.assign).toHaveBeenCalledWith('/composer/?x=1&lang=en');
    switchLang('xx', win);
    expect(win.location.assign).toHaveBeenCalledTimes(1);
  });

  it('loadStrings rejects unknown codes', async () => {
    await expect(loadStrings('xx')).rejects.toThrow(RangeError);
  });
});
