import http from 'node:http'
import { promises as dns } from 'node:dns'
import net from 'node:net'
import Parser from 'rss-parser'
import sharp from 'sharp'

const PORT = Number(process.env.RSS_PROXY_PORT || 8787)
const REQUEST_TIMEOUT_MS = Number(process.env.RSS_PROXY_TIMEOUT || 15000)
const VERSION = process.env.RSS_PROXY_VERSION || process.env.npm_package_version || 'dev'
const parser = new Parser({
  customFields: {
    item: ['content:encoded'],
  },
})
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

const GLOBAL_CONCURRENCY = Number(process.env.RSS_PROXY_GLOBAL_CONCURRENCY || 8)
const HOST_CONCURRENCY = Number(process.env.RSS_PROXY_HOST_CONCURRENCY || 3)
const IMAGE_MAX_BYTES = Number(process.env.RSS_PROXY_IMAGE_MAX_BYTES || 6 * 1024 * 1024)
const IMAGE_CACHE_TTL_MS = Number(process.env.RSS_PROXY_IMAGE_CACHE_TTL_MS || 15 * 60 * 1000)
const IMAGE_CACHE_MAX_ENTRIES = Number(process.env.RSS_PROXY_IMAGE_CACHE_MAX || 200)
const TTS_AUDIO_MAX_BYTES = Number(process.env.RSS_PROXY_TTS_AUDIO_MAX_BYTES || 25 * 1024 * 1024)
const JSON_BODY_MAX_BYTES = Number(process.env.RSS_PROXY_JSON_BODY_MAX_BYTES || 64 * 1024)
const QWEN_DEFAULT_API_BASE = process.env.QWEN_TTS_API_BASE || 'https://dashscope.aliyuncs.com/api/v1'
const QWEN_DEFAULT_MODEL = process.env.QWEN_TTS_MODEL || 'qwen3-tts-flash'
const QWEN_DEFAULT_VOICE = process.env.QWEN_TTS_VOICE || 'Cherry'

const CONVERTIBLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
])

const inflight = {
  total: 0,
  perHost: new Map(),
}

const imageCache = new Map()

const sendJson = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const setCors = res => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,If-None-Match,If-Modified-Since')
  res.setHeader('Access-Control-Expose-Headers', 'ETag,Last-Modified,X-Final-Url,X-TTS-Provider')
}

const stripHtml = html => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const toIsoString = value => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const normalizeSummary = item => {
  const raw =
    item.contentSnippet ||
    item.summary ||
    item['content:encoded'] ||
    item.content ||
    item.contentSnippet ||
    ''
  return stripHtml(raw)
}

const normalizeEntry = item => {
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

const isAllowedProtocol = url => ALLOWED_PROTOCOLS.has(url.protocol)

const isPrivateIpv4 = ip => {
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

const isPrivateIpv6 = ip => {
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

const isPrivateIp = address => {
  const ipType = net.isIP(address)
  if (ipType === 4) return isPrivateIpv4(address)
  if (ipType === 6) return isPrivateIpv6(address)
  return true
}

const isBlockedHostname = hostname => {
  const value = hostname.toLowerCase()
  if (value === 'localhost') return true
  if (value.endsWith('.local')) return true
  if (value.endsWith('.localhost')) return true
  if (value.endsWith('.internal')) return true
  return false
}

const isSafeHostname = async hostname => {
  if (isBlockedHostname(hostname)) return false
  const ipType = net.isIP(hostname)
  if (ipType) return !isPrivateIp(hostname)
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true })
    if (!results.length) return false
    return results.every(result => !isPrivateIp(result.address))
  } catch {
    return false
  }
}

const validateTargetUrl = async targetUrl => {
  if (!isAllowedProtocol(targetUrl)) return { ok: false, status: 403, error: 'URL protocol not allowed' }
  const safe = await isSafeHostname(targetUrl.hostname)
  if (!safe) return { ok: false, status: 403, error: 'URL blocked' }
  return { ok: true }
}

const trimTrailingSlash = value => value.replace(/\/+$/g, '')

const isOpenAiEndpointPath = value => {
  const normalized = trimTrailingSlash((value || '').toLowerCase())
  return (
    normalized.includes('/chat/completions') ||
    normalized.includes('/audio/speech') ||
    normalized.includes('/responses')
  )
}

