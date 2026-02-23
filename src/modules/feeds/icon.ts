import type { FeedIconSource, FeedRecord } from './types'

const HTTP_ICON_RE = /^https?:\/\//i
const DATA_IMAGE_RE = /^data:image\//i
const LEGACY_AUTO_ICON_RE = /^[A-Z0-9]$/i

type AutoIconInput = Pick<FeedRecord, 'title' | 'url' | 'siteUrl'>

const resolvedHostIconCache = new Map<string, string>()

const toTrimmed = (value?: string | null) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const firstGlyph = (value: string) => {
  const [glyph] = Array.from(value)
  return glyph || 'R'
}

const parseUrl = (value?: string | null) => {
  const trimmed = toTrimmed(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

const getFirstHost = (input: AutoIconInput) => {
  const site = parseUrl(input.siteUrl)
  if (site?.hostname) return site.hostname
  const feed = parseUrl(input.url)
  return feed?.hostname || ''
}

export const isFeedIconImage = (value?: string | null) => {
  const trimmed = toTrimmed(value)
  if (!trimmed) return false
  return HTTP_ICON_RE.test(trimmed) || DATA_IMAGE_RE.test(trimmed)
}

export const isFeedDataImage = (value?: string | null) => DATA_IMAGE_RE.test(toTrimmed(value))

export const getFeedIconFallback = (title?: string | null) => {
  const base = toTrimmed(title)
  if (!base) return 'R'
  return firstGlyph(base).toUpperCase()
}

export const getFeedIconText = (title?: string | null, icon?: string | null) => {
  const trimmed = toTrimmed(icon)
  if (trimmed && !isFeedIconImage(trimmed)) {
    return firstGlyph(trimmed).toUpperCase()
  }
  return getFeedIconFallback(title)
}

export const inferFeedIconSource = (icon?: string | null): FeedIconSource => {
  const trimmed = toTrimmed(icon)
  if (!trimmed) return 'auto'
  if (isFeedIconImage(trimmed)) return 'custom'
  if (LEGACY_AUTO_ICON_RE.test(trimmed)) return 'auto'
  return 'custom'
}

export const normalizeFeedIconSource = (
  iconSource?: string | null,
  icon?: string | null
): FeedIconSource => {
  if (iconSource === 'auto' || iconSource === 'custom') return iconSource
  return inferFeedIconSource(icon)
}

export const normalizeFeedIconValue = (
  icon: string | null | undefined,
  title: string,
  iconSource: FeedIconSource
) => {
  const trimmed = toTrimmed(icon)
  if (!trimmed) return getFeedIconFallback(title)
  if (isFeedIconImage(trimmed)) return trimmed
  if (iconSource === 'custom') return trimmed
  return getFeedIconText(title, trimmed)
}

export const shouldRefreshAutoFeedIcon = (
  feed: Pick<FeedRecord, 'icon' | 'iconSource'>
) => {
  const source = normalizeFeedIconSource(feed.iconSource, feed.icon)
  if (source !== 'auto') return false
  return !isFeedIconImage(feed.icon)
}

const buildAutoIconCandidates = (input: AutoIconInput) => {
  const candidates: string[] = []
  const seen = new Set<string>()
  const push = (value: string) => {
    const trimmed = toTrimmed(value)
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    candidates.push(trimmed)
  }

  const site = parseUrl(input.siteUrl)
  const feed = parseUrl(input.url)
  const primary = site || feed

  if (primary) {
    push(new URL('/favicon.ico', primary.origin).toString())
    push(new URL('/apple-touch-icon.png', primary.origin).toString())
    push(new URL('/favicon.png', primary.origin).toString())
  }

  const host = getFirstHost(input)
  if (host) {
    push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`)
    push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`)
  }

  return candidates
}

const probeImage = (url: string, timeoutMs = 5000) => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(false)
  }

  return new Promise<boolean>(resolve => {
    const img = new Image()
    const timeoutId = window.setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      img.onload = null
      img.onerror = null
    }

    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      cleanup()
      resolve(true)
    }
    img.onerror = () => {
      cleanup()
      resolve(false)
    }
    img.src = url
  })
}

export const fetchAutoFeedIcon = async (input: AutoIconInput) => {
  const fallback = getFeedIconFallback(input.title)
  const host = getFirstHost(input)

  if (host && resolvedHostIconCache.has(host)) {
    return resolvedHostIconCache.get(host) || fallback
  }

  const candidates = buildAutoIconCandidates(input)
  for (const candidate of candidates) {
    const ok = await probeImage(candidate)
    if (!ok) continue
    if (host) resolvedHostIconCache.set(host, candidate)
    return candidate
  }

  return fallback
}

