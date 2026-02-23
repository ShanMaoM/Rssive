// @ts-nocheck
import { useCallback, useDeferredValue, useMemo } from 'react'
import { Camera, Coffee, Layout, Rss } from 'lucide-react'
import { buildSearchMap, matchesSearch, normalizeQuery } from '../../modules/search'

const CATEGORY_ICON_MAP = {
  all: Layout,
  life: Coffee,
  tech: Rss,
  art: Camera,
}

export const useArticleViews = ({
  articles,
  feeds,
  feedCategories,
  selectedCategory,
  selectedFeedId,
  searchQuery,
  isSyncingFeeds,
  contextMenuFeedId,
  language,
  t,
}) => {
  const feedCategoryMap = useMemo(() => {
    const map = new Map()
    feeds.forEach(feed => map.set(feed.id, feed.categoryId))
    return map
  }, [feeds])

  const filteredFeeds = useMemo(() => {
    if (selectedCategory === 'all') return feeds
    return feeds.filter(feed => feed.categoryId === selectedCategory)
  }, [feeds, selectedCategory])

  const sidebarCategories = useMemo(() => {
    const managedCategories = feedCategories.map(category => ({
      id: category.id,
      name: category.id === 'life'
        ? t('category.life')
        : category.id === 'tech'
          ? t('category.tech')
          : category.id === 'art'
            ? t('category.art')
            : category.name,
      icon: CATEGORY_ICON_MAP[category.id] || Rss,
    }))
    return [{ id: 'all', name: t('nav.timeline'), icon: Layout }, ...managedCategories]
  }, [feedCategories, t])

  const deferredSearchQuery = useDeferredValue(searchQuery)
  const normalizedSearchQuery = useMemo(() => normalizeQuery(deferredSearchQuery), [deferredSearchQuery])
  const hasSearchQuery = normalizedSearchQuery.length > 0
  const searchIndex = useMemo(
    () => (hasSearchQuery ? buildSearchMap(articles) : null),
    [articles, hasSearchQuery],
  )

  const articleDateFormatter = useMemo(() => new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
  }), [language])

  const syncTimestampFormatter = useMemo(() => new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }), [language])

  const formatArticleDate = useCallback((article) => {
    if (!article) return ''
    const preferred = article.publishedAt ? new Date(article.publishedAt) : null
    if (preferred && !Number.isNaN(preferred.getTime())) {
      return articleDateFormatter.format(preferred)
    }
    const legacy = (article.date || '').trim()
    if (!legacy) return ''
    const parsedLegacy = new Date(legacy)
    if (!Number.isNaN(parsedLegacy.getTime())) {
      return articleDateFormatter.format(parsedLegacy)
    }
    return legacy
  }, [articleDateFormatter])

  const formatSyncTimestamp = useCallback((value) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return syncTimestampFormatter.format(parsed)
  }, [syncTimestampFormatter])

  const articleSortTimestampById = useMemo(() => {
    const map = new Map()
    articles.forEach(article => {
      const preferred = article?.publishedAt ? new Date(article.publishedAt) : null
      if (preferred && !Number.isNaN(preferred.getTime())) {
        map.set(article.id, preferred.getTime())
        return
      }
      const fallback = article?.date ? new Date(article.date) : null
      if (fallback && !Number.isNaN(fallback.getTime())) {
        map.set(article.id, fallback.getTime())
        return
      }
      map.set(article.id, 0)
    })
    return map
  }, [articles])

  const sortArticlesByRecency = useCallback((input) => {
    return [...input].sort((a, b) => {
      const byTime = (articleSortTimestampById.get(b.id) || 0) - (articleSortTimestampById.get(a.id) || 0)
      if (byTime !== 0) return byTime
      return b.id - a.id
    })
  }, [articleSortTimestampById])

  const sortedArticles = useMemo(() => sortArticlesByRecency(articles), [articles, sortArticlesByRecency])

  const latestSyncAt = useMemo(() => {
    let latest = null
    feeds.forEach(feed => {
      if (!feed.lastFetchedAt) return
      if (!latest) {
        latest = feed.lastFetchedAt
        return
      }
      if (new Date(feed.lastFetchedAt).getTime() > new Date(latest).getTime()) {
        latest = feed.lastFetchedAt
      }
    })
    return latest
  }, [feeds])

  const latestSyncErrorFeed = useMemo(() => {
    const failed = feeds.filter(feed => (feed.syncError || '').trim())
    if (!failed.length) return null
    return failed.reduce((latest, current) => {
      const latestTs = new Date(latest.updatedAt || latest.lastFetchedAt || 0).getTime()
      const currentTs = new Date(current.updatedAt || current.lastFetchedAt || 0).getTime()
      return currentTs > latestTs ? current : latest
    })
  }, [feeds])

  const syncStatusPrimary = useMemo(() => {
    if (isSyncingFeeds) return t('list.syncingFeeds')
    if (!latestSyncAt) return t('list.lastSyncNever')
    return t('list.lastSyncAt', { time: formatSyncTimestamp(latestSyncAt) })
  }, [isSyncingFeeds, latestSyncAt, formatSyncTimestamp, t])

  const syncStatusSecondary = useMemo(() => {
    if (isSyncingFeeds) return ''
    if (!latestSyncErrorFeed) return ''
    const reason = (latestSyncErrorFeed.syncError || '').trim() || 'Unknown error'
    const compactReason = reason.length > 90 ? `${reason.slice(0, 87)}...` : reason
    const retryAt = formatSyncTimestamp(latestSyncErrorFeed.nextPollAt)
    if (retryAt) {
      return `${t('list.syncFailed', { feed: latestSyncErrorFeed.title, reason: compactReason })} · ${t('list.nextRetryAt', { time: retryAt })}`
    }
    return t('list.syncFailed', { feed: latestSyncErrorFeed.title, reason: compactReason })
  }, [isSyncingFeeds, latestSyncErrorFeed, formatSyncTimestamp, t])

  const contextMenuFeed = useMemo(
    () => feeds.find(feed => feed.id === contextMenuFeedId) || null,
    [feeds, contextMenuFeedId],
  )

  const navigableArticles = useMemo(() => {
    return sortedArticles.filter(article => {
      const matchesCategory = selectedCategory === 'all' || feedCategoryMap.get(article.feedId) === selectedCategory
      const matchesFeed = selectedFeedId == null || article.feedId === selectedFeedId
      return matchesCategory && matchesFeed
    })
  }, [sortedArticles, selectedCategory, selectedFeedId, feedCategoryMap])

  const filteredArticles = useMemo(() => {
    return sortedArticles.filter(article => {
      const matchesQuery = hasSearchQuery
        ? matchesSearch(searchIndex?.get(article.id), normalizedSearchQuery)
        : true
      const matchesCategory = selectedCategory === 'all' || feedCategoryMap.get(article.feedId) === selectedCategory
      const matchesFeed = selectedFeedId == null || article.feedId === selectedFeedId
      return matchesQuery && matchesCategory && matchesFeed
    })
  }, [
    sortedArticles,
    hasSearchQuery,
    searchIndex,
    normalizedSearchQuery,
    selectedCategory,
    selectedFeedId,
    feedCategoryMap,
  ])

  return {
    feedCategoryMap,
    filteredFeeds,
    sidebarCategories,
    formatArticleDate,
    syncStatusPrimary,
    syncStatusSecondary,
    contextMenuFeed,
    navigableArticles,
    filteredArticles,
  }
}

