import { describe, it, expect, afterEach } from 'vitest';
import { he } from './he.js';
import { en } from './en.js';
import { t, currentLang, loadStrings, _resetStringsForTesting } from './index.js';
import { diffTableKeys, LANG_CODES } from '../../shared/i18n/core.js';

const TABLES = { he, en };

describe('patient string tables', () => {
  it('exist for every language in LANGS', () => {
    for (const lang of LANG_CODES) expect(TABLES[lang], `table for ${lang}`).toBeTruthy();
  });

  it.each(Object.keys(TABLES))('%s carries exactly the Hebrew keys', (lang) => {
    expect(diffTableKeys(he, TABLES[lang])).toEqual({ missing: [], extra: [] });
  });

  it('has no empty values', () => {
    for (const [lang, table] of Object.entries(TABLES)) {
      for (const [k, v] of Object.entries(table)) {
        expect(typeof v === 'string' ? v.length : Object.keys(v).length, `${lang}:${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolated keys use the same tokens in every language', () => {
    const tokens = s => (typeof s === 'string' ? s : Object.values(s).join(' ')).match(/\{\w+\}/g)?.sort() ?? [];
    for (const k of Object.keys(he)) {
      expect(tokens(en[k]), k).toEqual(tokens(he[k]));
    }
  });
});

describe('t / loadStrings', () => {
  afterEach(() => _resetStringsForTesting());

  it('defaults to Hebrew', () => {
    expect(currentLang()).toBe('he');
    expect(t('welcome.begin')).toBe('התחל');
    expect(t('progress.item', { current: 2, total: 9 })).toBe('שאלה 2 מתוך 9');
  });

  it('switches to English and back', async () => {
    await loadStrings('en');
    expect(currentLang()).toBe('en');
    expect(t('welcome.begin')).toBe('Begin');
    await loadStrings('he');
    expect(t('welcome.begin')).toBe('התחל');
  });

  it('rejects unknown languages', async () => {
    await expect(loadStrings('xx')).rejects.toThrow(RangeError);
    expect(currentLang()).toBe('he');
  });
});
