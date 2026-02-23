import type {
  TtsAudioFormatPreference,
  TtsProviderPreference,
  TtsProviderSupportMode,
} from '../../shared/state/preferences';
import { getRuntimeProxyBase, requestWithRuntimeProxy } from '../../shared/services/runtimeGateway';

type SpeechHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onError?: (error: Error) => void;
};

export type CloudTtsConfig = {
  provider: TtsProviderPreference;
  apiKey: string;
  apiSecret?: string;
  apiBase?: string;
  model?: string;
  voice?: string;
  format?: TtsAudioFormatPreference;
  speed?: number;
  chunkSize?: number;
  region?: string;
  projectId?: string;
  appId?: string;
};

type ResolvedCloudTtsConfig = {
  provider: TtsProviderPreference;
  apiKey: string;
  apiSecret: string;
  apiBase: string;
  model: string;
  voice: string;
  format: TtsAudioFormatPreference;
  speed?: number;
  chunkSize: number;
  region: string;
  projectId: string;
  appId: string;
};

type TtsTextInput = {
  title?: string;
  author?: string;
  source?: string;
  contentHtml?: string;
  summaryText?: string;
  excludeSummary?: boolean;
  includeAuthor?: boolean;
  includeSource?: boolean;
};

type ProviderAdapter =
  | 'openai-speech'
  | 'elevenlabs'
  | 'qwen-dashscope-tts'
  | 'azure-speech-rest'
  | 'google-tts-rest'
  | 'ibm-tts-rest'
  | 'baidu-tts-rest'
  | 'server-gateway-required';

type ProviderFieldName =
  | 'apiBase'
  | 'apiKey'
  | 'apiSecret'
  | 'model'
  | 'voice'
  | 'region'
  | 'projectId'
  | 'appId';

type ProviderFieldMeta = {
  label: string;
  placeholder: string;
};

type ProviderRequiredFields = Partial<Record<ProviderFieldName, boolean>>;

type ProviderRuntime = {
  label: string;
  adapter: ProviderAdapter;
  supportMode: TtsProviderSupportMode;
  docsUrl: string;
  hint: string;
  defaultApiBase?: string;
  defaultModel?: string;
  defaultVoice?: string;
  defaultRegion?: string;
  defaultChunkSize?: number;
  maxChunkSize?: number;
  required: ProviderRequiredFields;
  fieldMeta?: Partial<Record<ProviderFieldName, ProviderFieldMeta>>;
};

export type TtsProviderCapability = {
  provider: TtsProviderPreference;
  label: string;
  adapter: ProviderAdapter;
  supportMode: TtsProviderSupportMode;
  docsUrl: string;
  hint: string;
  required: ProviderRequiredFields;
  fieldMeta: Record<ProviderFieldName, ProviderFieldMeta>;
  defaultApiBase?: string;
  defaultModel?: string;
  defaultVoice?: string;
  defaultRegion?: string;
};

type SynthesisResult = {
  audioUrl: string;
  revoke: () => void;
};
type SynthesisBlobResult = {
  blob: Blob;
};
type TtsChunkCacheEntry = {
  blob: Blob;
  bytes: number;
  createdAt: number;
};

export type TtsConnectionProbeResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const DEFAULT_CHUNK_SIZE = 1800;
const ERROR_PREVIEW_LIMIT = 240;
const QWEN_DEFAULT_API_BASE = 'https://dashscope.aliyuncs.com/api/v1';
const QWEN_MAX_INPUT_BYTES = 600;
const TTS_CHUNK_CACHE_MAX_ENTRIES = 18;
const TTS_CHUNK_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const TTS_CHUNK_CACHE_TTL_MS = 15 * 60_000;
const ttsChunkCache = new Map<string, TtsChunkCacheEntry>();
let ttsChunkCacheBytes = 0;

const DEFAULT_FIELD_META: Record<ProviderFieldName, ProviderFieldMeta> = {
  apiBase: { label: 'API Base URL', placeholder: 'https://api.example.com/v1' },
  apiKey: { label: 'API Key / Token', placeholder: 'api-key-or-token' },
  apiSecret: { label: 'API Secret', placeholder: 'api-secret' },
  model: { label: 'Model', placeholder: 'model-id' },
  voice: { label: 'Voice', placeholder: 'voice-id-or-name' },
  region: { label: 'Region', placeholder: 'us-east-1' },
  projectId: { label: 'Project ID', placeholder: 'my-gcp-project' },
  appId: { label: 'App ID', placeholder: 'app-id' },
};

