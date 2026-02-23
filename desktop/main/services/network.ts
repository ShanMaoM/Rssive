import { promises as dns } from 'node:dns'
import net from 'node:net'
import Parser from 'rss-parser'
import sharp from 'sharp'

const REQUEST_TIMEOUT_MS = Number(process.env.RSS_PROXY_TIMEOUT || 15_000)
const VERSION = process.env.RSS_PROXY_VERSION || process.env.npm_package_version || 'dev'
const GLOBAL_CONCURRENCY = Number(process.env.RSS_PROXY_GLOBAL_CONCURRENCY || 8)
const HOST_CONCURRENCY = Number(process.env.RSS_PROXY_HOST_CONCURRENCY || 3)
const IMAGE_MAX_BYTES = Number(process.env.RSS_PROXY_IMAGE_MAX_BYTES || 6 * 1024 * 1024)
const IMAGE_CACHE_TTL_MS = Number(process.env.RSS_PROXY_IMAGE_CACHE_TTL_MS || 15 * 60 * 1000)
const IMAGE_CACHE_MAX_ENTRIES = Number(process.env.RSS_PROXY_IMAGE_CACHE_MAX || 200)
const TTS_AUDIO_MAX_BYTES = Number(process.env.RSS_PROXY_TTS_AUDIO_MAX_BYTES || 25 * 1024 * 1024)
const QWEN_DEFAULT_API_BASE = process.env.QWEN_TTS_API_BASE || 'https://dashscope.aliyuncs.com/api/v1'
const QWEN_DEFAULT_MODEL = process.env.QWEN_TTS_MODEL || 'qwen3-tts-flash'
const QWEN_DEFAULT_VOICE = process.env.QWEN_TTS_VOICE || 'Cherry'
const QWEN_PROXY_PATH = '/fetch/tts/qwen'
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const CONVERTIBLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
])

const parser = new Parser({
  customFields: {
    item: ['content:encoded'],
  },
})

const inflight = {
  total: 0,
  perHost: new Map<string, number>(),
}

const imageCache = new Map<string, {
  body: Buffer
  contentType: string
  finalUrl: string
  expiresAt: number
}>()

export class DesktopProxyError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DesktopProxyError'
    this.status = status
  }
}

type FetchLikeHeaders = Record<string, string>

export type RssFetchResult = {
  status: number
  etag: string | null
  lastModified: string | null
  finalUrl: string | null
  json?: unknown
  xml?: string
}

export type HtmlFetchResult = {
  status: number
  html: string
  finalUrl: string | null
  contentType: string
}

export type DesktopHttpProxyRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
}

export type DesktopHttpProxyResponse = {
  status: number
  headers: Record<string, string>
  bodyBase64: string
  finalUrl?: string
}

export type AiChatRequest = {
  apiBase: string
  apiKey?: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  timeoutMs?: number
}

export type AiChatResponse = {
  ok: boolean
  status: number
  content?: string
  error?: string
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/g, '')

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const stripHtml = (html: string) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const normalizeSummary = (item: any) => {
  const raw =
    item.contentSnippet ||
    item.summary ||
    item['content:encoded'] ||
    item.content ||
    ''
  return stripHtml(raw)
}

const normalizeEntry = (item: any) => {
  const publishedAt = toIsoString(item.isoDate || item.pubDate || item.published || item.updated)
  const summary = normalizeSummary(item)
  return {
    guid: item.guid || item.id || item.link || null,
    title: item.title || '',
    link: item.link || '',
    published_at: publishedAt,
    author: item.creator || item.author || null,
    summary,
    content: item['content:encoded'] || item.content || null,
    enclosure: item.enclosure ? [item.enclosure].flat() : [],
  }
}

const normalizeHeaders = (headers: Headers) => {
  const output: Record<string, string> = {}
  headers.forEach((value, key) => {
    output[key] = value
  })
  return output
}

const toBase64 = (buffer: Buffer) => buffer.toString('base64')

const toErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
)

const throwProxyError = (status: number, message: string): never => {
  throw new DesktopProxyError(status, message)
}

const isAllowedProtocol = (url: URL) => ALLOWED_PROTOCOLS.has(url.protocol)

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split('.').map(segment => Number(segment))
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  return false
}

const isPrivateIpv6 = (ip: string) => {
  const value = ip.toLowerCase()
  if (value === '::1' || value === '::') return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true
  if (value.startsWith('::ffff:')) {
    const v4 = value.replace('::ffff:', '')
    return isPrivateIpv4(v4)
  }
  return false
}

