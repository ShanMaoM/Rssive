export type ThemePreference = 'light' | 'dark';
export type ThemeColorPreference = 'indigo' | 'emerald' | 'rose' | 'amber' | 'cyan';
export type UiFontPreference = 'sans' | 'serif' | 'custom';
export type ArticleFontPreference = 'sans' | 'serif' | 'custom';
export type InterfaceLanguagePreference = 'en-US' | 'zh-CN';
export type FontFamilyPreference = ArticleFontPreference;
export type FontSizePreference = 'small' | 'medium' | 'large';
export type RssRefreshIntervalPreference = 5 | 10 | 15 | 30 | 60;
export type DeveloperLogLevelPreference = 'debug' | 'info' | 'warn' | 'error';
export type TranslationTargetPreference = 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es';
export type SummaryLanguagePreference = TranslationTargetPreference;
export type TranslationOutputPreference = 'full' | 'brief' | 'bullet';
export type TtsProviderSupportMode = 'browser-direct' | 'server-gateway';
export type TtsProviderPreference =
  | 'openai'
  | 'elevenlabs'
  | 'qwen'
  | 'azure'
  | 'google'
  | 'aws'
  | 'ibm'
  | 'baidu'
  | 'xunfei'
  | 'aliyun'
  | 'tencent'
  | 'huawei'
  | 'volcengine'
  | 'custom';
export type TtsAudioFormatPreference = 'mp3' | 'wav' | 'opus';

export const TRANSLATION_TARGET_OPTIONS: { value: TranslationTargetPreference; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
];

export const SUMMARY_LANGUAGE_OPTIONS: { value: SummaryLanguagePreference; label: string }[] = [
  ...TRANSLATION_TARGET_OPTIONS,
];

export const TRANSLATION_OUTPUT_OPTIONS: { value: TranslationOutputPreference; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'brief', label: 'Brief' },
  { value: 'bullet', label: 'Bullet Points' },
];