const PROVIDER_RUNTIME: Record<TtsProviderPreference, ProviderRuntime> = {
  openai: {
    label: 'OpenAI',
    adapter: 'openai-speech',
    supportMode: 'browser-direct',
    docsUrl: 'https://platform.openai.com/docs/guides/text-to-speech',
    hint: 'Uses /v1/audio/speech with Bearer auth.',
    defaultApiBase: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini-tts',
    defaultVoice: 'alloy',
    required: { apiKey: true, model: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'API Key', placeholder: 'sk-...' },
      model: { label: 'Model', placeholder: 'gpt-4o-mini-tts' },
      voice: { label: 'Voice', placeholder: 'alloy' },
    },
  },
  elevenlabs: {
    label: 'ElevenLabs',
    adapter: 'elevenlabs',
    supportMode: 'browser-direct',
    docsUrl: 'https://elevenlabs.io/docs/api-reference/text-to-speech',
    hint: 'Uses /v1/text-to-speech/{voice_id} with xi-api-key.',
    defaultApiBase: 'https://api.elevenlabs.io/v1',
    defaultModel: 'eleven_multilingual_v2',
    defaultVoice: 'EXAVITQu4vr4xnSDxMaL',
    required: { apiKey: true, model: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'XI API Key', placeholder: 'xi-api-key' },
      model: { label: 'Model ID', placeholder: 'eleven_multilingual_v2' },
      voice: { label: 'Voice ID', placeholder: 'EXAVITQu4vr4xnSDxMaL' },
    },
  },
  qwen: {
    label: 'Qwen TTS (DashScope)',
    adapter: 'qwen-dashscope-tts',
    supportMode: 'browser-direct',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-tts-api',
    hint: 'Uses local /fetch/tts/qwen proxy to call DashScope and avoid browser CORS limits.',
    defaultApiBase: QWEN_DEFAULT_API_BASE,
    defaultModel: 'qwen3-tts-flash',
    defaultVoice: 'Cherry',
    defaultChunkSize: 520,
    maxChunkSize: 580,
    required: { apiKey: true, model: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'DashScope API Key', placeholder: 'sk-...' },
      apiBase: { label: 'API Base URL', placeholder: 'https://dashscope.aliyuncs.com/api/v1' },
      model: { label: 'Model', placeholder: 'qwen3-tts-flash' },
      voice: { label: 'Voice', placeholder: 'Cherry' },
    },
  },
  azure: {
    label: 'Azure Cognitive Services',
    adapter: 'azure-speech-rest',
    supportMode: 'browser-direct',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech',
    hint: 'Uses Speech REST /cognitiveservices/v1 and subscription key.',
    defaultRegion: 'eastus',
    defaultVoice: 'en-US-JennyNeural',
    required: { apiKey: true, region: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'Subscription Key', placeholder: 'azure-speech-key' },
      region: { label: 'Region', placeholder: 'eastus' },
      voice: { label: 'Voice Name', placeholder: 'en-US-JennyNeural' },
      apiBase: { label: 'Custom Speech Endpoint (Optional)', placeholder: 'https://eastus.tts.speech.microsoft.com' },
    },
  },
  google: {
    label: 'Google Cloud',
    adapter: 'google-tts-rest',
    supportMode: 'browser-direct',
    docsUrl: 'https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize',
    hint: 'Uses REST text:synthesize with OAuth access token.',
    defaultApiBase: 'https://texttospeech.googleapis.com/v1',
    defaultVoice: 'en-US-Standard-C',
    required: { apiKey: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'OAuth Access Token', placeholder: 'ya29....' },
      voice: { label: 'Voice Name', placeholder: 'en-US-Standard-C' },
      projectId: { label: 'Billing Project (Optional)', placeholder: 'my-gcp-project' },
      apiBase: { label: 'API Base URL', placeholder: 'https://texttospeech.googleapis.com/v1' },
    },
  },
  aws: {
    label: 'AWS Polly',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://docs.aws.amazon.com/polly/latest/dg/API_Reference.html',
    hint: 'Official API requires SigV4 signing; use backend gateway.',
    required: { apiKey: true, apiSecret: true, region: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'Access Key ID', placeholder: 'AKIA...' },
      apiSecret: { label: 'Secret Access Key', placeholder: 'secret' },
      region: { label: 'Region', placeholder: 'us-east-1' },
    },
  },
  ibm: {
    label: 'IBM Watson',
    adapter: 'ibm-tts-rest',
    supportMode: 'browser-direct',
    docsUrl: 'https://cloud.ibm.com/apidocs/text-to-speech',
    hint: 'Uses /v1/synthesize with IAM API key or bearer token.',
    defaultApiBase: 'https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/INSTANCE_ID',
    defaultVoice: 'en-US_AllisonV3Voice',
    required: { apiKey: true, apiBase: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'IAM API Key / Bearer Token', placeholder: 'api-key-or-bearer-token' },
      apiBase: {
        label: 'Service Instance URL',
        placeholder: 'https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/INSTANCE_ID',
      },
      voice: { label: 'Voice', placeholder: 'en-US_AllisonV3Voice' },
    },
  },
  baidu: {
    label: 'Baidu Smart Cloud',
    adapter: 'baidu-tts-rest',
    supportMode: 'browser-direct',
    docsUrl: 'https://ai.baidu.com/ai-doc/SPEECH/4lbxh7mb1',
    hint: 'Uses text2audio with tok(access token) and app/cuid.',
    defaultApiBase: 'https://tsn.baidu.com',
    defaultVoice: '0',
    required: { apiKey: true, appId: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'Access Token (tok)', placeholder: '24.xxxxx' },
      appId: { label: 'App ID / CUID', placeholder: 'baidu-app-id' },
      voice: { label: 'Speaker ID (per)', placeholder: '0' },
      apiBase: { label: 'API Base URL', placeholder: 'https://tsn.baidu.com' },
    },
  },
  xunfei: {
    label: 'iFlytek Open Platform',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://www.xfyun.cn/doc/tts/online_tts/API.html',
    hint: 'Official API uses WebSocket auth/signature; backend signer required.',
    required: { apiKey: true, apiSecret: true, appId: true },
    fieldMeta: {
      appId: { label: 'APPID', placeholder: 'xf-app-id' },
      apiKey: { label: 'APIKey', placeholder: 'xf-api-key' },
      apiSecret: { label: 'APISecret', placeholder: 'xf-api-secret' },
    },
  },
  aliyun: {
    label: 'Alibaba Cloud NLS',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis',
    hint: 'Official flow is token/signature based; backend gateway recommended.',
    required: { apiKey: true, apiSecret: true, appId: true, region: true },
    fieldMeta: {
      apiKey: { label: 'AccessKey ID / Token', placeholder: 'aliyun-access-key-or-token' },
      apiSecret: { label: 'AccessKey Secret', placeholder: 'aliyun-access-key-secret' },
      appId: { label: 'App Key', placeholder: 'aliyun-app-key' },
      region: { label: 'Region', placeholder: 'cn-shanghai' },
    },
  },
  tencent: {
    label: 'Tencent Cloud',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://cloud.tencent.com/document/product/1073/37995',
    hint: 'Official API requires TC3-HMAC-SHA256 request signing.',
    required: { apiKey: true, apiSecret: true, appId: true, region: true },
    fieldMeta: {
      apiKey: { label: 'SecretId', placeholder: 'AKID...' },
      apiSecret: { label: 'SecretKey', placeholder: 'secret-key' },
      appId: { label: 'AppId', placeholder: 'tencent-app-id' },
      region: { label: 'Region', placeholder: 'ap-guangzhou' },
    },
  },
  huawei: {
    label: 'Huawei Cloud',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://support.huaweicloud.com/intl/en-us/api-sis/sis_03_0111.html',
    hint: 'Official API requires AK/SK signature; backend gateway required.',
    required: { apiKey: true, apiSecret: true, region: true },
    fieldMeta: {
      apiKey: { label: 'AK', placeholder: 'huawei-ak' },
      apiSecret: { label: 'SK', placeholder: 'huawei-sk' },
      region: { label: 'Region', placeholder: 'cn-north-4' },
      appId: { label: 'Project ID (Optional)', placeholder: 'project-id' },
    },
  },
  volcengine: {
    label: 'Volcengine',
    adapter: 'server-gateway-required',
    supportMode: 'server-gateway',
    docsUrl: 'https://www.volcengine.com/docs/6561/1257584',
    hint: 'Official API uses signed auth; backend gateway required.',
    required: { apiKey: true, apiSecret: true, appId: true },
    fieldMeta: {
      apiKey: { label: 'Access Key', placeholder: 'volc-ak' },
      apiSecret: { label: 'Secret Key', placeholder: 'volc-sk' },
      appId: { label: 'App ID', placeholder: 'volc-app-id' },
      region: { label: 'Region (Optional)', placeholder: 'cn-beijing' },
    },
  },
  custom: {
    label: 'Custom (OpenAI Compatible)',
    adapter: 'openai-speech',
    supportMode: 'browser-direct',
    docsUrl: 'https://platform.openai.com/docs/guides/text-to-speech',
    hint: 'Any OpenAI-compatible /audio/speech gateway.',
    defaultModel: 'gpt-4o-mini-tts',
    defaultVoice: 'alloy',
    required: { apiKey: true, apiBase: true, model: true, voice: true },
    fieldMeta: {
      apiKey: { label: 'API Key / Token', placeholder: 'token' },
      apiBase: { label: 'API Base URL', placeholder: 'https://api.example.com/v1' },
      model: { label: 'Model', placeholder: 'gpt-4o-mini-tts' },
      voice: { label: 'Voice', placeholder: 'alloy' },
    },
  },
};

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();

