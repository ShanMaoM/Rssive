import type {
  AiProvider,
  AiProviderConfig,
  AiSummary,
  AiSummaryInput,
  AiTaskErrorCode,
  AiTranslation,
  AiTranslationInput,
  TranslationLanguage,
  TranslationOutputStyle,
} from './types';
import { requestAiChatCompletionWithRuntime } from '../../shared/services/runtimeGateway';

const DEFAULT_API_BASE = 'https://api.openai.com/v1';

class ProviderRequestError extends Error {
  code: AiTaskErrorCode;
  retryable: boolean;
  status?: number;

  constructor(message: string, options: { code: AiTaskErrorCode; retryable: boolean; status?: number }) {
    super(message);
    this.name = 'ProviderRequestError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

const normalizeApiBase = (base?: string) => {
  const value = (base || DEFAULT_API_BASE).trim();
  if (!value) return DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
};

const stripHtml = (html: string) => {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const truncate = (text: string, maxLength: number) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

const parseJsonFromContent = (content: string) => {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    // Continue with relaxed extraction.
  }
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const sliced = content.slice(first, last + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    return null;
  }
};

const toStringList = (value: unknown, limit: number, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
  return list.length ? list : fallback;
};

const detectLanguage = (text: string): TranslationLanguage => {
  const sample = text || '';
  const hasHiragana = /[\u3040-\u309F]/.test(sample);
  const hasKatakana = /[\u30A0-\u30FF]/.test(sample);
  if (hasHiragana || hasKatakana) return 'ja';
  const hasHangul = /[\uAC00-\uD7AF]/.test(sample);
  if (hasHangul) return 'ko';
  const cjkCount = (sample.match(/[\u4E00-\u9FFF]/g) || []).length;
  const latinCount = (sample.match(/[A-Za-z]/g) || []).length;
  if (cjkCount > latinCount) return 'zh';
  if (latinCount > 0) return 'en';
  return 'en';
};

const LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  en: 'English',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
};

const normalizeLanguage = (value: unknown, fallback: TranslationLanguage): TranslationLanguage => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'en'
    || normalized === 'zh'
    || normalized === 'ja'
    || normalized === 'ko'
    || normalized === 'fr'
    || normalized === 'de'
    || normalized === 'es'
  ) {
    return normalized;
  }
  return fallback;
};

const normalizeOutputStyle = (value: unknown, fallback: TranslationOutputStyle): TranslationOutputStyle => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'full' || normalized === 'brief' || normalized === 'bullet') {
    return normalized;
  }
  return fallback;
};

const buildSummaryPrompt = (input: AiSummaryInput) => {
  const body = truncate(stripHtml(input.content || ''), 9000);
  const summary = truncate(input.summary || '', 1200);
  const targetLanguage = input.targetLanguage || 'en';
  const targetLanguageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage.toUpperCase();
  return [
    `Title: ${input.title || ''}`,
    `Feed Summary: ${summary}`,
    `Content: ${body}`,
    `Output language: ${targetLanguage} (${targetLanguageName})`,
    'Return JSON only with keys: summary, keyPoints, sentiment, questions.',
    'summary should be concise and practical. keyPoints should contain 3 bullets. questions should contain 2 follow-up questions.',
    'All returned text values must be written in the output language.',
  ].join('\n\n');
};

const buildTranslationPrompt = (input: AiTranslationInput) => {
  const body = truncate(stripHtml(input.content || ''), 9000);
  const summary = truncate(input.summary || '', 1200);
  return [
    `Title: ${input.title || ''}`,
    `Feed Summary: ${summary}`,
    `Content: ${body}`,
    `Target language: ${input.targetLanguage}`,
    `Output style: ${input.outputStyle || 'full'}`,
    'Return JSON only with keys: text, bullets, sourceLanguage, targetLanguage, outputStyle.',
    'If outputStyle is bullet, provide bullets as an array and text as a newline-joined form.',
  ].join('\n\n');
};

const sanitizeTranslatedHtml = (value: string) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (typeof DOMParser === 'undefined') {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .trim();
  }
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  return doc.body.innerHTML.trim();
};