const isPrivateIp = (address: string) => {
  const ipType = net.isIP(address)
  if (ipType === 4) return isPrivateIpv4(address)
  if (ipType === 6) return isPrivateIpv6(address)
  return true
}

const isBlockedHostname = (hostname: string) => {
  const value = hostname.toLowerCase()
  if (value === 'localhost') return true
  if (value.endsWith('.local')) return true
  if (value.endsWith('.localhost')) return true
  if (value.endsWith('.internal')) return true
  return false
}

const isSafeHostname = async (hostname: string) => {
  if (isBlockedHostname(hostname)) return false
  const ipType = net.isIP(hostname)
  if (ipType) return !isPrivateIp(hostname)
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true })
    if (!records.length) return false
    return records.every(record => !isPrivateIp(record.address))
  } catch {
    return false
  }
}

const resolveSafeUrl = async (rawUrl: string) => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new DesktopProxyError(400, 'Invalid URL')
  }
  if (!isAllowedProtocol(parsed)) {
    throwProxyError(403, 'URL protocol not allowed')
  }
  const safe = await isSafeHostname(parsed.hostname)
  if (!safe) {
    throwProxyError(403, 'URL blocked')
  }
  return parsed
}

const acquireSlot = (host: string) => {
  const currentHost = inflight.perHost.get(host) || 0
  if (inflight.total >= GLOBAL_CONCURRENCY || currentHost >= HOST_CONCURRENCY) return false
  inflight.total += 1
  inflight.perHost.set(host, currentHost + 1)
  return true
}

const releaseSlot = (host: string) => {
  inflight.total = Math.max(0, inflight.total - 1)
  const currentHost = inflight.perHost.get(host) || 0
  if (currentHost <= 1) {
    inflight.perHost.delete(host)
  } else {
    inflight.perHost.set(host, currentHost - 1)
  }
}

const withHostSlot = async <T>(host: string, task: () => Promise<T>) => {
  if (!acquireSlot(host)) {
    throwProxyError(429, 'Too many requests')
  }
  try {
    return await task()
  } finally {
    releaseSlot(host)
  }
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new DesktopProxyError(408, 'Upstream timeout')
    }
    throw new DesktopProxyError(502, toErrorMessage(error, 'Proxy error'))
  } finally {
    clearTimeout(timeout)
  }
}

const readResponseBuffer = async (
  response: Response,
  maxBytes: number,
) => {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (maxBytes > 0 && buffer.length > maxBytes) {
      throwProxyError(413, 'Payload too large')
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (maxBytes > 0 && total > maxBytes) {
      throwProxyError(413, 'Payload too large')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, total)
}

const ensureFinalUrlSafe = async (responseUrl: string | undefined, fallbackUrl: URL) => {
  if (!responseUrl) return fallbackUrl.toString()
  const finalTarget = await resolveSafeUrl(responseUrl)
  return finalTarget.toString()
}

const getCachedImage = (key: string) => {
  const cached = imageCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    imageCache.delete(key)
    return null
  }
  return cached
}

const setCachedImage = (key: string, payload: {
  body: Buffer
  contentType: string
  finalUrl: string
  expiresAt: number
}) => {
  imageCache.set(key, payload)
  if (imageCache.size <= IMAGE_CACHE_MAX_ENTRIES) return
  const firstKey = imageCache.keys().next().value
  if (firstKey) imageCache.delete(firstKey)
}

const isAnimatedPng = (buffer: Buffer) => {
  if (!buffer || buffer.length < 16) return false
  const signature = buffer.subarray(0, 8)
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!signature.equals(expected)) return false
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'acTL') return true
    offset += 8 + length + 4
  }
  return false
}

const shouldConvertToWebp = (mimeType: string, buffer: Buffer) => {
  if (!CONVERTIBLE_MIME_TYPES.has(mimeType)) return false
  if (mimeType === 'image/png' && isAnimatedPng(buffer)) return false
  return true
}

const toQwenMimeType = (format: string) => {
  const normalized = (format || '').toLowerCase()
  if (normalized.includes('mp3')) return 'audio/mpeg'
  if (normalized.includes('opus') || normalized.includes('ogg')) return 'audio/ogg'
  return 'audio/wav'
}