const stripHtml = (html: string) => {
  if (!html) return '';
  if (typeof window === 'undefined' || !window.DOMParser) {
    return html.replace(/<[^>]*>/g, ' ');
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body?.textContent || '';
  } catch {
    return html.replace(/<[^>]*>/g, ' ');
  }
};

const splitIntoChunks = (text: string, chunkSize: number) => {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > chunkSize) {
    let sliceIndex = Math.max(
      remaining.lastIndexOf('\u3002', chunkSize),
      remaining.lastIndexOf('\uff01', chunkSize),
      remaining.lastIndexOf('\uff1f', chunkSize),
      remaining.lastIndexOf('.', chunkSize),
      remaining.lastIndexOf('!', chunkSize),
      remaining.lastIndexOf('?', chunkSize),
    );
    if (sliceIndex < chunkSize * 0.5) {
      sliceIndex = remaining.lastIndexOf(' ', chunkSize);
    }
    if (sliceIndex < 0) sliceIndex = chunkSize - 1;
    let endIndex = sliceIndex + 1;
    if (endIndex > chunkSize) endIndex = chunkSize;
    const chunk = remaining.slice(0, endIndex);
    chunks.push(chunk.trim());
    remaining = remaining.slice(endIndex);
  }
  if (remaining.trim()) chunks.push(remaining.trim());
  return chunks;
};

const utf8ByteLength = (value: string) => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
};

const findMaxUtf8PrefixLength = (value: string, maxBytes: number) => {
  let low = 1;
  let high = Math.min(value.length, maxBytes);
  let answer = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const bytes = utf8ByteLength(value.slice(0, mid));
    if (bytes <= maxBytes) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, answer);
};