export const THEME_COLOR_OPTIONS: {
  value: ThemeColorPreference;
  label: string;
  swatch: string;
}[] = [
  { value: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { value: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { value: 'rose', label: 'Rose', swatch: '#f43f5e' },
  { value: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { value: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
];

export const INTERFACE_LANGUAGE_OPTIONS: { value: InterfaceLanguagePreference; label: string }[] = [
  { value: 'en-US', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
];

export const TTS_PROVIDER_OPTIONS: {
  value: TtsProviderPreference;
  label: string;
  hint: string;
  supportMode: TtsProviderSupportMode;
  docsUrl: string;
}[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    hint: 'Audio API /v1/audio/speech with Bearer key.',
    supportMode: 'browser-direct',
    docsUrl: 'https://platform.openai.com/docs/guides/text-to-speech',
  },
  {
    value: 'elevenlabs',
    label: 'ElevenLabs',
    hint: 'POST /v1/text-to-speech/{voice_id} with xi-api-key.',
    supportMode: 'browser-direct',
    docsUrl: 'https://elevenlabs.io/docs/api-reference/text-to-speech',
  },
  {
    value: 'qwen',
    label: 'Qwen TTS (DashScope)',
    hint: 'Uses local /fetch/tts/qwen proxy to avoid browser CORS.',
    supportMode: 'browser-direct',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-tts-api',
  },
  {
    value: 'azure',
    label: 'Azure Cognitive Services',
    hint: 'Speech REST /cognitiveservices/v1 with region endpoint.',
    supportMode: 'browser-direct',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech',
  },
  {
    value: 'google',
    label: 'Google Cloud',
    hint: 'Cloud TTS /v1/text:synthesize with OAuth access token.',
    supportMode: 'browser-direct',
    docsUrl: 'https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize',
  },
  {
    value: 'aws',
    label: 'AWS Polly',
    hint: 'Official API requires SigV4 signing (server gateway recommended).',
    supportMode: 'server-gateway',
    docsUrl: 'https://docs.aws.amazon.com/polly/latest/dg/API_Reference.html',
  },
  {
    value: 'ibm',
    label: 'IBM Watson',
    hint: 'Text to Speech /v1/synthesize with IAM API key/token.',
    supportMode: 'browser-direct',
    docsUrl: 'https://cloud.ibm.com/apidocs/text-to-speech',
  },
  {
    value: 'baidu',
    label: 'Baidu Smart Cloud',
    hint: 'AipSpeech text2audio with access token and app id.',
    supportMode: 'browser-direct',
    docsUrl: 'https://ai.baidu.com/ai-doc/SPEECH/4lbxh7mb1',
  },
  {
    value: 'xunfei',
    label: 'iFlytek Open Platform',
    hint: 'Official WebSocket auth/signature flow requires backend signer.',
    supportMode: 'server-gateway',
    docsUrl: 'https://www.xfyun.cn/doc/tts/online_tts/API.html',
  },
  {
    value: 'aliyun',
    label: 'Alibaba Cloud NLS',
    hint: 'Official token/signature flow recommended via backend.',
    supportMode: 'server-gateway',
    docsUrl: 'https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis',
  },
  {
    value: 'tencent',
    label: 'Tencent Cloud',
    hint: 'Official API requires TC3-HMAC-SHA256 signature.',
    supportMode: 'server-gateway',
    docsUrl: 'https://cloud.tencent.com/document/product/1073/37995',
  },
  {
    value: 'huawei',
    label: 'Huawei Cloud',
    hint: 'Official API uses AK/SK request signature.',
    supportMode: 'server-gateway',
    docsUrl: 'https://support.huaweicloud.com/intl/en-us/api-sis/sis_03_0111.html',
  },
  {
    value: 'volcengine',
    label: 'Volcengine',
    hint: 'Official API uses signed authorization flow.',
    supportMode: 'server-gateway',
    docsUrl: 'https://www.volcengine.com/docs/6561/1257584',
  },
  {
    value: 'custom',
    label: 'Custom (OpenAI Compatible)',
    hint: 'Any OpenAI-compatible gateway endpoint.',
    supportMode: 'browser-direct',
    docsUrl: 'https://platform.openai.com/docs/guides/text-to-speech',
  },
];

export const TTS_AUDIO_FORMAT_OPTIONS: { value: TtsAudioFormatPreference; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'opus', label: 'Opus' },
];

export const RSS_REFRESH_INTERVAL_OPTIONS: {
  value: RssRefreshIntervalPreference;
  label: string;
}[] = [
  { value: 5, label: '5m' },
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '60m' },
];

export const DEVELOPER_LOG_LEVEL_OPTIONS: {
  value: DeveloperLogLevelPreference;
  label: string;
}[] = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
];

const THEME_KEY = 'rss-theme';
const INTERFACE_LANGUAGE_KEY = 'rss-ui-language';
const THEME_COLOR_KEY = 'rss-theme-color';
const UI_FONT_KEY = 'rss-ui-font';
const ARTICLE_FONT_KEY = 'rss-article-font';
const UI_FONT_CUSTOM_KEY = 'rss-ui-font-custom';
const ARTICLE_FONT_CUSTOM_KEY = 'rss-article-font-custom';
const LEGACY_FONT_KEY = 'rss-font';
const SIZE_KEY = 'rss-size';
const RSS_REFRESH_INTERVAL_KEY = 'rss-refresh-interval-minutes';
const DEVELOPER_LOG_ENABLED_KEY = 'rss-developer-log-enabled';
const DEVELOPER_LOG_LEVEL_KEY = 'rss-developer-log-level';
const AI_ENABLED_KEY = 'rss-ai-enabled';
const AI_SUMMARY_KEY = 'rss-ai-summary-enabled';
const AI_TRANSLATION_KEY = 'rss-ai-translation-enabled';
const AI_API_BASE_KEY = 'rss-ai-api-base';
const AI_API_KEY_KEY = 'rss-ai-api-key';
const AI_MODEL_KEY = 'rss-ai-model';
const AI_SUMMARY_LANGUAGE_KEY = 'rss-ai-summary-language';
const TRANSLATION_TARGET_KEY = 'rss-translation-target';
const TRANSLATION_OUTPUT_KEY = 'rss-translation-output';
const TTS_AUTHOR_KEY = 'rss-tts-author';
const TTS_SOURCE_KEY = 'rss-tts-source';
const TTS_PROVIDER_KEY = 'rss-tts-provider';
const TTS_API_BASE_KEY = 'rss-tts-api-base';
const TTS_API_KEY_KEY = 'rss-tts-api-key';
const TTS_API_SECRET_KEY = 'rss-tts-api-secret';
const TTS_REGION_KEY = 'rss-tts-region';
const TTS_PROJECT_ID_KEY = 'rss-tts-project-id';
const TTS_APP_ID_KEY = 'rss-tts-app-id';
const TTS_MODEL_KEY = 'rss-tts-model';
const TTS_VOICE_KEY = 'rss-tts-voice';
const TTS_AUDIO_FORMAT_KEY = 'rss-tts-audio-format';
const storageValueCache = new Map<string, string | null>();
const STORAGE_CACHE_SYNC_FLAG = '__rssive_storage_cache_sync_bound__';

if (typeof window !== 'undefined') {
  const runtimeWindow = window as Window & { [STORAGE_CACHE_SYNC_FLAG]?: boolean };
  if (!runtimeWindow[STORAGE_CACHE_SYNC_FLAG]) {
    runtimeWindow[STORAGE_CACHE_SYNC_FLAG] = true;
    window.addEventListener('storage', event => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key == null) {
        storageValueCache.clear();
        return;
      }
      storageValueCache.set(event.key, event.newValue);
    });
  }
}

