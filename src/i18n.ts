import { EN_STRINGS } from './locales/en';
import { CATALOGS } from './locales/catalogs';

export type MessageValues = Record<string, string | number>;

// Full Home language list keeps display-settings sync and RTL detection in
// step with the host. Every listed non-English language has a static catalog.
export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type MessageKey = keyof typeof EN_STRINGS;
export type MessageCatalog = { [key in MessageKey]: string };

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGES = new Set<string>(['ar', 'he']);
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

function normalizeRawLanguage(language: string) {
  return language.trim().replace(/_/g, '-').toLowerCase();
}

function mapRawLanguage(language: string): SupportedLanguage | null {
  const normalized = normalizeRawLanguage(language);

  if (!normalized) {
    return null;
  }

  const explicit: Partial<Record<string, SupportedLanguage>> = {
    'en-gb': 'en',
    'en-us': 'en',
    'zh-cn': 'zh-CN',
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh-tw': 'zh-TW',
  };
  const mapped = explicit[normalized];

  if (mapped) {
    return mapped;
  }

  const [primary, ...rest] = normalized.split('-');

  if (primary && SUPPORTED_LANGUAGE_SET.has(primary)) {
    return primary as SupportedLanguage;
  }

  if (primary === 'zh') {
    if (rest.some((part) => part.includes('tw') || part.includes('hk') || part.includes('mo') || part.includes('hant'))) {
      return 'zh-TW';
    }

    return 'zh-CN';
  }

  return null;
}

export function normalizeLanguage(language: string | undefined): SupportedLanguage | null {
  return language ? mapRawLanguage(language) : null;
}

export function isRtlLanguage(language: SupportedLanguage) {
  return RTL_LANGUAGES.has(language);
}

function interpolate(message: string, values?: MessageValues) {
  if (!values) {
    return message;
  }

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];

    return value === undefined ? match : String(value);
  });
}

export function createTranslator(language: string | undefined) {
  const locale = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const catalog = locale === DEFAULT_LANGUAGE ? EN_STRINGS : CATALOGS[locale as Exclude<SupportedLanguage, 'en'>];

  return function translate(key: MessageKey, values?: MessageValues) {
    return interpolate(catalog[key] ?? EN_STRINGS[key], values);
  };
}

export type TranslateFunction = ReturnType<typeof createTranslator>;

/**
 * Picks a `<base>.one` / `<base>.other` message key by count (English-only
 * plural rule: count === 1 is singular) and interpolates it.
 */
export function translatePlural(
  translate: TranslateFunction,
  base: string,
  count: number,
  values?: MessageValues,
) {
  const key = `${base}.${count === 1 ? 'one' : 'other'}` as MessageKey;

  return translate(key, { count, ...values });
}
