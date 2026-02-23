import { getDesktopApi, isDesktopRuntime } from './desktopApi'

const DEV_PROXY_BASE = 'http://localhost:8787'

export const DESKTOP_IMAGE_PROXY_ENDPOINT = 'rssive-image://proxy'

export type RuntimeProxyRequestInit = RequestInit & {
  timeoutMs?: number
  maxBytes?: number
}

export type RuntimeAiChatCompletionInput = {
  apiBase: string
  apiKey?: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const toHeaderRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {}
  const normalized = new Headers(headers)
  const result: Record<string, string> = {}
  normalized.forEach((value, key) => {
    result[key] = value
  })
  return result
}

const encodeRequestBody = (body: BodyInit | null | undefined) => {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    throw new Error('Blob request body is not supported in desktop proxy mode.')
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    throw new Error('FormData request body is not supported in desktop proxy mode.')
  }
  return String(body)
}

const decodeBase64Bytes = (value: string) => {
  const binary = atob(value || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const extractChatCompletionContent = (payload: unknown) => {
  const message = (payload as any)?.choices?.[0]?.message?.content
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

const raceWithAbort = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  let abortHandler: (() => void) | null = null
  const abortPromise = new Promise<T>((_, reject) => {
    abortHandler = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abortHandler!, { once: true })
  })
  try {
    return await Promise.race([promise, abortPromise])
  } finally {
    if (abortHandler) {
      signal.removeEventListener('abort', abortHandler)
    }
  }
}

export const isDesktopGatewayRuntime = () => isDesktopRuntime()

export const getRuntimeDesktopApi = () => getDesktopApi()

export const getRuntimeProxyBase = () => {
  if (isDesktopGatewayRuntime()) return ''
  const base = (import.meta.env.VITE_RSS_PROXY || '').trim()
  if (base) return trimTrailingSlash(base)
  if (import.meta.env.DEV) return DEV_PROXY_BASE
  return ''
}

export const getRuntimeProxyOrigin = () => {
  const base = getRuntimeProxyBase()
  if (base) return base
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export const getRuntimeImageProxyEndpoint = () => {
  if (isDesktopGatewayRuntime()) return DESKTOP_IMAGE_PROXY_ENDPOINT
  const origin = getRuntimeProxyOrigin()
  if (origin) return `${origin}/fetch/image`
  return '/fetch/image'
}

export const requestWithRuntimeProxy = async (url: string, init: RuntimeProxyRequestInit = {}) => {
  const desktopApi = getDesktopApi()
  const { timeoutMs, maxBytes, ...requestInit } = init
  if (!desktopApi) {
    return fetch(url, requestInit)
  }

  const invokePromise = desktopApi.tts.request({
    url,
    method: requestInit.method || 'GET',
    headers: toHeaderRecord(requestInit.headers),
    body: encodeRequestBody(requestInit.body) || undefined,
    timeoutMs,
    maxBytes,
  })
  const payload = await raceWithAbort(invokePromise, requestInit.signal || undefined)
  const headers = new Headers(payload.headers || {})
  const bytes = decodeBase64Bytes(payload.bodyBase64 || '')
  return new Response(bytes, {
    status: payload.status,
    headers,
  })
}

export const requestAiChatCompletionWithRuntime = async (
  input: RuntimeAiChatCompletionInput,
): Promise<DesktopAiChatCompletionResult> => {
  const apiBase = trimTrailingSlash(input.apiBase || '')
  const desktopApi = getDesktopApi()
  if (desktopApi) {
    return raceWithAbort(
      desktopApi.ai.requestChatCompletion({
        apiBase,
        apiKey: input.apiKey,
        model: input.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      }),
      input.signal,
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (input.apiKey) {
    headers.Authorization = `Bearer ${input.apiKey}`
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers,
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      error: errorText || `AI request failed with status ${response.status}.`,
    }
  }

  const payload = await response.json().catch(() => null)
  const content = extractChatCompletionContent(payload)
  if (!content) {
    return {
      ok: false,
      status: response.status,
      error: 'AI returned empty completion content.',
    }
  }
  return {
    ok: true,
    status: response.status,
    content,
  }
}
