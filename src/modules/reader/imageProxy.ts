import { buildImageProxyUrl } from '../../shared/services/rssProxy'
import { normalizeImageUrl } from '../offline'

const isHttpUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')
const HTML_REWRITE_CACHE_LIMIT = 120
const htmlRewriteCache = new Map<string, string>()

const hashText = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24)
  }
  return (hash >>> 0).toString(36)
}

const getHtmlCacheKey = (html: string, baseUrl?: string) => {
  return `${baseUrl || ''}:${html.length}:${hashText(html)}`
}

const setHtmlRewriteCache = (cacheKey: string, value: string) => {
  if (htmlRewriteCache.has(cacheKey)) {
    htmlRewriteCache.delete(cacheKey)
  }
  htmlRewriteCache.set(cacheKey, value)
  if (htmlRewriteCache.size > HTML_REWRITE_CACHE_LIMIT) {
    const firstKey = htmlRewriteCache.keys().next().value
    if (firstKey) {
      htmlRewriteCache.delete(firstKey)
    }
  }
}

export const getProxiedImageUrl = (url: string, baseUrl?: string) => {
  const normalized = normalizeImageUrl(url, baseUrl)
  if (!normalized) return ''
  if (!isHttpUrl(normalized)) return ''
  return buildImageProxyUrl(normalized)
}

export const rewriteHtmlImageUrls = (html: string, baseUrl?: string) => {
  if (!html) return html
  const cacheKey = getHtmlCacheKey(html, baseUrl)
  const cached = htmlRewriteCache.get(cacheKey)
  if (cached != null) {
    return cached
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.images)
  for (const image of images) {
    const rawSrc = image.getAttribute('src') || ''
    const proxied = getProxiedImageUrl(rawSrc, baseUrl)
    if (proxied) image.setAttribute('src', proxied)

    const srcset = image.getAttribute('srcset')
    if (srcset) {
      const rewritten = srcset
        .split(',')
        .map(entry => {
          const trimmed = entry.trim()
          if (!trimmed) return ''
          const [candidateUrl, ...rest] = trimmed.split(/\s+/)
          const proxiedCandidate = getProxiedImageUrl(candidateUrl, baseUrl)
          const finalUrl = proxiedCandidate || candidateUrl
          const descriptor = rest.join(' ')
          return descriptor ? `${finalUrl} ${descriptor}` : finalUrl
        })
        .filter(Boolean)
        .join(', ')
      if (rewritten) image.setAttribute('srcset', rewritten)
    }
  }
  const rewrittenHtml = doc.body.innerHTML
  setHtmlRewriteCache(cacheKey, rewrittenHtml)
  return rewrittenHtml
}