const splitIntoUtf8Chunks = (text: string, preferredChars: number, maxBytes: number) => {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length) {
    if (utf8ByteLength(remaining) <= maxBytes) {
      chunks.push(remaining.trim());
      break;
    }

    const hardLimit = findMaxUtf8PrefixLength(remaining, maxBytes);
    const preferredLimit = Math.min(Math.max(1, preferredChars), hardLimit);
    let sliceIndex = Math.max(
      remaining.lastIndexOf('\u3002', preferredLimit),
      remaining.lastIndexOf('\uff01', preferredLimit),
      remaining.lastIndexOf('\uff1f', preferredLimit),
      remaining.lastIndexOf('.', preferredLimit),
      remaining.lastIndexOf('!', preferredLimit),
      remaining.lastIndexOf('?', preferredLimit),
      remaining.lastIndexOf('\n', preferredLimit),
    );
    if (sliceIndex < preferredLimit * 0.5) {
      sliceIndex = remaining.lastIndexOf(' ', preferredLimit);
    }
    if (sliceIndex < 0) {
      sliceIndex = hardLimit - 1;
    }

    let endIndex = Math.min(hardLimit, sliceIndex + 1);
    while (endIndex > 1 && utf8ByteLength(remaining.slice(0, endIndex)) > maxBytes) {
      endIndex -= 1;
    }
    if (endIndex <= 0) {
      endIndex = hardLimit;
    }

    const chunk = remaining.slice(0, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
      remaining = remaining.slice(endIndex).trimStart();
      continue;
    }
    remaining = remaining.slice(endIndex);
  }
  return chunks.filter(Boolean);
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/g, '');

const joinUrl = (base: string, path: string) => {
  const normalizedBase = trimTrailingSlash(base);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const toError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) return error;
  return new Error(fallbackMessage);
};

const isOpenAiEndpointPath = (value: string) => {
  const normalized = trimTrailingSlash(value).toLowerCase();
  return (
    normalized.includes('/chat/completions') ||
    normalized.includes('/audio/speech') ||
    normalized.includes('/responses')
  );
};

const normalizeQwenApiBase = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return QWEN_DEFAULT_API_BASE;
  const lowered = normalized.toLowerCase();
  if (lowered.includes('/api-openai/') || isOpenAiEndpointPath(normalized)) {
    return QWEN_DEFAULT_API_BASE;
  }
  return trimTrailingSlash(normalized);
};

const getQwenProxyEndpoint = () => {
  const base = getRuntimeProxyBase();
  return base ? `${base}/fetch/tts/qwen` : '/fetch/tts/qwen';
};

const extractResponseError = async (response: Response) => {
  try {
    const raw = await response.text();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
      if (typeof parsed.error === 'string') return parsed.error;
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      // Fall through and use raw text.
    }
    return raw.slice(0, ERROR_PREVIEW_LIMIT);
  } catch {
    return '';
  }
};

const buildHttpError = async (response: Response, message: string) => {
  const detail = await extractResponseError(response);
  if (!detail) return new Error(`${message} (${response.status})`);
  return new Error(`${message} (${response.status}): ${detail}`);
};