const buildStructuredTranslationPlan = (html: string, maxChars = 9000, maxSegments = 220) => {
  if (!html || typeof DOMParser === 'undefined' || typeof NodeFilter === 'undefined') {
    return {
      segments: [] as string[],
      apply: (_translatedSegments: string[]) => '',
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const entries: { node: Text; source: string }[] = [];
  let totalChars = 0;
  let current = walker.nextNode() as Text | null;

  while (current) {
    const parentTag = current.parentElement?.tagName?.toUpperCase() || '';
    if (parentTag && (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'NOSCRIPT')) {
      current = walker.nextNode() as Text | null;
      continue;
    }

    const normalized = (current.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      current = walker.nextNode() as Text | null;
      continue;
    }

    if (entries.length >= maxSegments) break;
    const nextTotal = totalChars + normalized.length;
    if (entries.length > 0 && nextTotal > maxChars) break;

    entries.push({ node: current, source: normalized });
    totalChars = nextTotal;
    current = walker.nextNode() as Text | null;
  }

  return {
    segments: entries.map(entry => entry.source),
    apply: (translatedSegments: string[]) => {
      if (!translatedSegments.length || !entries.length) return '';
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const replacement = (translatedSegments[index] || entry.source).trim();
        if (!replacement) continue;
        const original = entry.node.nodeValue || '';
        const leading = (original.match(/^\s*/) || [''])[0];
        const trailing = (original.match(/\s*$/) || [''])[0];
        entry.node.nodeValue = `${leading}${replacement}${trailing}`;
      }
      return doc.body.innerHTML.trim();
    },
  };
};

const buildStructuredTranslationPrompt = ({
  input,
  segments,
}: {
  input: AiTranslationInput;
  segments: string[];
}) => {
  const summary = truncate(input.summary || '', 1200);
  return [
    `Title: ${input.title || ''}`,
    `Feed Summary: ${summary}`,
    `Target language: ${input.targetLanguage}`,
    `Output style: ${input.outputStyle || 'full'}`,
    `Segment count: ${segments.length}`,
    'Translate each segment while preserving order and meaning.',
    'Return JSON only with keys: segments, sourceLanguage, targetLanguage, outputStyle.',
    'segments must be an array with exactly the same length as input segments.',
    `Input segments JSON: ${JSON.stringify(segments)}`,
  ].join('\n\n');
};

const normalizeTranslatedSegments = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  if (!value.length) return fallback;
  return fallback.map((source, index) => {
    const raw = value[index];
    if (typeof raw !== 'string') return source;
    const normalized = raw.trim();
    return normalized || source;
  });
};

const parseSummaryResult = (content: string, model: string): AiSummary => {
  const parsed = parseJsonFromContent(content);
  const fallbackSummary = truncate(content.trim(), 320);
  const summary = truncate(typeof parsed?.summary === 'string' ? parsed.summary.trim() : fallbackSummary, 320);
  if (!summary) {
    throw new ProviderRequestError('AI returned empty summary.', {
      code: 'empty_result',
      retryable: false,
    });
  }

  return {
    summary,
    keyPoints: toStringList(parsed?.keyPoints, 3, ['No key points returned.']),
    sentiment: typeof parsed?.sentiment === 'string' && parsed.sentiment.trim()
      ? parsed.sentiment.trim()
      : 'Neutral',
    questions: toStringList(parsed?.questions, 2, ['What should be validated next?']),
    model,
    createdAt: new Date().toISOString(),
  };
};

const parseTranslationResult = (
  content: string,
  {
    input,
    model,
    sourceSegments,
    applyStructuredHtml,
  }: {
    input: AiTranslationInput;
    model: string;
    sourceSegments: string[];
    applyStructuredHtml: (translatedSegments: string[]) => string;
  },
): AiTranslation => {
  const parsed = parseJsonFromContent(content);
  const outputStyle = normalizeOutputStyle(parsed?.outputStyle, input.outputStyle || 'full');
  const sourceLanguage = normalizeLanguage(
    parsed?.sourceLanguage,
    input.sourceLanguage && input.sourceLanguage !== 'auto'
      ? input.sourceLanguage
      : detectLanguage(content),
  );
  const targetLanguage = normalizeLanguage(parsed?.targetLanguage, input.targetLanguage);
  const rawBullets = toStringList(parsed?.bullets, 6, []);
  const structuredSegments = normalizeTranslatedSegments(parsed?.segments, sourceSegments);
  const structuredHtml = applyStructuredHtml(structuredSegments);
  const providerHtml = typeof parsed?.html === 'string' ? sanitizeTranslatedHtml(parsed.html) : '';
  const html = structuredHtml || providerHtml;
  const text = typeof parsed?.text === 'string' ? parsed.text.trim() : content.trim();
  const normalizedText = truncate(text, 5000);
  const htmlText = truncate(stripHtml(html), 5000);
  const bullets = outputStyle === 'bullet'
    ? (rawBullets.length ? rawBullets : normalizedText.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 6))
    : undefined;

  const finalText = outputStyle === 'bullet'
    ? (bullets?.join('\n') || normalizedText)
    : (htmlText || normalizedText);
  if (!finalText && !html) {
    throw new ProviderRequestError('AI returned empty translation.', {
      code: 'empty_result',
      retryable: false,
    });
  }

  return {
    text: finalText || truncate(stripHtml(html), 5000),
    html: html || undefined,
    bullets,
    sourceLanguage,
    targetLanguage,
    outputStyle,
    model,
    createdAt: new Date().toISOString(),
  };
};

