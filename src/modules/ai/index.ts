import { getCachedSummary, getCachedTranslation, setCachedSummary, setCachedTranslation } from '../offline';
import {
  createOpenAiCompatibleProvider,
  probeOpenAiCompatibleConnection,
  ProviderRequestError,
} from './provider';
import type {
  AiProviderConfig,
  AiSummaryInput,
  AiTaskError,
  AiTaskErrorCode,
  AiTaskLog,
  AiTaskStatus,
  AiTaskType,
  AiTranslationInput,
  TranslationLanguage,
  TranslationOutputStyle,
} from './types';

const provider = createOpenAiCompatibleProvider();
const DEFAULT_TIMEOUT_MS = 20_000;
const getNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

export type AiConnectionProbeResult = {
  model: string;
  latencyMs: number;
};

const createAiTaskError = ({
  message,
  code,
  retryable,
  status,
  cause,
}: {
  message: string;
  code: AiTaskErrorCode;
  retryable: boolean;
  status?: number;
  cause?: unknown;
}) => {
  const error = new Error(message) as AiTaskError;
  error.name = 'AiTaskError';
  error.code = code;
  error.retryable = retryable;
  if (typeof status === 'number') error.status = status;
  if (cause !== undefined) error.cause = cause;
  return error;
};

const isAbortError = (error: unknown) => (error as { name?: string })?.name === 'AbortError';

const isAiTaskError = (error: unknown): error is AiTaskError => {
  return (
    error instanceof Error
    && typeof (error as AiTaskError).code === 'string'
    && typeof (error as AiTaskError).retryable === 'boolean'
  );
};

const normalizeTaskError = ({
  error,
  timedOut,
}: {
  error: unknown;
  timedOut: boolean;
}): AiTaskError => {
  if (isAiTaskError(error)) return error;
  if (error instanceof ProviderRequestError) {
    return createAiTaskError({
      message: error.message,
      code: error.code,
      retryable: error.retryable,
      status: error.status,
      cause: error,
    });
  }
  if (isAbortError(error)) {
    return createAiTaskError({
      message: timedOut ? 'AI request timed out.' : 'AI request cancelled.',
      code: timedOut ? 'timeout' : 'cancelled',
      retryable: false,
      cause: error,
    });
  }
  if (error instanceof TypeError) {
    return createAiTaskError({
      message: 'AI request failed due to network error.',
      code: 'network',
      retryable: true,
      cause: error,
    });
  }
  return createAiTaskError({
    message: error instanceof Error ? error.message : 'AI provider failed.',
    code: 'provider',
    retryable: false,
    cause: error,
  });
};

const createTimeoutSignal = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    window.clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', forwardAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    wasTimedOut: () => timedOut,
  };
};

const sleepWithAbort = async (delayMs: number, signal?: AbortSignal) => {
  if (!delayMs) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(createAiTaskError({
        message: 'AI request cancelled.',
        code: 'cancelled',
        retryable: false,
      }));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(createAiTaskError({
          message: 'AI request cancelled.',
          code: 'cancelled',
          retryable: false,
        }));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
};

const computeRetryDelay = (attempt: number, code: AiTaskErrorCode) => {
  const base = code === 'rate_limit' ? 1200 : 700;
  const backoff = base * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return backoff + jitter;
};

const emitLog = ({
  logs,
  onLog,
  task,
  status,
  attempt,
  entryId,
  cacheKey,
  code,
  message,
  httpStatus,
  retryInMs,
}: {
  logs: AiTaskLog[];
  onLog?: (log: AiTaskLog) => void;
  task: AiTaskType;
  status: AiTaskStatus;
  attempt: number;
  entryId: string;
  cacheKey?: string;
  code?: AiTaskErrorCode;
  message: string;
  httpStatus?: number;
  retryInMs?: number;
}) => {
  const log: AiTaskLog = {
    task,
    status,
    attempt,
    entryId,
    cacheKey,
    code,
    message,
    httpStatus,
    retryInMs,
    timestamp: new Date().toISOString(),
  };
  logs.push(log);
  if (onLog) onLog(log);
};

const normalizeConfig = (config: AiProviderConfig) => ({
  apiBase: config.apiBase?.trim() || '',
  apiKey: config.apiKey?.trim() || '',
  model: config.model?.trim() || '',
  timeoutMs: config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS,
});

const runAiTask = async <T>({
  task,
  entryId,
  cacheKey,
  maxRetries,
  signal,
  onLog,
  timeoutMs,
  execute,
}: {
  task: AiTaskType;
  entryId: string;
  cacheKey?: string;
  maxRetries: number;
  signal?: AbortSignal;
  onLog?: (log: AiTaskLog) => void;
  timeoutMs: number;
  execute: (taskSignal: AbortSignal) => Promise<T>;
}) => {
  const logs: AiTaskLog[] = [];
  let attempt = 0;

  while (attempt <= maxRetries) {
    emitLog({
      logs,
      onLog,
      task,
      status: 'requesting',
      attempt: attempt + 1,
      entryId,
      cacheKey,
      message: `${task} request started.`,
    });

    const timeout = createTimeoutSignal(signal, timeoutMs);
    try {
      const data = await execute(timeout.signal);
      timeout.cleanup();
      emitLog({
        logs,
        onLog,
        task,
        status: 'success',
        attempt: attempt + 1,
        entryId,
        cacheKey,
        message: `${task} request succeeded.`,
      });
      return { data, logs };
    } catch (error) {
      const timedOut = timeout.wasTimedOut();
      timeout.cleanup();
      const taskError = normalizeTaskError({ error, timedOut });
      if (taskError.code === 'cancelled') {
        emitLog({
          logs,
          onLog,
          task,
          status: 'cancelled',
          attempt: attempt + 1,
          entryId,
          cacheKey,
          code: taskError.code,
          message: taskError.message,
          httpStatus: taskError.status,
        });
        throw taskError;
      }

      const shouldRetry = taskError.retryable && attempt < maxRetries;
      if (!shouldRetry) {
        emitLog({
          logs,
          onLog,
          task,
          status: 'failure',
          attempt: attempt + 1,
          entryId,
          cacheKey,
          code: taskError.code,
          message: taskError.message,
          httpStatus: taskError.status,
        });
        throw taskError;
      }

      const retryInMs = computeRetryDelay(attempt, taskError.code);
      emitLog({
        logs,
        onLog,
        task,
        status: 'retrying',
        attempt: attempt + 1,
        entryId,
        cacheKey,
        code: taskError.code,
        message: `${taskError.message} Retrying.`,
        httpStatus: taskError.status,
        retryInMs,
      });
      attempt += 1;
      await sleepWithAbort(retryInMs, signal);
    }
  }

  throw createAiTaskError({
    message: `${task} request failed.`,
    code: 'provider',
    retryable: false,
  });
};