const escapeXml = (text: string) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const inferLanguageCodeFromVoice = (voice: string) => {
  const normalized = normalizeText(voice);
  const match = normalized.match(/^([a-z]{2,3})-([A-Za-z]{2,3})/);
  if (!match) return 'en-US';
  return `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
};

const toAudioMimeType = (format: TtsAudioFormatPreference) => {
  if (format === 'wav') return 'audio/wav';
  if (format === 'opus') return 'audio/ogg';
  return 'audio/mpeg';
};

const toAzureOutputFormat = (format: TtsAudioFormatPreference) => {
  if (format === 'wav') return 'riff-24khz-16bit-mono-pcm';
  if (format === 'opus') return 'ogg-24khz-16bit-mono-opus';
  return 'audio-24khz-48kbitrate-mono-mp3';
};

const toGoogleAudioEncoding = (format: TtsAudioFormatPreference) => {
  if (format === 'wav') return 'LINEAR16';
  if (format === 'opus') return 'OGG_OPUS';
  return 'MP3';
};

const toElevenLabsOutputFormat = (format: TtsAudioFormatPreference) => {
  if (format === 'wav') return 'pcm_44100';
  if (format === 'opus') return 'opus_48000_96';
  return 'mp3_44100_128';
};

const toBaiduAue = (format: TtsAudioFormatPreference) => {
  if (format === 'wav') return '6';
  if (format === 'opus') return '6';
  return '3';
};

const resolveBaiduVoice = (voice: string, model: string) => {
  const candidate = normalizeText(voice || model);
  if (!candidate) return '0';
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed)) return '0';
  return String(Math.max(0, Math.min(parsed, 5118)));
};

const basicAuth = (username: string, password: string) => {
  if (typeof btoa !== 'function') {
    throw new Error('Current runtime does not support Basic auth encoding.');
  }
  return `Basic ${btoa(`${username}:${password}`)}`;
};

const runtimeForProvider = (provider: TtsProviderPreference) => {
  return PROVIDER_RUNTIME[provider] || PROVIDER_RUNTIME.openai;
};

const withRuntimeFieldMeta = (runtime: ProviderRuntime): Record<ProviderFieldName, ProviderFieldMeta> => {
  return {
    apiBase: runtime.fieldMeta?.apiBase || DEFAULT_FIELD_META.apiBase,
    apiKey: runtime.fieldMeta?.apiKey || DEFAULT_FIELD_META.apiKey,
    apiSecret: runtime.fieldMeta?.apiSecret || DEFAULT_FIELD_META.apiSecret,
    model: runtime.fieldMeta?.model || DEFAULT_FIELD_META.model,
    voice: runtime.fieldMeta?.voice || DEFAULT_FIELD_META.voice,
    region: runtime.fieldMeta?.region || DEFAULT_FIELD_META.region,
    projectId: runtime.fieldMeta?.projectId || DEFAULT_FIELD_META.projectId,
    appId: runtime.fieldMeta?.appId || DEFAULT_FIELD_META.appId,
  };
};

export const getTtsProviderLabel = (provider: TtsProviderPreference) => {
  return runtimeForProvider(provider).label;
};

export const getTtsProviderCapability = (provider: TtsProviderPreference): TtsProviderCapability => {
  const runtime = runtimeForProvider(provider);
  return {
    provider,
    label: runtime.label,
    adapter: runtime.adapter,
    supportMode: runtime.supportMode,
    docsUrl: runtime.docsUrl,
    hint: runtime.hint,
    required: runtime.required,
    fieldMeta: withRuntimeFieldMeta(runtime),
    defaultApiBase: runtime.defaultApiBase,
    defaultModel: runtime.defaultModel,
    defaultVoice: runtime.defaultVoice,
    defaultRegion: runtime.defaultRegion,
  };
};

const resolveCloudConfig = (config: CloudTtsConfig): ResolvedCloudTtsConfig => {
  const runtime = runtimeForProvider(config.provider);
  const apiKey = normalizeText(config.apiKey || '');
  const apiSecret = normalizeText(config.apiSecret || '');
  const region = normalizeText(config.region || runtime.defaultRegion || '');
  const providedApiBase = normalizeText(config.apiBase || '');
  const azureDefaultApiBase =
    config.provider === 'azure' && region ? `https://${region}.tts.speech.microsoft.com` : '';
  let apiBase = normalizeText(providedApiBase || runtime.defaultApiBase || azureDefaultApiBase);
  if (config.provider === 'qwen') {
    apiBase = normalizeQwenApiBase(apiBase);
  }
  const model = normalizeText(config.model || runtime.defaultModel || '');
  const voice = normalizeText(config.voice || runtime.defaultVoice || '');
  const format = config.format === 'wav' || config.format === 'opus' ? config.format : 'mp3';
  const speed = typeof config.speed === 'number' && Number.isFinite(config.speed) ? config.speed : undefined;
  const defaultChunkSize = runtime.defaultChunkSize || DEFAULT_CHUNK_SIZE;
  const maxChunkSize = runtime.maxChunkSize || 4000;
  const minChunkSize = config.provider === 'qwen' ? 120 : 400;
  const chunkSize = Math.max(minChunkSize, Math.min(config.chunkSize || defaultChunkSize, maxChunkSize));
  const projectId = normalizeText(config.projectId || '');
  const appId = normalizeText(config.appId || '');
  return {
    provider: config.provider,
    apiKey,
    apiSecret,
    apiBase,
    model,
    voice,
    format,
    speed,
    chunkSize,
    region,
    projectId,
    appId,
  };
};

const validateRequiredField = (
  value: string,
  required: boolean | undefined,
  fieldName: ProviderFieldName,
  capability: TtsProviderCapability,
) => {
  if (!required) return '';
  if (value) return '';
  return `${capability.fieldMeta[fieldName].label} is required for ${capability.label}.`;
};

export const validateCloudTtsConfig = (config: CloudTtsConfig | null | undefined) => {
  if (!config) {
    return { ok: false as const, message: 'Cloud TTS config is missing.' };
  }
  const capability = getTtsProviderCapability(config.provider);
  if (capability.supportMode === 'server-gateway') {
    return {
      ok: false as const,
      message:
        `${capability.label} requires server-side request signing/token flow according to official docs. ` +
        'Please configure a backend gateway and use the Custom/OpenAI-compatible endpoint.',
    };
  }

  const resolved = resolveCloudConfig(config);
  const checks: Array<[string, ProviderFieldName, boolean | undefined]> = [
    [resolved.apiKey, 'apiKey', capability.required.apiKey],
    [resolved.apiSecret, 'apiSecret', capability.required.apiSecret],
    [resolved.apiBase, 'apiBase', capability.required.apiBase],
    [resolved.model, 'model', capability.required.model],
    [resolved.voice, 'voice', capability.required.voice],
    [resolved.region, 'region', capability.required.region],
    [resolved.projectId, 'projectId', capability.required.projectId],
    [resolved.appId, 'appId', capability.required.appId],
  ];
  for (const [value, fieldName, required] of checks) {
    const error = validateRequiredField(value, required, fieldName, capability);
    if (error) return { ok: false as const, message: error };
  }

  if (resolved.provider === 'google' && resolved.apiKey.startsWith('AIza')) {
    return {
      ok: false as const,
      message: 'Google Cloud TTS requires OAuth access token, not browser API key.',
    };
  }

  if (resolved.provider === 'qwen') {
    const lowered = resolved.apiBase.toLowerCase();
    if (lowered.includes('/api-openai/') || isOpenAiEndpointPath(resolved.apiBase)) {
      return {
        ok: false as const,
        message:
          'Qwen TTS API Base is pointing to OpenAI-compatible path. Please use https://dashscope.aliyuncs.com/api/v1 ' +
          'or your DashScope-compatible gateway base.',
      };
    }
    if (resolved.chunkSize > 600) {
      return {
        ok: false as const,
        message: 'Qwen TTS per-request input must be <= 600 bytes. Reduce chunk size.',
      };
    }
  }

  return { ok: true as const, message: '' };
};

