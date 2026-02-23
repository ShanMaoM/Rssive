import type { InterfaceLanguagePreference } from '../../shared/state/preferences';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

type TranslationParams = Record<string, string | number | null | undefined>;

const locales: Record<InterfaceLanguagePreference, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

const warnedMissingKeys = new Set<string>();

const interpolate = (template: string, params?: TranslationParams) => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = params[token];
    if (value === null || value === undefined) return '';
    return String(value);
  });
};

export const translate = (
  language: InterfaceLanguagePreference,
  key: string,
  params?: TranslationParams,
) => {
  const localized = locales[language]?.[key];
  if (localized) return interpolate(localized, params);

  const fallback = locales['en-US']?.[key];
  if (fallback) {
    const warnKey = `${language}:${key}`;
    if (!warnedMissingKeys.has(warnKey) && typeof console !== 'undefined') {
      warnedMissingKeys.add(warnKey);
      console.warn(`[i18n] Missing key "${key}" for locale "${language}", fallback to en-US.`);
    }
    return interpolate(fallback, params);
  }

  const warnKey = `missing:${key}`;
  if (!warnedMissingKeys.has(warnKey) && typeof console !== 'undefined') {
    warnedMissingKeys.add(warnKey);
    console.warn(`[i18n] Missing key "${key}" in all locales.`);
  }
  return key;
};

export const getLocaleDictionary = (language: InterfaceLanguagePreference) => locales[language];
