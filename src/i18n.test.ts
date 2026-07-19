import { describe, expect, it } from 'vitest';
import { createTranslator, isRtlLanguage, normalizeLanguage, translatePlural } from './i18n';

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

  it('falls back to English for a supported language without its own catalog', () => {
    const t = createTranslator('fr');

    expect(t('app.title')).toBe('Qortium Notify');
  });

  it('falls back to English for an unsupported language tag', () => {
    const t = createTranslator('xx-YY');

    expect(t('app.title')).toBe('Qortium Notify');
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