export const isTtsSupported = () =>
  typeof window !== 'undefined' && typeof window.fetch === 'function' && typeof window.Audio === 'function';

export const buildTtsText = ({
  title,
  author,
  source,
  contentHtml,
  summaryText,
  excludeSummary = true,
  includeAuthor = false,
  includeSource = false,
}: TtsTextInput) => {
  const parts: string[] = [];
  if (title) parts.push(title);
  if (includeAuthor && author) parts.push(`By ${author}.`);
  if (includeSource && source) parts.push(`Source ${source}.`);
  const normalizedSummary = normalizeText(stripHtml(summaryText || ''));
  let body = normalizeText(stripHtml(contentHtml || ''));
  if (excludeSummary && normalizedSummary) {
    if (body === normalizedSummary) {
      body = '';
    } else if (body.startsWith(`${normalizedSummary} `)) {
      body = body.slice(normalizedSummary.length).trim();
    }
  }
  if (body) parts.push(body);
  return normalizeText(parts.join(' '));
};

const buildTtsChunkCacheKey = (text: string, config: ResolvedCloudTtsConfig) => [
  config.provider,
  config.apiBase,
  config.model,
  config.voice,
  config.format,
  String(config.speed ?? ''),
  text,
].join('::');

const removeTtsChunkCacheKey = (cacheKey: string) => {
  const existing = ttsChunkCache.get(cacheKey);
  if (!existing) return;
  ttsChunkCache.delete(cacheKey);
  ttsChunkCacheBytes = Math.max(0, ttsChunkCacheBytes - existing.bytes);
};

const evictTtsChunkCache = () => {
  const now = Date.now();
  for (const [cacheKey, entry] of ttsChunkCache.entries()) {
    if (now - entry.createdAt <= TTS_CHUNK_CACHE_TTL_MS) continue;
    removeTtsChunkCacheKey(cacheKey);
  }
  while (
    ttsChunkCache.size > TTS_CHUNK_CACHE_MAX_ENTRIES
    || ttsChunkCacheBytes > TTS_CHUNK_CACHE_MAX_BYTES
  ) {
    const oldestKey = ttsChunkCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    removeTtsChunkCacheKey(oldestKey);
  }
};

const readTtsChunkCache = (cacheKey: string): Blob | null => {
  const entry = ttsChunkCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTS_CHUNK_CACHE_TTL_MS) {
    removeTtsChunkCacheKey(cacheKey);
    return null;
  }
  ttsChunkCache.delete(cacheKey);
  ttsChunkCache.set(cacheKey, entry);
  return entry.blob;
};

const writeTtsChunkCache = (cacheKey: string, blob: Blob) => {
  const bytes = Number(blob?.size || 0);
  if (!bytes || bytes > TTS_CHUNK_CACHE_MAX_BYTES) return;
  removeTtsChunkCacheKey(cacheKey);
  ttsChunkCache.set(cacheKey, {
    blob,
    bytes,
    createdAt: Date.now(),
  });
  ttsChunkCacheBytes += bytes;
  evictTtsChunkCache();
};

const createSynthesisResult = (blob: Blob): SynthesisResult => {
  const audioUrl = URL.createObjectURL(blob);
  return {
    audioUrl,
    revoke: () => URL.revokeObjectURL(audioUrl),
  };
};

const synthesizeWithOpenAiSpeech = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = joinUrl(config.apiBase, '/audio/speech');
  const payload: Record<string, unknown> = {
    model: config.model,
    voice: config.voice,
    input: text,
    format: config.format,
  };
  if (typeof config.speed === 'number') payload.speed = config.speed;
  const response = await requestWithRuntimeProxy(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, `Cloud TTS request failed for ${getTtsProviderLabel(config.provider)}`);
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('Cloud TTS returned an empty audio response.');
  }
  return { blob: audioBlob };
};

const synthesizeWithElevenLabs = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = new URL(
    joinUrl(config.apiBase, `/text-to-speech/${encodeURIComponent(config.voice)}`),
  );
  endpoint.searchParams.set('output_format', toElevenLabsOutputFormat(config.format));
  const response = await requestWithRuntimeProxy(endpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: toAudioMimeType(config.format),
      'xi-api-key': config.apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: config.model,
    }),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'ElevenLabs TTS request failed');
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('ElevenLabs returned an empty audio response.');
  }
  return { blob: audioBlob };
};

const buildAzureSsml = (text: string, voice: string) => {
  const voiceLang = inferLanguageCodeFromVoice(voice);
  return [
    `<speak version="1.0" xml:lang="${voiceLang}">`,
    `<voice xml:lang="${voiceLang}" name="${escapeXml(voice)}">`,
    escapeXml(text),
    '</voice>',
    '</speak>',
  ].join('');
};

const synthesizeWithAzureSpeech = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = joinUrl(config.apiBase, '/cognitiveservices/v1');
  const response = await requestWithRuntimeProxy(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'X-Microsoft-OutputFormat': toAzureOutputFormat(config.format),
      'User-Agent': 'Rssive',
    },
    body: buildAzureSsml(text, config.voice),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'Azure Speech TTS request failed');
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('Azure Speech returned an empty audio response.');
  }
  return { blob: audioBlob };
};