const parseQwenError = async (response: Response) => {
  const raw = await response.text().catch(() => '')
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.message === 'string' && parsed.message) return parsed.message
    if (typeof parsed?.code === 'string' && parsed.code) return parsed.code
  } catch {
    // keep raw text
  }
  return raw.slice(0, 240)
}

const isOpenAiEndpointPath = (value: string) => {
  const normalized = trimTrailingSlash(value).toLowerCase()
  return (
    normalized.includes('/chat/completions') ||
    normalized.includes('/audio/speech') ||
    normalized.includes('/responses')
  )
}

const normalizeQwenApiBase = (value: string) => {
  const normalized = trimTrailingSlash((value || '').trim())
  if (!normalized) return QWEN_DEFAULT_API_BASE
  const lowered = normalized.toLowerCase()
  if (lowered.includes('/api-openai/') || isOpenAiEndpointPath(normalized)) {
    return QWEN_DEFAULT_API_BASE
  }
  return normalized
}

const buildErrorBody = (message: string) => toBase64(Buffer.from(JSON.stringify({ error: message }), 'utf8'))

const toErrorHttpResponse = (status: number, message: string): DesktopHttpProxyResponse => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  bodyBase64: buildErrorBody(message),
})

const handleQwenTtsRequest = async (body: string | undefined): Promise<DesktopHttpProxyResponse> => {
  let payload: any = {}
  try {
    payload = body ? JSON.parse(body) : {}
  } catch {
    return toErrorHttpResponse(400, 'Invalid JSON body')
  }
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : ''
  const model = typeof payload?.model === 'string' && payload.model.trim() ? payload.model.trim() : QWEN_DEFAULT_MODEL
  const voice = typeof payload?.voice === 'string' && payload.voice.trim() ? payload.voice.trim() : QWEN_DEFAULT_VOICE
  const apiBase = normalizeQwenApiBase(typeof payload?.apiBase === 'string' ? payload.apiBase : '')

  if (!text) return toErrorHttpResponse(400, 'Missing text')
  if (!apiKey) return toErrorHttpResponse(400, 'Missing apiKey')

  let apiBaseUrl: URL
  try {
    apiBaseUrl = await resolveSafeUrl(apiBase)
  } catch (error) {
    const status = error instanceof DesktopProxyError ? error.status : 400
    return toErrorHttpResponse(status, toErrorMessage(error, 'Invalid apiBase'))
  }

  return withHostSlot(apiBaseUrl.hostname, async () => {
    const endpoint = `${trimTrailingSlash(apiBaseUrl.toString())}/services/aigc/multimodal-generation/generation`
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: {
          text,
          voice,
        },
      }),
    })

    if (!response.ok) {
      const detail = await parseQwenError(response)
      const textBuffer = Buffer.from(JSON.stringify({ error: detail || 'Qwen request failed' }), 'utf8')
      return {
        status: response.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        bodyBase64: toBase64(textBuffer),
        finalUrl: response.url || endpoint,
      }
    }

    const result = await response.json().catch(() => null)
    const audio = result?.output?.audio
    const audioUrl = typeof audio?.url === 'string' ? audio.url : ''
    const audioData = typeof audio?.data === 'string' ? audio.data : ''
    const format = typeof audio?.format === 'string' ? audio.format : ''

    if (!audioUrl && !audioData) {
      return toErrorHttpResponse(502, 'Qwen TTS returned no audio payload')
    }

    if (audioUrl) {
      let parsedAudioUrl: URL
      try {
        parsedAudioUrl = await resolveSafeUrl(audioUrl)
      } catch (error) {
        const status = error instanceof DesktopProxyError ? error.status : 502
        return toErrorHttpResponse(status, toErrorMessage(error, 'Qwen returned invalid audio url'))
      }

      const audioResponse = await fetchWithTimeout(parsedAudioUrl.toString(), { method: 'GET' })
      const audioBuffer = await readResponseBuffer(audioResponse, TTS_AUDIO_MAX_BYTES)
      const contentType = (audioResponse.headers.get('content-type') || '').split(';')[0].trim() || toQwenMimeType(format)
      return {
        status: audioResponse.status,
        headers: {
          'content-type': contentType,
          'cache-control': 'no-store',
          'x-tts-provider': 'qwen',
        },
        bodyBase64: toBase64(audioBuffer),
        finalUrl: audioResponse.url || parsedAudioUrl.toString(),
      }
    }

    const buffer = Buffer.from(audioData, 'base64')
    if (!buffer.length) {
      return toErrorHttpResponse(502, 'Qwen returned empty audio payload')
    }
    return {
      status: 200,
      headers: {
        'content-type': toQwenMimeType(format),
        'cache-control': 'no-store',
        'x-tts-provider': 'qwen',
      },
      bodyBase64: toBase64(buffer),
      finalUrl: endpoint,
    }
  })
}

