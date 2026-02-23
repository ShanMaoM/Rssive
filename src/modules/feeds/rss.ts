import type { FeedRecord } from './types'
import type { ArticleRecord } from '../articles/types'
import { fetchRssViaProxy } from '../../shared/services/rssProxy'
import { isFeedIconImage, normalizeFeedIconSource } from './icon'

const backoffScheduleMs = [60_000, 300_000, 900_000, 3_600_000]

const jitter = (ms: number) => Math.floor(ms * (0.8 + Math.random() * 0.4))

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const formatDate = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const estimateReadTime = (html: string) => {
  const text = stripHtml(html)
  const words = text ? text.split(/\s+/).length : 0
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min`
}

const hashString = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const extractFirstImage = (html: string) => {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : undefined
}

const normalizeContent = (item: any) => {
  return item['content:encoded'] || item.content || item.summary || item.contentSnippet || ''
}

const buildExternalId = (feedId: number, item: any) => {
  return (
    item.guid ||
    item.id ||
    item.link ||
    `${feedId}:${item.title || ''}:${item.pubDate || item.isoDate || ''}`
  )
}

type ArticleProjectionOptions = {
  lightweight?: boolean
}

const toArticleRecord = (
  feed: FeedRecord,
  item: any,
  options: ArticleProjectionOptions = {},
): ArticleRecord => {
  const externalId = buildExternalId(feed.id, item)
  const content = normalizeContent(item)
  const publishedIso = toIsoString(item.isoDate || item.pubDate)
  const date = formatDate(publishedIso)
  const summarySource = item.contentSnippet || item.summary || stripHtml(content)
  const summaryText = stripHtml(summarySource || '')
  const summary = summaryText.length > 240 ? `${summaryText.slice(0, 237)}...` : summaryText
  const lightweight = Boolean(options.lightweight)
  const image = (item.enclosure && item.enclosure.url) || extractFirstImage(content)

  if (lightweight) {
    const previewSource = summaryText || stripHtml(item.title || '')
    const preview = previewSource.length > 360 ? `${previewSource.slice(0, 357)}...` : previewSource
    return {
      id: hashString(`${feed.id}:${externalId}`),
      externalId,
      feedId: feed.id,
      feedName: feed.title,
      title: item.title || '(Untitled)',
      summary,
      date,
      publishedAt: publishedIso || undefined,
      author: item.creator || item.author || feed.title,
      image: undefined,
      content: preview ? `<p>${escapeHtml(preview)}</p>` : '<p>Open article to load content.</p>',
      link: item.link || undefined,
      isRead: false,
      isStarred: false,
      readTime: '1 min',
    }
  }

  return {
    id: hashString(`${feed.id}:${externalId}`),
    externalId,
    feedId: feed.id,
    feedName: feed.title,
    title: item.title || '(Untitled)',
    summary,
    date,
    publishedAt: publishedIso || undefined,
    author: item.creator || item.author || feed.title,
    image,
    content: content || summary || '<p>No content available.</p>',
    link: item.link || undefined,
    isRead: false,
    isStarred: false,
    readTime: estimateReadTime(content || summary),
  }
}

const shouldSkipFeed = (feed: FeedRecord, now: Date) => {
  if (!feed.nextPollAt) return false
  const next = new Date(feed.nextPollAt)
  if (Number.isNaN(next.getTime())) return false
  return next > now
}

const scheduleNextPoll = (attempt: number) => {
  const base = backoffScheduleMs[Math.min(attempt, backoffScheduleMs.length - 1)]
  return new Date(Date.now() + jitter(base)).toISOString()
}

const textContent = (node: Element | null) => (node ? node.textContent?.trim() || '' : '')

const parseItem = (item: Element) => {
  const get = (tag: string) => textContent(item.getElementsByTagName(tag)[0] || null)
  const guid = get('guid')
  const title = get('title')
  const link = get('link')
  const description = get('description')
  const summary = get('summary')
  const pubDate = get('pubDate') || get('published') || get('updated')
  const creator =
    get('dc:creator') ||
    get('creator') ||
    get('author') ||
    textContent(item.querySelector('author > name') || null)
  const contentEncoded = get('content:encoded')

  return {
    guid,
    title,
    link,
    summary: summary || description,
    content: contentEncoded || description || summary || '',
    contentSnippet: stripHtml(description || summary || ''),
    pubDate,
    isoDate: toIsoString(pubDate || null),
    creator,
  }
}

const parseFeedXml = (xml: string) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Failed to parse RSS XML')
  }

  const channel = doc.querySelector('channel')
  const atom = doc.querySelector('feed')
  const feedTitle =
    textContent(channel?.getElementsByTagName('title')[0] || null) ||
    textContent(atom?.getElementsByTagName('title')[0] || null)
  const feedLink =
    textContent(channel?.getElementsByTagName('link')[0] || null) ||
    textContent(atom?.getElementsByTagName('link')[0] || null)
  const feedIcon =
    textContent(channel?.querySelector('image > url') || null) ||
    textContent(atom?.querySelector('icon') || null) ||
    textContent(atom?.querySelector('logo') || null)

  const items = channel
    ? Array.from(channel.getElementsByTagName('item'))
    : Array.from(doc.getElementsByTagName('entry'))
  const parsedItems = items.map(parseItem)

  return { title: feedTitle, link: feedLink, icon: feedIcon, items: parsedItems }
}

const fetchFeed = async (
  feed: FeedRecord,
  options: {
    useConditionalHeaders?: boolean
  } = {},
) => {
  const useConditionalHeaders = options.useConditionalHeaders ?? true
  const headers: Record<string, string> = {}
  if (useConditionalHeaders) {
    if (feed.etag) headers['If-None-Match'] = feed.etag
    if (feed.lastModified) headers['If-Modified-Since'] = feed.lastModified
  }

  return fetchRssViaProxy(feed.url, headers)
}

const mapEntriesToItems = (entries: any[]) =>
  entries.map(entry => ({
    guid: entry.guid || entry.id,
    title: entry.title,
    link: entry.link,
    summary: entry.summary,
    content: entry.content,
    contentSnippet: entry.summary,
    pubDate: entry.published_at,
    isoDate: entry.published_at,
    creator: entry.author,
    enclosure: entry.enclosure?.[0] || entry.enclosure,
  }))

const parseFeedJson = (payload: any) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid RSS JSON')
  }

  if (payload.feed && Array.isArray(payload.entries)) {
    return {
      title: payload.feed.title || '',
      link: payload.feed.site_url || payload.feed.feed_url || '',
      icon: payload.feed.icon || payload.feed.favicon || '',
      items: mapEntriesToItems(payload.entries),
    }
  }

  return {
    title: payload.title || '',
    link: payload.link || '',
    icon: payload.icon || payload.favicon || '',
    items: Array.isArray(payload.items) ? payload.items : [],
  }
}

type SyncFeedsOptions = {
  force?: boolean
  lightweight?: boolean
  entryLimit?: number
}

export const syncFeeds = async (
  feeds: FeedRecord[],
  concurrency = 4,
  options: SyncFeedsOptions = {},
) => {
  const now = new Date()
  const force = Boolean(options.force)
  const lightweight = Boolean(options.lightweight)
  const entryLimit =
    typeof options.entryLimit === 'number' && Number.isFinite(options.entryLimit)
      ? Math.max(1, Math.floor(options.entryLimit))
      : null
  const queue = force ? feeds : feeds.filter(feed => !shouldSkipFeed(feed, now))
  const results: {
    feedId: number
    entries: ArticleRecord[]
    updates: Partial<FeedRecord>
  }[] = []
  let index = 0

  const worker = async () => {
    while (index < queue.length) {
      const current = queue[index]
      index += 1
      const updates: Partial<FeedRecord> = {
        lastFetchedAt: now.toISOString(),
        syncError: null,
      }

      try {
        const response = await fetchFeed(current, {
          useConditionalHeaders: !force,
        })
        updates.lastStatus = response.status
        if (response.etag) updates.etag = response.etag
        if (response.lastModified) updates.lastModified = response.lastModified

        if (response.status === 304) {
          updates.retryCount = 0
          updates.nextPollAt = null
          results.push({ feedId: current.id, entries: [], updates })
          continue
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}`)
        }

        const parsed = response.json ? parseFeedJson(response.json) : parseFeedXml(response.xml || '')
        if (!current.siteUrl && parsed.link) updates.siteUrl = parsed.link
        if (
          normalizeFeedIconSource(current.iconSource, current.icon) === 'auto' &&
          isFeedIconImage(parsed.icon)
        ) {
          updates.icon = parsed.icon
          updates.iconSource = 'auto'
        }

        const items = parsed.items || []
        const projectedItems = entryLimit != null ? items.slice(0, entryLimit) : items
        const entries = projectedItems.map((item: any) =>
          toArticleRecord(current, item, { lightweight }),
        )
        updates.retryCount = 0
        updates.nextPollAt = null
        results.push({ feedId: current.id, entries, updates })
      } catch (error) {
        const attempt = (current.retryCount || 0) + 1
        updates.retryCount = attempt
        updates.syncError = error instanceof Error ? error.message : 'Sync failed'
        updates.nextPollAt = scheduleNextPoll(attempt - 1)
        results.push({ feedId: current.id, entries: [], updates })
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  await Promise.all(workers)
  return results
}
