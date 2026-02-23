import {
  DESKTOP_IMAGE_PROXY_ENDPOINT,
  getRuntimeDesktopApi,
  getRuntimeImageProxyEndpoint,
  getRuntimeProxyBase,
  getRuntimeProxyOrigin,
} from './runtimeGateway'

type ProxyResponse = {
  xml?: string
  json?: any
  etag?: string | null
  lastModified?: string | null
  status: number
  finalUrl?: string | null
}

const getProxyBase = () => {
  return getRuntimeProxyBase()
}

const getProxyOrigin = () => {
  return getRuntimeProxyOrigin()
}

const getProxyEndpoint = () => {
  const base = getProxyBase()
  if (base) return `${base}/fetch/rss`
  return '/fetch/rss'
}

const getHtmlEndpoint = () => {
  const base = getProxyBase()
  if (base) return `${base}/fetch/html`
  return '/fetch/html'
}

const getImageEndpoint = () => {
  return getRuntimeImageProxyEndpoint()
}

const isImageProxyUrl = (candidate: string) => {
  if (!candidate) return false
  if (candidate.startsWith(DESKTOP_IMAGE_PROXY_ENDPOINT)) {
    try {
      const parsed = new URL(candidate)
      return parsed.protocol === 'rssive-image:' && parsed.hostname === 'proxy' && parsed.searchParams.has('url')
    } catch {
      return false
    }
  }
  try {
    const originBase = getProxyOrigin() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const endpoint = new URL(getImageEndpoint(), originBase)
    const resolved = new URL(candidate, endpoint.origin)
    return (
      resolved.origin === endpoint.origin &&
      resolved.pathname === endpoint.pathname &&
      resolved.searchParams.has('url')
    )
  } catch {
    return false
  }
}

export const buildImageProxyUrl = (url: string) => {
  if (!url) return ''
  if (isImageProxyUrl(url)) return url
  const endpoint = getImageEndpoint()
  return `${endpoint}?url=${encodeURIComponent(url)}`
}

export const fetchRssViaProxy = async (url: string, headers: Record<string, string>) => {
  const desktopApi = getRuntimeDesktopApi()
  if (desktopApi) {
    const payload = await desktopApi.rss.fetch({ url, headers })
    return {
      xml: payload.xml,
      json: payload.json,
      status: payload.status,
      etag: payload.etag ?? null,
      lastModified: payload.lastModified ?? null,
      finalUrl: payload.finalUrl ?? null,
    } satisfies ProxyResponse
  }

  const endpoint = getProxyEndpoint()
  const requestUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`
  const response = await fetch(requestUrl, { headers, cache: 'no-store' })
  const etag = response.headers.get('etag')
  const lastModified = response.headers.get('last-modified')
  const finalUrl = response.headers.get('x-final-url') || response.headers.get('x-final-url'.toLowerCase())

  if (response.status === 304) {
    return { xml: '', status: 304, etag, lastModified, finalUrl } satisfies ProxyResponse
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const json = await response.json()
    return { json, status: response.status, etag, lastModified, finalUrl } satisfies ProxyResponse
  }

  const xml = await response.text()
  return { xml, status: response.status, etag, lastModified, finalUrl } satisfies ProxyResponse
}

export const fetchHtmlViaProxy = async (url: string, timeoutMs = 15000) => {
  const desktopApi = getRuntimeDesktopApi()
  if (desktopApi) {
    const payload = await desktopApi.rss.fetchHtml({ url, timeoutMs })
    return {
      status: payload.status,
      html: payload.html,
      finalUrl: payload.finalUrl ?? null,
      contentType: payload.contentType || 'text/html; charset=utf-8',
    }
  }

  const endpoint = getHtmlEndpoint()
  const requestUrl = `${endpoint}?url=${encodeURIComponent(url)}`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(requestUrl, { signal: controller.signal })
    const finalUrl = response.headers.get('x-final-url') || response.headers.get('x-final-url'.toLowerCase())
    const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8'
    const html = await response.text()
    return {
      status: response.status,
      html,
      finalUrl,
      contentType,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

export const checkProxyHealth = async (timeoutMs = 2000) => {
  const desktopApi = getRuntimeDesktopApi()
  if (desktopApi) {
    try {
      const payload = await desktopApi.system.health()
      return {
        ok: payload?.status === 'ok',
        status: payload?.status === 'ok' ? 200 : 503,
        payload,
      }
    } catch (error) {
      return {
        ok: false,
        status: 503,
        payload: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Desktop health check failed',
        },
      }
    }
  }

  const base = getProxyBase()
  const endpoint = base ? `${base}/health` : '/health'
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(endpoint, { signal: controller.signal })
    const payload = await response.json().catch(() => null)
    return {
      ok: response.ok && payload?.status === 'ok',
      status: response.status,
      payload,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}
