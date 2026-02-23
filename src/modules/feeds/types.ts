export type FeedCategoryId = string
export type FeedIconSource = 'auto' | 'custom'

export type FeedRecord = {
  id: number
  title: string
  url: string
  siteUrl?: string
  categoryId: FeedCategoryId
  icon?: string
  iconSource?: FeedIconSource
  createdAt: string
  updatedAt: string
  etag?: string | null
  lastModified?: string | null
  lastStatus?: number | null
  lastFetchedAt?: string | null
  syncError?: string | null
  retryCount?: number
  nextPollAt?: string | null
}

export type FeedInput = {
  title: string
  url: string
  siteUrl?: string
  categoryId: FeedCategoryId
  icon?: string
  iconSource?: FeedIconSource
}