const normalizeQwenApiBase = value => {
  const normalized = trimTrailingSlash((value || '').trim())
  if (!normalized) return QWEN_DEFAULT_API_BASE
  const lowered = normalized.toLowerCase()
  if (lowered.includes('/api-openai/') || isOpenAiEndpointPath(normalized)) {
    return QWEN_DEFAULT_API_BASE
  }
  return normalized
}

const inferQwenAudioMimeType = format => {
  const normalized = (format || '').toLowerCase()
  if (normalized.includes('mp3')) return 'audio/mpeg'
  if (normalized.includes('opus') || normalized.includes('ogg')) return 'audio/ogg'
  return 'audio/wav'
}

const readJsonBody = (req, maxBytes = JSON_BODY_MAX_BYTES) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false

    const settle = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }

    req.on('data', chunk => {
      total += chunk.length
      if (total > maxBytes) {
        const error = new Error('BODY_TOO_LARGE')
        error.code = 'BODY_TOO_LARGE'
        req.destroy(error)
        settle(reject, error)
        return
      }
      chunks.push(chunk)
    })
    req.on('error', error => settle(reject, error))
    req.on('end', () => {
      if (settled) return
      if (!chunks.length) {
        settle(resolve, {})
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        settle(resolve, {})
        return
      }
      try {
        settle(resolve, JSON.parse(raw))
      } catch {
        const error = new Error('INVALID_JSON')
        error.code = 'INVALID_JSON'
        settle(reject, error)
      }
    })
  })

const acquireSlot = host => {
  const currentHost = inflight.perHost.get(host) || 0
  if (inflight.total >= GLOBAL_CONCURRENCY || currentHost >= HOST_CONCURRENCY) return false
  inflight.total += 1
  inflight.perHost.set(host, currentHost + 1)
  return true
}

const releaseSlot = host => {
  inflight.total = Math.max(0, inflight.total - 1)
  const currentHost = inflight.perHost.get(host) || 0
  if (currentHost <= 1) {
    inflight.perHost.delete(host)
  } else {
    inflight.perHost.set(host, currentHost - 1)
  }
}

const getCachedImage = key => {
  const cached = imageCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    imageCache.delete(key)
    return null
  }
  return cached
}

const setCachedImage = (key, payload) => {
  imageCache.set(key, payload)
  if (imageCache.size <= IMAGE_CACHE_MAX_ENTRIES) return
  const oldestKey = imageCache.keys().next().value
  if (oldestKey) imageCache.delete(oldestKey)
}

const readResponseBuffer = async (response, maxBytes, controller) => {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (maxBytes && buffer.length > maxBytes) {
      const error = new Error('MAX_BYTES')
      error.code = 'MAX_BYTES'
      throw error
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (maxBytes && total > maxBytes) {
        if (controller) controller.abort()
        const error = new Error('MAX_BYTES')
        error.code = 'MAX_BYTES'
        throw error
      }
      chunks.push(Buffer.from(value))
    }
  }
  return Buffer.concat(chunks, total)
}