const decodeBase64Audio = (audioContent: string, mimeType: string) => {
  if (!audioContent) {
    throw new Error('Cloud TTS returned empty audio content.');
  }
  if (typeof atob !== 'function') {
    throw new Error('Current runtime does not support base64 audio decoding.');
  }
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const synthesizeWithQwenDashscope = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = getQwenProxyEndpoint();
  const response = await requestWithRuntimeProxy(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiKey: config.apiKey,
      apiBase: config.apiBase,
      model: config.model,
      voice: config.voice,
      text,
    }),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'Qwen TTS proxy request failed');
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('Qwen TTS proxy returned empty audio response.');
  }
  return { blob: audioBlob };
};

export const probeQwenTtsConnection = async (
  config: CloudTtsConfig,
  sampleText = '这是 Qwen TTS 连接测试。',
): Promise<TtsConnectionProbeResult> => {
  if (config.provider !== 'qwen') {
    return { ok: false, message: 'Connection probe currently supports only Qwen provider.' };
  }
  const validation = validateCloudTtsConfig(config);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const resolved = resolveCloudConfig(config);
  const endpoint = getQwenProxyEndpoint();
  try {
    const response = await requestWithRuntimeProxy(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: resolved.apiKey,
        apiBase: resolved.apiBase,
        model: resolved.model,
        voice: resolved.voice,
        text: sampleText,
      }),
    });
    if (!response.ok) {
      throw await buildHttpError(response, 'Qwen TTS proxy connection test failed');
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/')) {
      return {
        ok: false,
        message: `Unexpected response content type: ${contentType || 'unknown'}`,
      };
    }
    const audioBlob = await response.blob();
    if (!audioBlob.size) {
      return { ok: false, message: 'Proxy returned empty audio payload.' };
    }
    return {
      ok: true,
      message: `Proxy connected. Received ${(audioBlob.size / 1024).toFixed(1)} KB audio.`,
    };
  } catch (error) {
    return { ok: false, message: toError(error, 'Qwen TTS proxy connection test failed').message };
  }
};

const synthesizeWithGoogleTts = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = joinUrl(config.apiBase, '/text:synthesize');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.projectId) {
    headers['x-goog-user-project'] = config.projectId;
  }
  const response = await requestWithRuntimeProxy(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { text },
      voice: {
        name: config.voice,
        languageCode: inferLanguageCodeFromVoice(config.voice),
      },
      audioConfig: {
        audioEncoding: toGoogleAudioEncoding(config.format),
      },
    }),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'Google Cloud TTS request failed');
  }
  const payload = (await response.json()) as { audioContent?: string };
  const audioBlob = decodeBase64Audio(payload.audioContent || '', toAudioMimeType(config.format));
  return { blob: audioBlob };
};

const synthesizeWithIbmWatson = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = new URL(joinUrl(config.apiBase, '/v1/synthesize'));
  endpoint.searchParams.set('voice', config.voice);

  const authorization = config.apiKey.startsWith('Bearer ')
    ? config.apiKey
    : basicAuth('apikey', config.apiKey);

  const response = await requestWithRuntimeProxy(endpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: toAudioMimeType(config.format),
      Authorization: authorization,
    },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'IBM Watson TTS request failed');
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('IBM Watson returned an empty audio response.');
  }
  return { blob: audioBlob };
};

const synthesizeWithBaidu = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisBlobResult> => {
  const endpoint = joinUrl(config.apiBase, '/text2audio');
  const params = new URLSearchParams();
  params.set('tex', text);
  params.set('tok', config.apiKey);
  params.set('cuid', config.appId || 'rssive-web');
  params.set('ctp', '1');
  params.set('lan', 'zh');
  params.set('spd', '5');
  params.set('pit', '5');
  params.set('vol', '5');
  params.set('per', resolveBaiduVoice(config.voice, config.model));
  params.set('aue', toBaiduAue(config.format));

  const response = await requestWithRuntimeProxy(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal,
  });
  if (!response.ok) {
    throw await buildHttpError(response, 'Baidu TTS request failed');
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const raw = await response.text();
    throw new Error(`Baidu TTS error: ${raw.slice(0, ERROR_PREVIEW_LIMIT)}`);
  }
  const audioBlob = await response.blob();
  if (!audioBlob.size) {
    throw new Error('Baidu TTS returned an empty audio response.');
  }
  return { blob: audioBlob };
};

const synthesizeChunk = async (
  text: string,
  config: ResolvedCloudTtsConfig,
  signal: AbortSignal,
): Promise<SynthesisResult> => {
  const cacheKey = buildTtsChunkCacheKey(text, config);
  const cachedBlob = readTtsChunkCache(cacheKey);
  if (cachedBlob) {
    return createSynthesisResult(cachedBlob);
  }

  const capability = getTtsProviderCapability(config.provider);
  let chunkResult: SynthesisBlobResult;
  switch (capability.adapter) {
    case 'openai-speech':
      chunkResult = await synthesizeWithOpenAiSpeech(text, config, signal);
      break;
    case 'elevenlabs':
      chunkResult = await synthesizeWithElevenLabs(text, config, signal);
      break;
    case 'qwen-dashscope-tts':
      chunkResult = await synthesizeWithQwenDashscope(text, config, signal);
      break;
    case 'azure-speech-rest':
      chunkResult = await synthesizeWithAzureSpeech(text, config, signal);
      break;
    case 'google-tts-rest':
      chunkResult = await synthesizeWithGoogleTts(text, config, signal);
      break;
    case 'ibm-tts-rest':
      chunkResult = await synthesizeWithIbmWatson(text, config, signal);
      break;
    case 'baidu-tts-rest':
      chunkResult = await synthesizeWithBaidu(text, config, signal);
      break;
    case 'server-gateway-required':
      throw new Error(
        `${capability.label} requires server-side request signing/token flow. Configure backend gateway first.`,
      );
    default:
      throw new Error(`Unsupported TTS provider: ${config.provider}`);
  }
  writeTtsChunkCache(cacheKey, chunkResult.blob);
  return createSynthesisResult(chunkResult.blob);
};

