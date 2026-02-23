export type AiSummary = {
  summary: string;
  keyPoints: string[];
  sentiment: string;
  questions: string[];
  model: string;
  createdAt: string;
};

export type AiSummaryInput = {
  id: string;
  title: string;
  content: string;
  summary?: string;
  targetLanguage?: TranslationLanguage;
};

export type TranslationLanguage = 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es';
export type TranslationSourceLanguage = TranslationLanguage | 'auto';
export type TranslationOutputStyle = 'full' | 'brief' | 'bullet';

export type AiTranslation = {
  text: string;
  html?: string;
  bullets?: string[];
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  outputStyle: TranslationOutputStyle;
  model: string;
  createdAt: string;
};

export type AiTranslationInput = {
  id: string;
  title: string;
  content: string;
  summary?: string;
  sourceLanguage?: TranslationSourceLanguage;
  targetLanguage: TranslationLanguage;
  outputStyle?: TranslationOutputStyle;
};

export type AiTaskType = 'summary' | 'translation';
export type AiTaskStatus = 'requesting' | 'success' | 'failure' | 'retrying' | 'cancelled';
export type AiTaskErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'empty_result'
  | 'network'
  | 'invalid_config'
  | 'cancelled'
  | 'provider';

export type AiProviderConfig = {
  apiBase?: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
};

export type AiTaskLog = {
  task: AiTaskType;
  status: AiTaskStatus;
  attempt: number;
  entryId: string;
  cacheKey?: string;
  code?: AiTaskErrorCode;
  message: string;
  httpStatus?: number;
  retryInMs?: number;
  timestamp: string;
};

export type AiTaskError = Error & {
  code: AiTaskErrorCode;
  retryable: boolean;
  status?: number;
  cause?: unknown;
};

export type AiProviderContext = {
  config: AiProviderConfig;
  signal?: AbortSignal;
};

export type AiProvider = {
  name: string;
  summarize: (input: AiSummaryInput, context: AiProviderContext) => Promise<AiSummary>;
  translate: (input: AiTranslationInput, context: AiProviderContext) => Promise<AiTranslation>;
};