export const fetchRss = async ({
  url,
  headers = {},
}: {
  url: string
  headers?: FetchLikeHeaders
}): Promise<RssFetchResult> => {
  const targetUrl = await resolveSafeUrl(url)

  return withHostSlot(targetUrl.hostname, async () => {
    const response = await fetchWithTimeout(targetUrl.toString(), {
      headers,
      redirect: 'follow',
    })
    const etag = response.headers.get('etag')
    const lastModified = response.headers.get('last-modified')
    const finalUrl = await ensureFinalUrlSafe(response.url, targetUrl)

    if (response.status === 304) {
      return {
        status: 304,
        etag,
        lastModified,
        finalUrl,
      }
    }

    const body = await response.text()
    if (response.status >= 400) {
      return {
        status: response.status,
        etag,
        lastModified,
        finalUrl,
        xml: body,
      }
    }

    try {
      const feed = await parser.parseString(body)
      const normalized = {
        feed: {
          id: feed.id || null,
          title: feed.title || '',
          site_url: feed.link || '',
          feed_url: feed.feedUrl || response.url || '',
          description: feed.description || null,
          icon: feed.image?.url || null,
          favicon: null,
          updated_at: toIsoString(feed.lastBuildDate || feed.updated || null),
        },
        entries: Array.isArray(feed.items) ? feed.items.map(normalizeEntry) : [],
      }
      return {
        status: response.status,
        etag,
        lastModified,
        finalUrl,
        json: normalized,
      }
    } catch (error) {
      throw new DesktopProxyError(502, toErrorMessage(error, 'RSS parse failed'))
    }
  })
}

export const fetchHtml = async ({
  url,
  timeoutMs,
}: {
  url: string
  timeoutMs?: number
}): Promise<HtmlFetchResult> => {
  const targetUrl = await resolveSafeUrl(url)
  return withHostSlot(targetUrl.hostname, async () => {
    const response = await fetchWithTimeout(
      targetUrl.toString(),
      {
        method: 'GET',
        redirect: 'follow',
      },
      timeoutMs || REQUEST_TIMEOUT_MS,
    )
    const finalUrl = await ensureFinalUrlSafe(response.url, targetUrl)
    const html = await response.text()
    return {
      status: response.status,
      html,
      finalUrl,
      contentType: response.headers.get('content-type') || 'text/html; charset=utf-8',
    }
  })
}

export const fetchImage = async ({
  url,
}: {
  url: string
}): Promise<DesktopHttpProxyResponse> => {
  const targetUrl = await resolveSafeUrl(url)
  const cacheKey = targetUrl.toString()
  const cached = getCachedImage(cacheKey)
  if (cached) {
    return {
      status: 200,
      headers: {
        'content-type': cached.contentType,
        'cache-control': `public, max-age=${Math.floor(IMAGE_CACHE_TTL_MS / 1000)}`,
        'x-image-cache': 'HIT',
      },
      bodyBase64: toBase64(cached.body),
      finalUrl: cached.finalUrl,
    }
  }

  return withHostSlot(targetUrl.hostname, async () => {
    const response = await fetchWithTimeout(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'image/*',
      },
      redirect: 'follow',
    })
    if (!response.ok) {
      return toErrorHttpResponse(response.status, 'Upstream image request failed')
    }

    const finalUrl = await ensureFinalUrlSafe(response.url, targetUrl)
    const contentTypeRaw = response.headers.get('content-type') || ''
    const contentType = contentTypeRaw.split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) {
      return toErrorHttpResponse(415, 'URL did not return an image')
    }
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength && declaredLength > IMAGE_MAX_BYTES) {
      return toErrorHttpResponse(413, 'Image too large')
    }

    let body = await readResponseBuffer(response, IMAGE_MAX_BYTES)
    let outputType = contentType
    if (contentType === 'image/gif' || contentType === 'image/apng' || contentType === 'image/webp') {
      // keep original animated formats
    } else if (shouldConvertToWebp(contentType, body)) {
      try {
        body = Buffer.from(await sharp(body).webp({ quality: 82 }).toBuffer())
        outputType = 'image/webp'
      } catch {
        outputType = contentType
      }
    }

    setCachedImage(cacheKey, {
      body,
      contentType: outputType,
      finalUrl,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    })

    return {
      status: 200,
      headers: {
        'content-type': outputType,
        'cache-control': `public, max-age=${Math.floor(IMAGE_CACHE_TTL_MS / 1000)}`,
        'x-image-cache': 'MISS',
      },
      bodyBase64: toBase64(body),
      finalUrl,
    }
  })
}