export const createTtsController = () => {
  let currentAudio: HTMLAudioElement | null = null;
  let currentAbort: AbortController | null = null;
  let currentRevoke: (() => void) | null = null;
  let currentHandlers: SpeechHandlers | null = null;
  let currentConfig: CloudTtsConfig | null = null;
  let resolvedConfig: ResolvedCloudTtsConfig | null = null;
  let chunks: string[] = [];
  let chunkIndex = 0;
  let started = false;
  let pauseRequested = false;
  let resumeRequested = false;
  let stopped = true;
  let sessionId = 0;

  const cleanupAudio = () => {
    if (currentAudio) {
      currentAudio.onplay = null;
      currentAudio.onpause = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (currentRevoke) {
      currentRevoke();
      currentRevoke = null;
    }
  };

  const stop = () => {
    stopped = true;
    sessionId += 1;
    chunks = [];
    chunkIndex = 0;
    pauseRequested = false;
    resumeRequested = false;
    started = false;
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    cleanupAudio();
  };

  const emitError = (error: Error) => {
    const handlers = currentHandlers;
    stop();
    handlers?.onError?.(error);
  };

  const playChunk = async (targetSession: number): Promise<void> => {
    if (stopped || targetSession !== sessionId) return;
    if (!resolvedConfig) {
      emitError(new Error('Cloud TTS config was not resolved.'));
      return;
    }
    if (chunkIndex >= chunks.length) {
      stopped = true;
      chunks = [];
      chunkIndex = 0;
      pauseRequested = false;
      resumeRequested = false;
      started = false;
      const handlers = currentHandlers;
      currentHandlers = null;
      handlers?.onEnd?.();
      return;
    }

    const chunk = chunks[chunkIndex];
    currentAbort = new AbortController();
    try {
      const result = await synthesizeChunk(chunk, resolvedConfig, currentAbort.signal);
      currentAbort = null;
      if (stopped || targetSession !== sessionId) {
        result.revoke();
        return;
      }

      currentRevoke = result.revoke;
      const audio = new Audio(result.audioUrl);
      currentAudio = audio;
      audio.onplay = () => {
        if (!started) {
          started = true;
          currentHandlers?.onStart?.();
          return;
        }
        if (resumeRequested) {
          resumeRequested = false;
          currentHandlers?.onResume?.();
        }
      };
      audio.onpause = () => {
        if (pauseRequested) {
          pauseRequested = false;
          currentHandlers?.onPause?.();
        }
      };
      audio.onended = () => {
        cleanupAudio();
        chunkIndex += 1;
        void playChunk(targetSession);
      };
      audio.onerror = () => {
        emitError(new Error('Audio playback failed.'));
      };
      await audio.play();
    } catch (error) {
      currentAbort = null;
      if (stopped || targetSession !== sessionId) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      emitError(toError(error, 'Cloud TTS failed.'));
    }
  };

  const configure = (config: CloudTtsConfig) => {
    currentConfig = { ...config };
    resolvedConfig = resolveCloudConfig(currentConfig);
  };

  const speak = (
    text: string,
    handlers: SpeechHandlers = {},
    configOverride?: CloudTtsConfig,
  ) => {
    const cleaned = normalizeText(text);
    if (!cleaned) return;
    const effectiveConfig = configOverride || currentConfig;
    if (!effectiveConfig) {
      handlers.onError?.(new Error('Cloud TTS config is missing.'));
      return;
    }
    const validation = validateCloudTtsConfig(effectiveConfig);
    if (!validation.ok) {
      handlers.onError?.(new Error(validation.message));
      return;
    }

    stop();
    currentHandlers = handlers;
    configure(effectiveConfig);
    if (!resolvedConfig) {
      handlers.onError?.(new Error('Cloud TTS config is invalid.'));
      return;
    }

    chunks =
      resolvedConfig.provider === 'qwen'
        ? splitIntoUtf8Chunks(cleaned, resolvedConfig.chunkSize, QWEN_MAX_INPUT_BYTES)
        : splitIntoChunks(cleaned, resolvedConfig.chunkSize);
    chunkIndex = 0;
    started = false;
    pauseRequested = false;
    resumeRequested = false;
    stopped = false;
    sessionId += 1;
    const targetSession = sessionId;
    void playChunk(targetSession);
  };

  const pause = () => {
    if (!currentAudio || currentAudio.paused) return;
    pauseRequested = true;
    currentAudio.pause();
  };

  const resume = () => {
    if (!currentAudio || !currentAudio.paused) return;
    resumeRequested = true;
    currentAudio.play().catch((error) => {
      emitError(toError(error, 'Audio resume failed.'));
    });
  };

  return {
    supported: isTtsSupported(),
    configure,
    speak,
    pause,
    resume,
    stop,
  };
};

