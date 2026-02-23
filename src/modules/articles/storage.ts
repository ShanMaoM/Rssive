import type { ArticleRecord } from './types'

const STORAGE_KEY = 'rssive.entries.v1'

const parseEntries = (raw: string | null): ArticleRecord[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

const persist = (entries: ArticleRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore persistence errors (e.g. storage disabled)
  }
}

const toSortTimestamp = (entry: ArticleRecord) => {
  if (entry.publishedAt) {
    const parsed = new Date(entry.publishedAt)
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime()
  }
  const fallback = new Date(entry.date || '')
  if (!Number.isNaN(fallback.getTime())) return fallback.getTime()
  return 0
}

const sortEntriesByRecency = (entries: ArticleRecord[]) => {
  return [...entries].sort((a, b) => {
    const byTime = toSortTimestamp(b) - toSortTimestamp(a)
    if (byTime !== 0) return byTime
    return b.id - a.id
  })
}

export const loadEntries = (): ArticleRecord[] => {
  if (typeof window === 'undefined') return []
  const stored = parseEntries(localStorage.getItem(STORAGE_KEY))
  if (!stored) return []
  return sortEntriesByRecency(stored)
}

export const clearEntries = (): ArticleRecord[] => {
  persist([])
  return []
}

export const mergeEntries = (incoming: ArticleRecord[]): ArticleRecord[] => {
  const existing = loadEntries()
  const existingByExternal = new Map(existing.map(entry => [entry.externalId, entry]))
  const merged = incoming.map(entry => {
    const prior = existingByExternal.get(entry.externalId)
    if (!prior) return entry
    return {
      ...entry,
      isRead: prior.isRead,
      isStarred: prior.isStarred,
    }
  })
  const sorted = sortEntriesByRecency(merged)
  persist(sorted)
  return sorted
}

export const upsertEntries = (incoming: ArticleRecord[]): ArticleRecord[] => {
  const existing = loadEntries()
  const byExternal = new Map(existing.map(entry => [entry.externalId, entry]))
  incoming.forEach(entry => {
    const prior = byExternal.get(entry.externalId)
    if (!prior) {
      byExternal.set(entry.externalId, entry)
      return
    }
    byExternal.set(entry.externalId, {
      ...entry,
      isRead: prior.isRead,
      isStarred: prior.isStarred,
    })
  })
  const merged = Array.from(byExternal.values())
  const sorted = sortEntriesByRecency(merged)
  persist(sorted)
  return sorted
}

export const removeEntriesByFeedIds = (feedIds: number[]): ArticleRecord[] => {
  if (!feedIds.length) return loadEntries()
  const existing = loadEntries()
  const keep = existing.filter(entry => !feedIds.includes(entry.feedId))
  persist(keep)
  return keep
}

const updateEntry = (
  entryId: number,
  updater: (entry: ArticleRecord) => ArticleRecord,
  sourceEntries?: ArticleRecord[],
): ArticleRecord[] => {
  const existing = sourceEntries ?? loadEntries()
  if (!existing.length) return existing
  let didUpdate = false
  const updated = existing.map(entry => {
    if (entry.id !== entryId) return entry
    didUpdate = true
    return updater(entry)
  })
  if (!didUpdate) return existing
  persist(updated)
  return updated
}

export const updateEntryState = (
  entryId: number,
  updates: Partial<Pick<ArticleRecord, 'isRead' | 'isStarred'>>,
  sourceEntries?: ArticleRecord[],
): ArticleRecord[] =>
  updateEntry(entryId, entry => ({
    ...entry,
    ...updates,
  }), sourceEntries)

export const toggleEntryRead = (entryId: number, sourceEntries?: ArticleRecord[]): ArticleRecord[] =>
  updateEntry(entryId, entry => ({
    ...entry,
    isRead: !entry.isRead,
  }), sourceEntries)

export const toggleEntryStar = (entryId: number, sourceEntries?: ArticleRecord[]): ArticleRecord[] =>
  updateEntry(entryId, entry => ({
    ...entry,
    isStarred: !entry.isStarred,
  }), sourceEntries)
