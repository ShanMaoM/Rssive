import { FEEDS } from '../reader/mockData'
import type { FeedInput, FeedRecord } from './types'
import {
  normalizeFeedIconSource,
  normalizeFeedIconValue,
} from './icon'
import { isDevSeedEnabled } from '../../shared/state/devSeed'

const STORAGE_KEY = 'rssive.feeds.v1'

const getNow = () => new Date().toISOString()

const normalizeSeed = (): FeedRecord[] => {
  const now = getNow()
  return FEEDS.map((feed: any) => ({
    ...((): Pick<FeedRecord, 'icon' | 'iconSource'> => {
      const source = normalizeFeedIconSource(undefined, feed.icon)
      return {
        iconSource: source,
        icon: normalizeFeedIconValue(feed.icon, feed.name || '', source),
      }
    })(),
    id: feed.id,
    title: feed.name,
    url: feed.url || '',
    siteUrl: feed.siteUrl || '',
    categoryId: feed.category,
    createdAt: now,
    updatedAt: now,
    etag: null,
    lastModified: null,
    lastStatus: null,
    lastFetchedAt: null,
    syncError: null,
    retryCount: 0,
    nextPollAt: null,
  }))
}

const parseFeeds = (raw: string | null): FeedRecord[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

const readStoredFeeds = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const persist = (feeds: FeedRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds))
  } catch {
    // ignore persistence errors (e.g. storage disabled)
  }
}

const normalizeStored = (feeds: FeedRecord[]): FeedRecord[] => {
  const now = getNow()
  return feeds.map(feed => {
    const source = normalizeFeedIconSource(
      (feed as FeedRecord & { iconSource?: string }).iconSource,
      feed.icon
    )
    return {
      etag: null,
      lastModified: null,
      lastStatus: null,
      lastFetchedAt: null,
      syncError: null,
      retryCount: 0,
      nextPollAt: null,
      ...feed,
      iconSource: source,
      icon: normalizeFeedIconValue(feed.icon, feed.title || '', source),
      createdAt: feed.createdAt || now,
      updatedAt: feed.updatedAt || now,
    }
  })
}

export const replaceFeeds = (feeds: FeedRecord[]): FeedRecord[] => {
  const normalized = normalizeStored(feeds)
  persist(normalized)
  return normalized
}

export const reorderFeeds = (orderedIds: number[]): FeedRecord[] => {
  const feeds = loadFeeds()
  if (!feeds.length) return feeds
  const byId = new Map(feeds.map(feed => [feed.id, feed]))
  const ordered = orderedIds
    .map(id => byId.get(id))
    .filter((feed): feed is FeedRecord => Boolean(feed))
  const orderedSet = new Set(ordered.map(feed => feed.id))
  const remaining = feeds.filter(feed => !orderedSet.has(feed.id))
  return replaceFeeds([...ordered, ...remaining])
}

export const loadFeeds = (): FeedRecord[] => {
  if (typeof window === 'undefined') return []
  const rawStored = readStoredFeeds()
  if (rawStored !== null) {
    const stored = parseFeeds(rawStored)
    if (!stored) {
      persist([])
      return []
    }
    return normalizeStored(stored)
  }
  const seeded = isDevSeedEnabled() ? normalizeSeed() : []
  persist(seeded)
  return seeded
}

export const addFeed = (input: FeedInput): FeedRecord => {
  const feeds = loadFeeds()
  const nextId = feeds.length ? Math.max(...feeds.map(feed => feed.id)) + 1 : 1
  const now = getNow()
  const iconSource = normalizeFeedIconSource(input.iconSource, input.icon)
  const record: FeedRecord = {
    id: nextId,
    title: input.title,
    url: input.url,
    siteUrl: input.siteUrl || '',
    categoryId: input.categoryId,
    iconSource,
    icon: normalizeFeedIconValue(input.icon, input.title || '', iconSource),
    createdAt: now,
    updatedAt: now,
    etag: null,
    lastModified: null,
    lastStatus: null,
    lastFetchedAt: null,
    syncError: null,
    retryCount: 0,
    nextPollAt: null,
  }
  const next = [record, ...feeds]
  persist(next)
  return record
}

export const removeFeed = (id: number): FeedRecord[] => {
  const feeds = loadFeeds().filter(feed => feed.id !== id)
  persist(feeds)
  return feeds
}

export const updateFeed = (id: number, updates: Partial<FeedRecord>): FeedRecord[] => {
  const now = getNow()
  const feeds = loadFeeds().map(feed => {
    if (feed.id !== id) return feed
    const nextIconSource = normalizeFeedIconSource(
      updates.iconSource ?? feed.iconSource,
      updates.icon ?? feed.icon
    )
    return {
      ...feed,
      ...updates,
      iconSource: nextIconSource,
      icon: normalizeFeedIconValue(
        updates.icon ?? feed.icon,
        updates.title ?? feed.title,
        nextIconSource
      ),
      updatedAt: now,
    }
  })
  persist(feeds)
  return feeds
}
