import type { ArticleRecord } from '../articles/types'

export type SearchIndexEntry = {
  id: number
  haystack: string
}

const normalizeValue = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

export const normalizeQuery = (query: string) => normalizeValue(query || '')

export const buildSearchIndex = (articles: ArticleRecord[]): SearchIndexEntry[] => {
  return articles.map(article => ({
    id: article.id,
    haystack: normalizeValue(
      [article.title, article.feedName, article.summary].filter(Boolean).join(' ')
    ),
  }))
}

export const buildSearchMap = (articles: ArticleRecord[]) => {
  const map = new Map<number, string>()
  buildSearchIndex(articles).forEach(entry => {
    map.set(entry.id, entry.haystack)
  })
  return map
}

export const matchesSearch = (haystack: string | undefined, query: string) => {
  if (!query) return true
  if (!haystack) return false
  return haystack.includes(query)
}