const isAnimatedPng = buffer => {
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

const shouldConvertToWebp = (mimeType, buffer) => {
  if (!CONVERTIBLE_MIME_TYPES.has(mimeType)) return false
  if (mimeType === 'image/png' && isAnimatedPng(buffer)) return false
  return true
}

const respondWithImage = (res, buffer, contentType, finalUrl, cacheStatus) => {
  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(IMAGE_CACHE_TTL_MS / 1000)}`)
  if (finalUrl) res.setHeader('X-Final-Url', finalUrl)
  if (cacheStatus) res.setHeader('X-Image-Cache', cacheStatus)
  res.end(buffer)
}

const handleImageProxy = async ({ req, res, targetUrl }) => {
  const cacheKey = targetUrl.toString()
  const cached = getCachedImage(cacheKey)
  if (cached) {
    respondWithImage(res, cached.body, cached.contentType, cached.finalUrl, 'HIT')
    return
  }

  const host = targetUrl.hostname
  if (!acquireSlot(host)) {
    sendJson(res, 429, { error: 'Too many requests' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(targetUrl.toString(), {
      headers: { Accept: 'image/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      sendJson(res, response.status, { error: 'Upstream error' })
      return
    }

    const finalUrl = response.url
    if (finalUrl) {
      const finalTarget = new URL(finalUrl)
      const validation = await validateTargetUrl(finalTarget)
      if (!validation.ok) {
        sendJson(res, validation.status, { error: validation.error })
        return
      }
    }

    const contentTypeRaw = response.headers.get('content-type') || ''
    const contentType = contentTypeRaw.split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) {
      sendJson(res, 415, { error: 'URL did not return an image' })
      return
    }

    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength && declaredLength > IMAGE_MAX_BYTES) {
      sendJson(res, 413, { error: 'Image too large' })
      return
    }

    let body = await readResponseBuffer(response, IMAGE_MAX_BYTES, controller)
    let outputType = contentType

    if (contentType === 'image/gif' || contentType === 'image/apng' || contentType === 'image/webp') {
      // keep animated and webp formats as-is
    } else if (shouldConvertToWebp(contentType, body)) {
      try {
        body = await sharp(body).webp({ quality: 82 }).toBuffer()
        outputType = 'image/webp'
      } catch {
        outputType = contentType
      }
    }

    setCachedImage(cacheKey, {
      body,
      contentType: outputType,
      finalUrl: finalUrl || targetUrl.toString(),
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    })

    respondWithImage(res, body, outputType, finalUrl, 'MISS')
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 408, { error: 'Upstream timeout' })
      return
    }
    if (error?.code === 'MAX_BYTES' || error?.message === 'MAX_BYTES') {
      sendJson(res, 413, { error: 'Image too large' })
      return
    }
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'Proxy error' })
  } finally {
    clearTimeout(timeout)
    releaseSlot(host)
  }
}

const parseQwenUpstreamError = async response => {
  const raw = await response.text().catch(() => '')
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.message === 'string' && parsed.message) return parsed.message
    if (typeof parsed?.code === 'string' && parsed.code) return parsed.code
  } catch {
    // Fall through to raw text.
  }
  return raw.slice(0, 240)
}

const respondWithAudio = (res, buffer, contentType, finalUrl) => {
  res.statusCode = 200
  res.setHeader('Content-Type', contentType || 'audio/wav')
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-TTS-Provider', 'qwen')
  if (finalUrl) res.setHeader('X-Final-Url', finalUrl)
  res.end(buffer)
}

const handleQwenTtsProxy = async ({ req, res }) => {
  let payload
  try {
    payload = await readJsonBody(req)
  } catch (error) {
    if (error?.code === 'BODY_TOO_LARGE') {
      sendJson(res, 413, { error: 'JSON body too large' })
      return
    }
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : ''
  const model = typeof payload?.model === 'string' && payload.model.trim() ? payload.model.trim() : QWEN_DEFAULT_MODEL
  const voice = typeof payload?.voice === 'string' && payload.voice.trim() ? payload.voice.trim() : QWEN_DEFAULT_VOICE
  const apiBase = normalizeQwenApiBase(typeof payload?.apiBase === 'string' ? payload.apiBase : '')

  if (!text) {
    sendJson(res, 400, { error: 'Missing text' })
    return
  }
  if (!apiKey) {
    sendJson(res, 400, { error: 'Missing apiKey' })
    return
  }

  let apiBaseUrl
  try {
    apiBaseUrl = new URL(apiBase)
  } catch {
    sendJson(res, 400, { error: 'Invalid apiBase' })
    return
  }
  const baseValidation = await validateTargetUrl(apiBaseUrl)
  if (!baseValidation.ok) {
    sendJson(res, baseValidation.status, { error: baseValidation.error })
    return
  }

  const endpoint = `${trimTrailingSlash(apiBase)}/services/aigc/multimodal-generation/generation`
  const host = apiBaseUrl.hostname
  if (!acquireSlot(host)) {
    sendJson(res, 429, { error: 'Too many requests' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
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
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await parseQwenUpstreamError(response)
      sendJson(res, response.status, { error: detail || 'Qwen TTS upstream request failed' })
      return
    }

    const result = await response.json().catch(() => null)
    const audio = result?.output?.audio
    const audioUrl = typeof audio?.url === 'string' ? audio.url : ''
    const audioData = typeof audio?.data === 'string' ? audio.data : ''
    const format = typeof audio?.format === 'string' ? audio.format : ''

    if (!audioUrl && !audioData) {
      sendJson(res, 502, { error: 'Qwen TTS returned no audio payload' })
      return
    }

    if (audioUrl) {
      let parsedAudioUrl
      try {
        parsedAudioUrl = new URL(audioUrl)
      } catch {
        sendJson(res, 502, { error: 'Qwen returned invalid audio url' })
        return
      }
      const audioValidation = await validateTargetUrl(parsedAudioUrl)
      if (!audioValidation.ok) {
        sendJson(res, audioValidation.status, { error: audioValidation.error })
        return
      }
      const audioResponse = await fetch(parsedAudioUrl.toString(), {
        method: 'GET',
        signal: controller.signal,
      })
      if (!audioResponse.ok) {
        const detail = await parseQwenUpstreamError(audioResponse)
        sendJson(res, audioResponse.status, { error: detail || 'Qwen audio download failed' })
        return
      }
      const audioBuffer = await readResponseBuffer(audioResponse, TTS_AUDIO_MAX_BYTES, controller)
      if (!audioBuffer.length) {
        sendJson(res, 502, { error: 'Qwen audio download returned empty content' })
        return
      }
      const contentType = (audioResponse.headers.get('content-type') || '').split(';')[0].trim() || inferQwenAudioMimeType(format)
      respondWithAudio(res, audioBuffer, contentType, audioResponse.url || parsedAudioUrl.toString())
      return
    }

    let buffer
    try {
      buffer = Buffer.from(audioData, 'base64')
    } catch {
      sendJson(res, 502, { error: 'Qwen returned invalid base64 audio payload' })
      return
    }
    if (!buffer.length) {
      sendJson(res, 502, { error: 'Qwen returned empty audio payload' })
      return
    }
    respondWithAudio(res, buffer, inferQwenAudioMimeType(format), endpoint)
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 408, { error: 'Upstream timeout' })
      return
    }
    if (error?.code === 'MAX_BYTES' || error?.message === 'MAX_BYTES') {
      sendJson(res, 413, { error: 'Audio payload too large' })
      return
    }
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'Proxy error' })
  } finally {
    clearTimeout(timeout)
    releaseSlot(host)
  }
}

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  let requestUrl
  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host}`)
  } catch {
    sendJson(res, 400, { error: 'Invalid request url' })
    return
  }

  if (requestUrl.pathname === '/fetch/tts/qwen') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    try {
      await handleQwenTtsProxy({ req, res })
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'Proxy error' })
    }
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    if (requestUrl.pathname === '/health') {
      sendJson(res, 200, { status: 'ok', version: VERSION, uptime: Math.floor(process.uptime()) })
      return
    }
    const isRss = requestUrl.pathname === '/fetch/rss'
    const isHtml = requestUrl.pathname === '/fetch/html'
    const isImage = requestUrl.pathname === '/fetch/image'
    if (!isRss && !isHtml && !isImage) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    const target = requestUrl.searchParams.get('url')
    if (!target) {
      sendJson(res, 400, { error: 'Missing url param' })
      return
    }

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      sendJson(res, 400, { error: 'Invalid url param' })
      return
    }

    const validation = await validateTargetUrl(targetUrl)
    if (!validation.ok) {
      sendJson(res, validation.status, { error: validation.error })
      return
    }

    if (isImage) {
      await handleImageProxy({ req, res, targetUrl })
      return
    }

    const host = targetUrl.hostname
    if (!acquireSlot(host)) {
      sendJson(res, 429, { error: 'Too many requests' })
      return
    }

    const headers = {}
    if (req.headers['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match']
    if (req.headers['if-modified-since']) headers['If-Modified-Since'] = req.headers['if-modified-since']

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(targetUrl.toString(), {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const etag = response.headers.get('etag')
      const lastModified = response.headers.get('last-modified')
      if (etag) res.setHeader('ETag', etag)
      if (lastModified) res.setHeader('Last-Modified', lastModified)
      res.setHeader('X-Final-Url', response.url)
      res.statusCode = response.status

      if (response.status === 304) {
        res.end()
        return
      }

      const body = await response.text()

      if (isHtml) {
        const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8'
        res.setHeader('Content-Type', contentType)
        res.end(body)
        return
      }

      const format = requestUrl.searchParams.get('format')

      if (format === 'json') {
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
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(normalized))
          return
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : 'Parse error' })
          return
        }
      }

      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.end(body)
    } catch (error) {
      if (error?.name === 'AbortError') {
        sendJson(res, 408, { error: 'Upstream timeout' })
        return
      }
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'Proxy error' })
    } finally {
      clearTimeout(timeout)
      releaseSlot(host)
    }
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'Proxy error' })
  }
})

server.listen(PORT, () => {
  console.log(`RSS proxy listening on http://localhost:${PORT}`)
})