const ensureProviderConfig = (config: AiProviderConfig) => {
  if (!config.model || !config.model.trim()) {
    throw new ProviderRequestError('AI model is required.', {
      code: 'invalid_config',
      retryable: false,
    });
  }
};

const requestChatCompletion = async ({
  config,
  signal,
  systemPrompt,
  userPrompt,
}: {
  config: AiProviderConfig;
  signal?: AbortSignal;
  systemPrompt: string;
  userPrompt: string;
}) => {
  ensureProviderConfig(config);
  const apiBase = normalizeApiBase(config.apiBase);
  let completion: DesktopAiChatCompletionResult;
  try {
    completion = await requestAiChatCompletionWithRuntime({
      apiBase,
      apiKey: config.apiKey,
      model: config.model.trim(),
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      timeoutMs: config.timeoutMs,
      signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    throw new ProviderRequestError('AI request failed due to network issues.', {
      code: 'network',
      retryable: true,
    });
  }

  if (!completion.ok) {
    const errorText = (completion.error || '').trim();
    if (completion.status === 401 || completion.status === 403) {
      throw new ProviderRequestError(errorText || 'AI authentication failed.', {
        code: 'auth',
        retryable: false,
        status: completion.status,
      });
    }
    if (completion.status === 429) {
      throw new ProviderRequestError(errorText || 'AI rate limit reached.', {
        code: 'rate_limit',
        retryable: true,
        status: completion.status,
      });
    }
    throw new ProviderRequestError(
      errorText || `AI request failed with status ${completion.status}.`,
      {
        code: 'provider',
        retryable: completion.status >= 500 || completion.status === 408,
        status: completion.status,
      },
    );
  }

  const content = (completion.content || '').trim();
  if (!content) {
    throw new ProviderRequestError('AI returned empty completion content.', {
      code: 'empty_result',
      retryable: false,
    });
  }
  return content;
};

export const probeOpenAiCompatibleConnection = async ({
  config,
  signal,
}: {
  config: AiProviderConfig;
  signal?: AbortSignal;
}) => {
  await requestChatCompletion({
    config,
    signal,
    systemPrompt: 'You are a connection probe. Reply with one short word.',
    userPrompt: 'ping',
  });
  return {
    model: config.model.trim(),
  };
};

export const createOpenAiCompatibleProvider = (): AiProvider => {
  return {
    name: 'openai-compatible',
    summarize: async (input, context) => {
      const content = await requestChatCompletion({
        config: context.config,
        signal: context.signal,
        systemPrompt:
          'You are an assistant that produces concise article summaries. Output strict JSON only, no markdown.',
        userPrompt: buildSummaryPrompt(input),
      });
      return parseSummaryResult(content, context.config.model.trim());
    },
    translate: async (input, context) => {
      const plan = buildStructuredTranslationPlan(input.content || '');
      const content = await requestChatCompletion({
        config: context.config,
        signal: context.signal,
        systemPrompt:
          'You are an assistant that translates article content. Keep meaning accurate. Output strict JSON only, no markdown.',
        userPrompt: plan.segments.length
          ? buildStructuredTranslationPrompt({ input, segments: plan.segments })
          : buildTranslationPrompt(input),
      });
      return parseTranslationResult(content, {
        input,
        model: context.config.model.trim(),
        sourceSegments: plan.segments,
        applyStructuredHtml: plan.apply,
      });
    },
  };
};

export { ProviderRequestError };
