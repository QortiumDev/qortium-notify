import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  isRtlLanguage,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
  translatePlural,
} from './i18n';
import { CATALOGS, MESSAGE_KEYS } from './locales/catalogs';
import { EN_STRINGS } from './locales/en';

describe('normalizeLanguage', () => {
  it('maps regional variants to their supported base language', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('EN_GB')).toBe('en');
    expect(normalizeLanguage('zh-Hant')).toBe('zh-TW');
    expect(normalizeLanguage('zh-HK')).toBe('zh-TW');
    expect(normalizeLanguage('zh')).toBe('zh-CN');
  });

  it('returns null for unsupported or empty input', () => {
    expect(normalizeLanguage('xx')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });
});

describe('isRtlLanguage', () => {
  it('flags Arabic and Hebrew as RTL and everything else as LTR', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });
});

describe('createTranslator', () => {
  it('interpolates values into the English catalog', () => {
    const t = createTranslator('en');

    expect(t('grant.grantedAt', { date: 'today' })).toBe('Granted today');
  });

  it('uses a real catalog for supported non-English languages', () => {
    const t = createTranslator('fr');

    expect(t('action.refresh')).not.toBe(EN_STRINGS['action.refresh']);
  });

  it('falls back to English for an unsupported language tag', () => {
    const t = createTranslator('xx-YY');

    expect(t('app.title')).toBe('Qortium Notify');
  });
});

describe('locale catalogs', () => {
  it('has a complete, nonblank catalog for every supported non-English language', () => {
    const expectedLanguages = SUPPORTED_LANGUAGES.filter((language) => language !== 'en').sort();
    expect(Object.keys(CATALOGS).sort()).toEqual(expectedLanguages);

    for (const [language, catalog] of Object.entries(CATALOGS)) {
      expect(Object.keys(catalog), language).toEqual(MESSAGE_KEYS);
      for (const key of MESSAGE_KEYS) {
        expect(catalog[key].trim(), `${language}:${key}`).not.toBe('');
      }
    }
  });

  it('preserves every interpolation placeholder exactly', () => {
    const tokens = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();

    for (const [language, catalog] of Object.entries(CATALOGS)) {
      for (const key of MESSAGE_KEYS) {
        expect(tokens(catalog[key]), `${language}:${key}`).toEqual(tokens(EN_STRINGS[key]));
      }
    }
  });
});

describe('translatePlural', () => {
  it('picks the singular key for a count of one', () => {
    const t = createTranslator('en');

    expect(translatePlural(t, 'list.rules', 1)).toBe('1 rule');
  });

  it('picks the plural key for any other count', () => {
    const t = createTranslator('en');

    expect(translatePlural(t, 'list.rules', 0)).toBe('0 rules');
    expect(translatePlural(t, 'list.rules', 3)).toBe('3 rules');
  });

  it('merges extra values alongside count', () => {
    const t = createTranslator('en');

    expect(translatePlural(t, 'confirm.revoke.body', 2, { appName: 'Chat' })).toBe(
      'This deletes Chat’s notification grant and all 2 background rules. The app must ask again before it can send notifications.',
    );
  });
});
