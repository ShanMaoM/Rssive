import type { FeedCategoryId } from './types'
import { isDevSeedEnabled } from '../../shared/state/devSeed'

export type FeedCategoryRecord = {
  id: FeedCategoryId
  name: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'rssive.feed-categories.v1'

export const DEFAULT_FEED_CATEGORY_ID: FeedCategoryId = 'general'

const RELEASE_BASELINE_CATEGORIES: FeedCategoryRecord[] = [
  { id: DEFAULT_FEED_CATEGORY_ID, name: 'General', createdAt: '', updatedAt: '' },
]

const DEV_SEED_CATEGORIES: FeedCategoryRecord[] = [
  { id: 'life', name: 'Lifestyle', createdAt: '', updatedAt: '' },
  { id: 'tech', name: 'Tech & Dev', createdAt: '', updatedAt: '' },
  { id: 'art', name: 'Photography', createdAt: '', updatedAt: '' },
]

const getNow = () => new Date().toISOString()

const parseCategories = (raw: string | null): FeedCategoryRecord[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map(item => ({
        id: String(item.id).trim(),
        name: String(item.name).trim(),
        createdAt: item.createdAt || '',
        updatedAt: item.updatedAt || '',
      }))
      .filter(item => item.id && item.name)
  } catch {
    return null
  }
}

const persistCategories = (categories: FeedCategoryRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
  } catch {
    // ignore storage errors
  }
}

const readStoredCategories = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const normalizeCategories = (categories: FeedCategoryRecord[]): FeedCategoryRecord[] => {
  const now = getNow()
  return categories.map(category => ({
    id: category.id,
    name: category.name,
    createdAt: category.createdAt || now,
    updatedAt: category.updatedAt || now,
  }))
}

const toTimestampedCategories = (categories: FeedCategoryRecord[]) => {
  const now = getNow()
  return categories.map(category => ({
    ...category,
    createdAt: now,
    updatedAt: now,
  }))
}

const buildReleaseBaselineCategories = () => toTimestampedCategories(RELEASE_BASELINE_CATEGORIES)

const buildInitialCategories = () => {
  if (isDevSeedEnabled()) return toTimestampedCategories(DEV_SEED_CATEGORIES)
  return buildReleaseBaselineCategories()
}

const slugifyCategoryId = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

const ensureUniqueCategoryId = (baseId: string, existingIds: Set<string>) => {
  let nextId = baseId || 'category'
  let counter = 2
  while (existingIds.has(nextId)) {
    nextId = `${baseId || 'category'}-${counter}`
    counter += 1
  }
  return nextId
}

export const loadFeedCategories = (): FeedCategoryRecord[] => {
  if (typeof window === 'undefined') {
    return buildReleaseBaselineCategories()
  }
  const rawStored = readStoredCategories()
  if (rawStored !== null) {
    const stored = parseCategories(rawStored)
    if (stored && stored.length) {
      const normalized = normalizeCategories(stored)
      persistCategories(normalized)
      return normalized
    }
    const fallback = buildReleaseBaselineCategories()
    persistCategories(fallback)
    return fallback
  }
  const seeded = buildInitialCategories()
  persistCategories(seeded)
  return seeded
}

export const replaceFeedCategories = (categories: FeedCategoryRecord[]) => {
  const normalized = normalizeCategories(categories.filter(category => category.id && category.name))
  const safe = normalized.length ? normalized : buildReleaseBaselineCategories()
  persistCategories(safe)
  return safe
}

export const addFeedCategory = (name: string) => {
  const nextName = name.trim()
  if (!nextName) {
    throw new Error('Category name is required.')
  }
  const categories = loadFeedCategories()
  if (categories.some(category => category.name.toLowerCase() === nextName.toLowerCase())) {
    throw new Error('Category already exists.')
  }
  const idBase = slugifyCategoryId(nextName)
  const existingIds = new Set(categories.map(category => category.id))
  const id = ensureUniqueCategoryId(idBase, existingIds)
  const now = getNow()
  const record: FeedCategoryRecord = {
    id,
    name: nextName,
    createdAt: now,
    updatedAt: now,
  }
  replaceFeedCategories([...categories, record])
  return record
}

export const updateFeedCategory = (id: FeedCategoryId, name: string) => {
  const nextName = name.trim()
  if (!nextName) {
    throw new Error('Category name is required.')
  }
  const categories = loadFeedCategories()
  if (!categories.some(category => category.id === id)) {
    throw new Error('Category not found.')
  }
  if (categories.some(category => category.id !== id && category.name.toLowerCase() === nextName.toLowerCase())) {
    throw new Error('Category already exists.')
  }
  const now = getNow()
  return replaceFeedCategories(
    categories.map(category => (
      category.id === id
        ? { ...category, name: nextName, updatedAt: now }
        : category
    ))
  )
}

export const removeFeedCategory = (id: FeedCategoryId) => {
  const categories = loadFeedCategories()
  const next = categories.filter(category => category.id !== id)
  return replaceFeedCategories(next)
}