const extractCompletionContent = (payload: any) => {
  const message = payload?.choices?.[0]?.message?.content
  if (typeof message === 'string') return message
  if (Array.isArray(message)) {
    const text = message
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}

export const requestAiChatCompletion = async (input: AiChatRequest): Promise<AiChatResponse> => {
  const apiBase = trimTrailingSlash((input.apiBase || '').trim())
  const model = (input.model || '').trim()
  if (!apiBase) return { ok: false, status: 400, error: 'Missing apiBase' }
  if (!model) return { ok: false, status: 400, error: 'Missing model' }

  const baseUrl = await resolveSafeUrl(apiBase).catch(error => {
    const status = error instanceof DesktopProxyError ? error.status : 400
    const message = toErrorMessage(error, 'Invalid apiBase')
    return { status, message }
  })
  if (!(baseUrl instanceof URL)) {
    return { ok: false, status: baseUrl.status, error: baseUrl.message }
  }

  return withHostSlot(baseUrl.hostname, async () => {
    const endpoint = `${trimTrailingSlash(baseUrl.toString())}/chat/completions`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: typeof input.temperature === 'number' ? input.temperature : 0.2,
          messages: [
            { role: 'system', content: input.systemPrompt || '' },
            { role: 'user', content: input.userPrompt || '' },
          ],
        }),
      },
      input.timeoutMs || REQUEST_TIMEOUT_MS,
    )

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const errorText =
        (typeof payload?.error === 'string' && payload.error) ||
        (typeof payload?.error?.message === 'string' && payload.error.message) ||
        (typeof payload?.message === 'string' && payload.message) ||
        `AI request failed with status ${response.status}`
      return {
        ok: false,
        status: response.status,
        error: errorText,
      }
    }

    const content = extractCompletionContent(payload)
    if (!content) {
      return {
        ok: false,
        status: 502,
        error: 'AI returned empty completion content.',
      }
    }
    return {
      ok: true,
      status: response.status,
      content,
    }
  })
}

export const proxyTtsRequest = async (input: DesktopHttpProxyRequest): Promise<DesktopHttpProxyResponse> => {
  const url = (input.url || '').trim()
  if (!url) return toErrorHttpResponse(400, 'Missing URL')
  if (url === QWEN_PROXY_PATH) {
    return handleQwenTtsRequest(input.body)
  }

  let targetUrl: URL
  try {
    targetUrl = await resolveSafeUrl(url)
  } catch (error) {
    const status = error instanceof DesktopProxyError ? error.status : 400
    return toErrorHttpResponse(status, toErrorMessage(error, 'Invalid URL'))
  }

  return withHostSlot(targetUrl.hostname, async () => {
    const method = (input.method || 'GET').toUpperCase()
    const headers = input.headers || {}
    const body = method === 'GET' || method === 'HEAD' ? undefined : input.body
    const response = await fetchWithTimeout(
      targetUrl.toString(),
      {
        method,
        headers,
        body,
        redirect: 'follow',
      },
      input.timeoutMs || REQUEST_TIMEOUT_MS,
    )
    const maxBytes = input.maxBytes && input.maxBytes > 0 ? input.maxBytes : TTS_AUDIO_MAX_BYTES
    let buffer: Buffer
    try {
      buffer = await readResponseBuffer(response, maxBytes)
    } catch (error) {
      const status = error instanceof DesktopProxyError ? error.status : 502
      return toErrorHttpResponse(status, toErrorMessage(error, 'Payload read failed'))
    }
    return {
      status: response.status,
      headers: normalizeHeaders(response.headers),
      bodyBase64: toBase64(buffer),
      finalUrl: response.url || targetUrl.toString(),
    }
  })
}

export const getDesktopHealth = () => ({
  status: 'ok',
  version: VERSION,
  uptime: Math.floor(process.uptime()),
})