export const buildSummaryCacheKey = ({
  entryId,
  model,
  targetLanguage = 'en',
  providerName = provider.name,
}: {
  entryId: string | number;
  model: string;
  targetLanguage?: TranslationLanguage;
  providerName?: string;
}) => `summary:${entryId}:${providerName}:${(model || 'default').trim().toLowerCase()}:${targetLanguage}`;

export const buildTranslationCacheKey = ({
  entryId,
  targetLanguage,
  outputStyle,
  model,
  providerName = provider.name,
}: {
  entryId: string | number;
  targetLanguage: TranslationLanguage;
  outputStyle: TranslationOutputStyle;
  model: string;
  providerName?: string;
}) => `translation:${entryId}:${providerName}:${(model || 'default').trim().toLowerCase()}:${targetLanguage}:${outputStyle}`;

export const loadCachedSummary = async (cacheKey: string) => {
  return await getCachedSummary(cacheKey);
};

export const loadCachedTranslation = async (cacheKey: string) => {
  return await getCachedTranslation(cacheKey);
};

export const probeAiConnection = async (
  {
    config,
    signal,
  }: {
    config: AiProviderConfig;
    signal?: AbortSignal;
  },
): Promise<AiConnectionProbeResult> => {
  const normalizedConfig = normalizeConfig(config);
  const startedAt = getNow();
  await runAiTask({
    task: 'summary',
    entryId: '__ai_probe__',
    maxRetries: 0,
    signal,
    timeoutMs: normalizedConfig.timeoutMs,
    execute: (taskSignal) => probeOpenAiCompatibleConnection({
      config: normalizedConfig,
      signal: taskSignal,
    }),
  });
  const latencyMs = Math.max(0, Math.round(getNow() - startedAt));
  return {
    model: normalizedConfig.model,
    latencyMs,
  };
};

export const generateSummaryWithRetry = async (
  input: AiSummaryInput,
  {
    config,
    maxRetries = 2,
    cacheKey,
    force = false,
    signal,
    onLog,
  }: {
    config: AiProviderConfig;
    maxRetries?: number;
    cacheKey?: string;
    force?: boolean;
    signal?: AbortSignal;
    onLog?: (log: AiTaskLog) => void;
  },
) => {
  const normalizedConfig = normalizeConfig(config);
  const key = cacheKey ?? buildSummaryCacheKey({
    entryId: input.id,
    model: normalizedConfig.model,
    targetLanguage: input.targetLanguage || 'en',
  });
  if (!force) {
    const cached = await getCachedSummary(key);
    if (cached) return cached;
  }

  const result = await runAiTask({
    task: 'summary',
    entryId: input.id,
    cacheKey: key,
    maxRetries,
    signal,
    onLog,
    timeoutMs: normalizedConfig.timeoutMs,
    execute: (taskSignal) => provider.summarize(input, { config: normalizedConfig, signal: taskSignal }),
  });

  const entryId = Number.isFinite(Number(input.id)) ? Number(input.id) : 0;
  try {
    await setCachedSummary(key, entryId, result.data);
  } catch {
    // Ignore cache write failures.
  }
  return result.data;
};

export const generateTranslationWithRetry = async (
  input: AiTranslationInput,
  {
    config,
    maxRetries = 2,
    cacheKey,
    force = false,
    signal,
    onLog,
  }: {
    config: AiProviderConfig;
    maxRetries?: number;
    cacheKey?: string;
    force?: boolean;
    signal?: AbortSignal;
    onLog?: (log: AiTaskLog) => void;
  },
) => {
  const normalizedConfig = normalizeConfig(config);
  const outputStyle = input.outputStyle ?? 'full';
  const key = cacheKey
    ?? buildTranslationCacheKey({
      entryId: input.id,
      targetLanguage: input.targetLanguage,
      outputStyle,
      model: normalizedConfig.model,
    });

  if (!force) {
    const cached = await getCachedTranslation(key);
    if (cached) return cached;
  }

  const result = await runAiTask({
    task: 'translation',
    entryId: input.id,
    cacheKey: key,
    maxRetries,
    signal,
    onLog,
    timeoutMs: normalizedConfig.timeoutMs,
    execute: (taskSignal) => provider.translate({
      ...input,
      outputStyle,
    }, { config: normalizedConfig, signal: taskSignal }),
  });

  const entryId = Number.isFinite(Number(input.id)) ? Number(input.id) : 0;
  try {
    await setCachedTranslation(key, entryId, result.data);
  } catch {
    // Ignore cache write failures.
  }
  return result.data;
};

export { isAiTaskError };
export type { AiTaskError, AiTaskLog, AiTaskStatus };