const readStorage = (key: string) => {
  if (storageValueCache.has(key)) {
    return storageValueCache.get(key) ?? null;
  }
  try {
    const value = localStorage.getItem(key);
    storageValueCache.set(key, value);
    return value;
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  const cached = storageValueCache.get(key);
  if (cached === value) {
    return;
  }
  try {
    const stored = localStorage.getItem(key);
    if (stored === value) {
      storageValueCache.set(key, value);
      return;
    }
    localStorage.setItem(key, value);
    storageValueCache.set(key, value);
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

export const getThemePreference = (): ThemePreference => {
  const stored = readStorage(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

export const setThemePreference = (theme: ThemePreference) => {
  writeStorage(THEME_KEY, theme);
};

export const getInterfaceLanguagePreference = (): InterfaceLanguagePreference => {
  const stored = readStorage(INTERFACE_LANGUAGE_KEY);
  if (stored === 'en-US' || stored === 'zh-CN') return stored;
  if (typeof navigator !== 'undefined') {
    const preferred = (navigator.language || '').toLowerCase();
    if (preferred.startsWith('zh')) return 'zh-CN';
  }
  return 'en-US';
};

export const setInterfaceLanguagePreference = (language: InterfaceLanguagePreference) => {
  writeStorage(INTERFACE_LANGUAGE_KEY, language);
};

export const applyThemePreference = (theme: ThemePreference) => {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

export const getThemeColorPreference = (): ThemeColorPreference => {
  const stored = readStorage(THEME_COLOR_KEY);
  if (stored && THEME_COLOR_OPTIONS.some(option => option.value === stored)) {
    return stored as ThemeColorPreference;
  }
  return 'indigo';
};

export const setThemeColorPreference = (themeColor: ThemeColorPreference) => {
  writeStorage(THEME_COLOR_KEY, themeColor);
};

export const applyThemeColorPreference = (themeColor: ThemeColorPreference) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.getAttribute('data-rss-accent') === themeColor) return;
  root.setAttribute('data-rss-accent', themeColor);
};

export const getUiFontPreference = (): UiFontPreference => {
  const stored = readStorage(UI_FONT_KEY);
  if (stored === 'sans' || stored === 'serif' || stored === 'custom') return stored;
  return 'sans';
};

export const setUiFontPreference = (value: UiFontPreference) => {
  writeStorage(UI_FONT_KEY, value);
};

export const getUiFontCustomPreference = (): string => {
  return readStorage(UI_FONT_CUSTOM_KEY) ?? '';
};

export const setUiFontCustomPreference = (value: string) => {
  writeStorage(UI_FONT_CUSTOM_KEY, value.trim());
};

export const applyUiFontPreference = (value: UiFontPreference, customFontStack = '') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalizedStack = customFontStack.trim();
  if (root.getAttribute('data-rss-ui-font') !== value) {
    root.setAttribute('data-rss-ui-font', value);
  }
  if (value === 'custom' && normalizedStack) {
    const nextFontValue = `${normalizedStack}, var(--font-sans)`;
    if (root.style.getPropertyValue('--font-ui').trim() !== nextFontValue) {
      root.style.setProperty('--font-ui', nextFontValue);
    }
    return;
  }
  if (root.style.getPropertyValue('--font-ui')) {
    root.style.removeProperty('--font-ui');
  }
};

export const getArticleFontPreference = (): ArticleFontPreference => {
  const stored = readStorage(ARTICLE_FONT_KEY);
  if (stored === 'sans' || stored === 'serif' || stored === 'custom') return stored;
  const legacyStored = readStorage(LEGACY_FONT_KEY);
  if (legacyStored === 'sans' || legacyStored === 'serif') return legacyStored;
  return 'serif';
};

export const setArticleFontPreference = (value: ArticleFontPreference) => {
  writeStorage(ARTICLE_FONT_KEY, value);
};

export const getArticleFontCustomPreference = (): string => {
  return readStorage(ARTICLE_FONT_CUSTOM_KEY) ?? '';
};

export const setArticleFontCustomPreference = (value: string) => {
  writeStorage(ARTICLE_FONT_CUSTOM_KEY, value.trim());
};

export const applyArticleFontPreference = (value: ArticleFontPreference, customFontStack = '') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalizedStack = customFontStack.trim();
  if (root.getAttribute('data-rss-article-font') !== value) {
    root.setAttribute('data-rss-article-font', value);
  }
  if (value === 'custom' && normalizedStack) {
    const nextFontValue = `${normalizedStack}, var(--font-serif)`;
    if (root.style.getPropertyValue('--font-article').trim() !== nextFontValue) {
      root.style.setProperty('--font-article', nextFontValue);
    }
    return;
  }
  if (root.style.getPropertyValue('--font-article')) {
    root.style.removeProperty('--font-article');
  }
};

export const getFontFamilyPreference = (): FontFamilyPreference => {
  return getArticleFontPreference();
};

export const setFontFamilyPreference = (value: FontFamilyPreference) => {
  setArticleFontPreference(value);
};

export const getFontSizePreference = (): FontSizePreference => {
  const stored = readStorage(SIZE_KEY);
  if (stored === 'small' || stored === 'medium' || stored === 'large') return stored;
  return 'medium';
};

export const setFontSizePreference = (value: FontSizePreference) => {
  writeStorage(SIZE_KEY, value);
};

export const getRssRefreshIntervalPreference = (): RssRefreshIntervalPreference => {
  const stored = Number(readStorage(RSS_REFRESH_INTERVAL_KEY));
  if (RSS_REFRESH_INTERVAL_OPTIONS.some(option => option.value === stored)) {
    return stored as RssRefreshIntervalPreference;
  }
  return 15;
};

export const setRssRefreshIntervalPreference = (value: RssRefreshIntervalPreference) => {
  writeStorage(RSS_REFRESH_INTERVAL_KEY, String(value));
};

export const getDeveloperLogEnabledPreference = (): boolean => {
  const stored = readStorage(DEVELOPER_LOG_ENABLED_KEY);
  return stored === 'true';
};

export const setDeveloperLogEnabledPreference = (value: boolean) => {
  writeStorage(DEVELOPER_LOG_ENABLED_KEY, String(value));
};

export const getDeveloperLogLevelPreference = (): DeveloperLogLevelPreference => {
  const stored = readStorage(DEVELOPER_LOG_LEVEL_KEY);
  if (stored && DEVELOPER_LOG_LEVEL_OPTIONS.some(option => option.value === stored)) {
    return stored as DeveloperLogLevelPreference;
  }
  return 'info';
};

export const setDeveloperLogLevelPreference = (value: DeveloperLogLevelPreference) => {
  writeStorage(DEVELOPER_LOG_LEVEL_KEY, value);
};

export const getAiEnabledPreference = (): boolean => {
  const stored = readStorage(AI_ENABLED_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return true;
};

export const setAiEnabledPreference = (value: boolean) => {
  writeStorage(AI_ENABLED_KEY, String(value));
};

export const getAiSummaryPreference = (): boolean => {
  const stored = readStorage(AI_SUMMARY_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return true;
};

export const setAiSummaryPreference = (value: boolean) => {
  writeStorage(AI_SUMMARY_KEY, String(value));
};

export const getAiTranslationPreference = (): boolean => {
  const stored = readStorage(AI_TRANSLATION_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return true;
};

export const setAiTranslationPreference = (value: boolean) => {
  writeStorage(AI_TRANSLATION_KEY, String(value));
};

export const getAiApiBasePreference = (): string => {
  return readStorage(AI_API_BASE_KEY) ?? '';
};

export const setAiApiBasePreference = (value: string) => {
  writeStorage(AI_API_BASE_KEY, value.trim());
};

export const getAiApiKeyPreference = (): string => {
  return readStorage(AI_API_KEY_KEY) ?? '';
};

export const setAiApiKeyPreference = (value: string) => {
  writeStorage(AI_API_KEY_KEY, value.trim());
};

export const getAiModelPreference = (): string => {
  return readStorage(AI_MODEL_KEY) ?? '';
};

export const setAiModelPreference = (value: string) => {
  writeStorage(AI_MODEL_KEY, value.trim());
};

export const getSummaryLanguagePreference = (): SummaryLanguagePreference => {
  const stored = readStorage(AI_SUMMARY_LANGUAGE_KEY);
  if (stored && SUMMARY_LANGUAGE_OPTIONS.some(option => option.value === stored)) {
    return stored as SummaryLanguagePreference;
  }
  return 'en';
};

export const setSummaryLanguagePreference = (value: SummaryLanguagePreference) => {
  writeStorage(AI_SUMMARY_LANGUAGE_KEY, value);
};

export const getTranslationTargetPreference = (): TranslationTargetPreference => {
  const stored = readStorage(TRANSLATION_TARGET_KEY);
  if (stored && TRANSLATION_TARGET_OPTIONS.some(option => option.value === stored)) {
    return stored as TranslationTargetPreference;
  }
  return 'en';
};

export const setTranslationTargetPreference = (value: TranslationTargetPreference) => {
  writeStorage(TRANSLATION_TARGET_KEY, value);
};

export const getTranslationOutputPreference = (): TranslationOutputPreference => {
  const stored = readStorage(TRANSLATION_OUTPUT_KEY);
  if (stored && TRANSLATION_OUTPUT_OPTIONS.some(option => option.value === stored)) {
    return stored as TranslationOutputPreference;
  }
  return 'full';
};

export const setTranslationOutputPreference = (value: TranslationOutputPreference) => {
  writeStorage(TRANSLATION_OUTPUT_KEY, value);
};

export const getTtsIncludeAuthorPreference = (): boolean => {
  const stored = readStorage(TTS_AUTHOR_KEY);
  return stored === 'true';
};

export const setTtsIncludeAuthorPreference = (value: boolean) => {
  writeStorage(TTS_AUTHOR_KEY, String(value));
};

export const getTtsIncludeSourcePreference = (): boolean => {
  const stored = readStorage(TTS_SOURCE_KEY);
  return stored === 'true';
};

export const setTtsIncludeSourcePreference = (value: boolean) => {
  writeStorage(TTS_SOURCE_KEY, String(value));
};

export const getTtsProviderPreference = (): TtsProviderPreference => {
  const stored = readStorage(TTS_PROVIDER_KEY);
  if (stored && TTS_PROVIDER_OPTIONS.some(option => option.value === stored)) {
    return stored as TtsProviderPreference;
  }
  return 'openai';
};

export const setTtsProviderPreference = (value: TtsProviderPreference) => {
  writeStorage(TTS_PROVIDER_KEY, value);
};

export const getTtsApiBasePreference = (): string => {
  return readStorage(TTS_API_BASE_KEY) ?? '';
};

export const setTtsApiBasePreference = (value: string) => {
  writeStorage(TTS_API_BASE_KEY, value.trim());
};

export const getTtsApiKeyPreference = (): string => {
  return readStorage(TTS_API_KEY_KEY) ?? '';
};

export const setTtsApiKeyPreference = (value: string) => {
  writeStorage(TTS_API_KEY_KEY, value.trim());
};

export const getTtsApiSecretPreference = (): string => {
  return readStorage(TTS_API_SECRET_KEY) ?? '';
};

export const setTtsApiSecretPreference = (value: string) => {
  writeStorage(TTS_API_SECRET_KEY, value.trim());
};

export const getTtsRegionPreference = (): string => {
  return readStorage(TTS_REGION_KEY) ?? '';
};

export const setTtsRegionPreference = (value: string) => {
  writeStorage(TTS_REGION_KEY, value.trim());
};

export const getTtsProjectIdPreference = (): string => {
  return readStorage(TTS_PROJECT_ID_KEY) ?? '';
};

export const setTtsProjectIdPreference = (value: string) => {
  writeStorage(TTS_PROJECT_ID_KEY, value.trim());
};

export const getTtsAppIdPreference = (): string => {
  return readStorage(TTS_APP_ID_KEY) ?? '';
};

export const setTtsAppIdPreference = (value: string) => {
  writeStorage(TTS_APP_ID_KEY, value.trim());
};

export const getTtsModelPreference = (): string => {
  return readStorage(TTS_MODEL_KEY) ?? '';
};

export const setTtsModelPreference = (value: string) => {
  writeStorage(TTS_MODEL_KEY, value.trim());
};

export const getTtsVoicePreference = (): string => {
  return readStorage(TTS_VOICE_KEY) ?? '';
};

export const setTtsVoicePreference = (value: string) => {
  writeStorage(TTS_VOICE_KEY, value.trim());
};

export const getTtsAudioFormatPreference = (): TtsAudioFormatPreference => {
  const stored = readStorage(TTS_AUDIO_FORMAT_KEY);
  if (stored === 'wav' || stored === 'opus' || stored === 'mp3') return stored;
  return 'mp3';
};

export const setTtsAudioFormatPreference = (value: TtsAudioFormatPreference) => {
  writeStorage(TTS_AUDIO_FORMAT_KEY, value);
};

