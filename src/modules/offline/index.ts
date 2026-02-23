type ReadableCacheRecord = {
  entryId: number
  content: string
  title?: string
  byline?: string | null
  excerpt?: string | null
  sourceUrl?: string
  imageUrls?: string[]
  cachedAt: number
}

type MetaCacheRecord = {
  entryId: number
  priority: number
  cachedAt: number
  lastAccessed: number
}

type TranslationCacheRecord = {
  cacheKey: string
  entryId: number
  translation: {
    text: string
    bullets?: string[]
    sourceLanguage: string
    targetLanguage: string
    outputStyle: string
    model: string
    createdAt: string
  }
  cachedAt: number
}

type SummaryCacheRecord = {
  cacheKey: string
  entryId: number
  summary: {
    summary: string
    keyPoints: string[]
    sentiment: string
    questions: string[]
    model: string
    createdAt: string
  }
  cachedAt: number
}

const DB_NAME = 'rssive-offline-cache'
const DB_VERSION = 4
const STORE_READABLE = 'entry_readable'
const STORE_IMAGES = 'entry_images'
const STORE_META = 'entry_meta'
const STORE_TRANSLATIONS = 'entry_translation_ai'
const STORE_SUMMARIES = 'entry_summary_ai'
const INDEX_META_LAST_ACCESSED = 'by-last-accessed'
const INDEX_IMAGES_CACHED_AT = 'by-cached-at'
const INDEX_TRANSLATIONS_CACHED_AT = 'by-cached-at'
const INDEX_SUMMARIES_CACHED_AT = 'by-cached-at'

const RETRY_LIMIT = 2
const RETRY_DELAY_MS = 80
const CACHE_MAINTENANCE_THROTTLE_MS = 30_000
const READABLE_CACHE_LIMIT = 120
const IMAGE_CACHE_LIMIT = 480
const SUMMARY_CACHE_LIMIT = 220
const TRANSLATION_CACHE_LIMIT = 220

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const shouldRetry = (error: unknown) => {
  const name = (error as { name?: string })?.name
  if (!name) return true
  return name !== 'QuotaExceededError' && name !== 'SecurityError'
}

const withRetry = async <T>(
  fn: () => Promise<T>,
  options: { retries?: number; delayMs?: number } = {}
) => {
  const retries = options.retries ?? RETRY_LIMIT
  const delayMs = options.delayMs ?? RETRY_DELAY_MS
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) {
        throw error
      }
      await sleep(delayMs * (attempt + 1))
      attempt += 1
    }
  }
}

let dbPromise: Promise<IDBDatabase> | null = null
let cacheMaintenanceInFlight: Promise<void> | null = null
let cacheMaintenanceQueued = false
let lastCacheMaintenanceAt = 0

const ensureStore = (
  db: IDBDatabase,
  tx: IDBTransaction,
  storeName: string,
  keyPath: string
) => {
  if (db.objectStoreNames.contains(storeName)) {
    return tx.objectStore(storeName)
  }
  return db.createObjectStore(storeName, { keyPath })
}

const ensureIndex = (store: IDBObjectStore, indexName: string, keyPath: string) => {
  if (store.indexNames.contains(indexName)) return
  store.createIndex(indexName, keyPath, { unique: false })
}

const openDb = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const tx = request.transaction
      if (!tx) return
      ensureStore(db, tx, STORE_READABLE, 'entryId')
      const imageStore = ensureStore(db, tx, STORE_IMAGES, 'url')
      const metaStore = ensureStore(db, tx, STORE_META, 'entryId')
      const translationStore = ensureStore(db, tx, STORE_TRANSLATIONS, 'cacheKey')
      const summaryStore = ensureStore(db, tx, STORE_SUMMARIES, 'cacheKey')

      ensureIndex(metaStore, INDEX_META_LAST_ACCESSED, 'lastAccessed')
      ensureIndex(imageStore, INDEX_IMAGES_CACHED_AT, 'cachedAt')
      ensureIndex(translationStore, INDEX_TRANSLATIONS_CACHED_AT, 'cachedAt')
      ensureIndex(summaryStore, INDEX_SUMMARIES_CACHED_AT, 'cachedAt')
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onblocked = () => {
      dbPromise = null
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })
  return dbPromise
}

const getStore = async (storeName: string, mode: IDBTransactionMode) => {
  const db = await openDb()
  const tx = db.transaction(storeName, mode)
  return { store: tx.objectStore(storeName), tx }
}

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const waitForTx = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const deleteOldestByIndex = async ({
  store,
  indexName,
  deleteCount,
  onDelete,
}: {
  store: IDBObjectStore
  indexName: string
  deleteCount: number
  onDelete?: (primaryKey: IDBValidKey) => void
}) => {
  if (deleteCount <= 0) return 0
  let remaining = deleteCount
  let removed = 0
  await new Promise<void>((resolve, reject) => {
    const request = store.index(indexName).openKeyCursor()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (remaining <= 0) {
        resolve()
        return
      }
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const primaryKey = cursor.primaryKey
      if (onDelete) {
        onDelete(primaryKey)
      } else {
        store.delete(primaryKey)
      }
      removed += 1
      remaining -= 1
      cursor.continue()
    }
  })
  return removed
}

const enforceReadableBudget = async (db: IDBDatabase) => {
  const tx = db.transaction([STORE_META, STORE_READABLE], 'readwrite')
  const metaStore = tx.objectStore(STORE_META)
  const readableStore = tx.objectStore(STORE_READABLE)
  const count = Number((await requestToPromise(metaStore.count())) || 0)
  const overflow = count - READABLE_CACHE_LIMIT
  if (overflow > 0) {
    await deleteOldestByIndex({
      store: metaStore,
      indexName: INDEX_META_LAST_ACCESSED,
      deleteCount: overflow,
      onDelete: (entryId) => {
        metaStore.delete(entryId)
        readableStore.delete(entryId)
      },
    })
  }
  await waitForTx(tx)
}

const enforceImageBudget = async (db: IDBDatabase) => {
  const tx = db.transaction(STORE_IMAGES, 'readwrite')
  const imageStore = tx.objectStore(STORE_IMAGES)
  const count = Number((await requestToPromise(imageStore.count())) || 0)
  const overflow = count - IMAGE_CACHE_LIMIT
  if (overflow > 0) {
    await deleteOldestByIndex({
      store: imageStore,
      indexName: INDEX_IMAGES_CACHED_AT,
      deleteCount: overflow,
    })
  }
  await waitForTx(tx)
}

const enforceTranslationBudget = async (db: IDBDatabase) => {
  const tx = db.transaction(STORE_TRANSLATIONS, 'readwrite')
  const translationStore = tx.objectStore(STORE_TRANSLATIONS)
  const count = Number((await requestToPromise(translationStore.count())) || 0)
  const overflow = count - TRANSLATION_CACHE_LIMIT
  if (overflow > 0) {
    await deleteOldestByIndex({
      store: translationStore,
      indexName: INDEX_TRANSLATIONS_CACHED_AT,
      deleteCount: overflow,
    })
  }
  await waitForTx(tx)
}

const enforceSummaryBudget = async (db: IDBDatabase) => {
  const tx = db.transaction(STORE_SUMMARIES, 'readwrite')
  const summaryStore = tx.objectStore(STORE_SUMMARIES)
  const count = Number((await requestToPromise(summaryStore.count())) || 0)
  const overflow = count - SUMMARY_CACHE_LIMIT
  if (overflow > 0) {
    await deleteOldestByIndex({
      store: summaryStore,
      indexName: INDEX_SUMMARIES_CACHED_AT,
      deleteCount: overflow,
    })
  }
  await waitForTx(tx)
}

const runCacheMaintenance = async () => {
  const db = await openDb()
  await enforceReadableBudget(db)
  await enforceImageBudget(db)
  await enforceTranslationBudget(db)
  await enforceSummaryBudget(db)
}

const scheduleCacheMaintenance = ({ force = false }: { force?: boolean } = {}) => {
  const now = Date.now()
  if (!force && now - lastCacheMaintenanceAt < CACHE_MAINTENANCE_THROTTLE_MS) return
  if (cacheMaintenanceInFlight) {
    cacheMaintenanceQueued = true
    return
  }
  lastCacheMaintenanceAt = now
  cacheMaintenanceInFlight = (async () => {
    try {
      await runCacheMaintenance()
    } catch {
      // Best effort only.
    } finally {
      cacheMaintenanceInFlight = null
      if (cacheMaintenanceQueued) {
        cacheMaintenanceQueued = false
        scheduleCacheMaintenance({ force: true })
      }
    }
  })()
}

const entryCacheInFlight = new Map<number, Promise<{ cachedReadable: boolean; cachedImages: number }>>()
const imageWriteInFlight = new Map<string, Promise<void>>()

export const normalizeImageUrl = (url: string, baseUrl?: string) => {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return ''
  try {
    return baseUrl ? new URL(url, baseUrl).toString() : new URL(url).toString()
  } catch {
    return url
  }
}

export const extractImageUrlsFromHtml = (html: string, baseUrl?: string) => {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const urls = Array.from(doc.images)
    .map(img => normalizeImageUrl(img.getAttribute('src') || '', baseUrl))
    .filter(Boolean)
  return Array.from(new Set(urls))
}

export const getCachedReadable = async (entryId: number): Promise<ReadableCacheRecord | null> => {
  try {
    return await withRetry(async () => {
      const { store, tx } = await getStore(STORE_READABLE, 'readonly')
      const record = await requestToPromise(store.get(entryId))
      await waitForTx(tx)
      return (record as ReadableCacheRecord) || null
    })
  } catch {
    return null
  }
}

export const setCachedReadable = async (record: ReadableCacheRecord) => {
  await withRetry(async () => {
    const { store, tx } = await getStore(STORE_READABLE, 'readwrite')
    store.put(record)
    await waitForTx(tx)
  })
  scheduleCacheMaintenance()
}

export const getCachedImage = async (url: string): Promise<Blob | null> => {
  if (!url) return null
  try {
    return await withRetry(async () => {
      const { store, tx } = await getStore(STORE_IMAGES, 'readonly')
      const record = await requestToPromise(store.get(url))
      await waitForTx(tx)
      return record?.blob || null
    })
  } catch {
    return null
  }
}

export const setCachedImage = async (url: string, blob: Blob) => {
  await withRetry(async () => {
    const { store, tx } = await getStore(STORE_IMAGES, 'readwrite')
    store.put({ url, blob, cachedAt: Date.now() })
    await waitForTx(tx)
  })
  scheduleCacheMaintenance()
}

export const getCachedTranslation = async (cacheKey: string): Promise<TranslationCacheRecord['translation'] | null> => {
  if (!cacheKey) return null
  try {
    return await withRetry(async () => {
      const { store, tx } = await getStore(STORE_TRANSLATIONS, 'readonly')
      const record = (await requestToPromise(store.get(cacheKey))) as TranslationCacheRecord | undefined
      await waitForTx(tx)
      return record?.translation || null
    })
  } catch {
    return null
  }
}

export const getCachedSummary = async (cacheKey: string): Promise<SummaryCacheRecord['summary'] | null> => {
  if (!cacheKey) return null
  try {
    return await withRetry(async () => {
      const { store, tx } = await getStore(STORE_SUMMARIES, 'readonly')
      const record = (await requestToPromise(store.get(cacheKey))) as SummaryCacheRecord | undefined
      await waitForTx(tx)
      return record?.summary || null
    })
  } catch {
    return null
  }
}

export const setCachedSummary = async (
  cacheKey: string,
  entryId: number,
  summary: SummaryCacheRecord['summary']
) => {
  if (!cacheKey) return
  await withRetry(async () => {
    const { store, tx } = await getStore(STORE_SUMMARIES, 'readwrite')
    store.put({ cacheKey, entryId, summary, cachedAt: Date.now() })
    await waitForTx(tx)
  })
  scheduleCacheMaintenance()
}

export const setCachedTranslation = async (
  cacheKey: string,
  entryId: number,
  translation: TranslationCacheRecord['translation']
) => {
  if (!cacheKey) return
  await withRetry(async () => {
    const { store, tx } = await getStore(STORE_TRANSLATIONS, 'readwrite')
    store.put({ cacheKey, entryId, translation, cachedAt: Date.now() })
    await waitForTx(tx)
  })
  scheduleCacheMaintenance()
}

export const markCacheAccess = async (entryId: number) => {
  try {
    await withRetry(async () => {
      const { store, tx } = await getStore(STORE_META, 'readwrite')
      const current = (await requestToPromise(store.get(entryId))) as MetaCacheRecord | undefined
      if (current) {
        store.put({ ...current, lastAccessed: Date.now() })
      }
      await waitForTx(tx)
    })
  } catch {
    // ignore
  }
}

const setReadableAndMeta = async (readable: ReadableCacheRecord, meta: MetaCacheRecord) => {
  await withRetry(async () => {
    const db = await openDb()
    const tx = db.transaction([STORE_READABLE, STORE_META], 'readwrite')
    tx.objectStore(STORE_READABLE).put(readable)
    tx.objectStore(STORE_META).put(meta)
    await waitForTx(tx)
  })
}

const cacheImageUrls = async (urls: string[], maxImages: number) => {
  let cachedCount = 0
  for (const url of urls.slice(0, maxImages)) {
    if (!url) continue
    try {
      const existing = await getCachedImage(url)
      if (existing) {
        cachedCount += 1
        continue
      }
      const inflight = imageWriteInFlight.get(url)
      if (inflight) {
        await inflight
        const cached = await getCachedImage(url)
        if (cached) cachedCount += 1
        continue
      }
      const task = (async () => {
        const response = await fetch(url)
        if (!response.ok) return
        const blob = await response.blob()
        await setCachedImage(url, blob)
      })()
      imageWriteInFlight.set(url, task)
      try {
        await task
      } finally {
        imageWriteInFlight.delete(url)
      }
      const cached = await getCachedImage(url)
      if (cached) cachedCount += 1
    } catch {
      // ignore per-image failures
    }
  }
  return cachedCount
}

export const cacheArticleAssets = async ({
  entryId,
  content,
  title,
  byline,
  excerpt,
  sourceUrl,
  baseUrl,
  coverImageUrl,
  priority,
  imageUrls,
  maxImages = 12,
  cacheImages = true,
}: {
  entryId: number
  content: string
  title?: string
  byline?: string | null
  excerpt?: string | null
  sourceUrl?: string
  baseUrl?: string
  coverImageUrl?: string
  priority: number
  imageUrls?: string[]
  maxImages?: number
  cacheImages?: boolean
}) => {
  if (!content) return { cachedReadable: false, cachedImages: 0 }
  const existing = entryCacheInFlight.get(entryId)
  if (existing) return existing

  const task = (async () => {
    const cachedAt = Date.now()
    const urls = imageUrls?.length ? imageUrls : extractImageUrlsFromHtml(content, baseUrl)
    const normalizedCover = coverImageUrl ? normalizeImageUrl(coverImageUrl, baseUrl) : ''
    const allImages = Array.from(new Set([normalizedCover, ...urls].filter(Boolean)))

    try {
      await setReadableAndMeta(
        {
          entryId,
          content,
          title,
          byline,
          excerpt,
          sourceUrl,
          imageUrls: allImages,
          cachedAt,
        },
        { entryId, priority, cachedAt, lastAccessed: cachedAt }
      )
      if (!cacheImages) {
        return { cachedReadable: true, cachedImages: 0 }
      }
      const cachedImages = await cacheImageUrls(allImages, maxImages)
      return { cachedReadable: true, cachedImages }
    } catch {
      return { cachedReadable: false, cachedImages: 0 }
    }
  })()

  entryCacheInFlight.set(entryId, task)
  try {
    return await task
  } finally {
    entryCacheInFlight.delete(entryId)
  }
}

export const buildOfflineQueue = (
  articles: { id: number; isStarred: boolean; isRead: boolean }[],
  limit = 30
) => {
  return articles
    .map((entry, index) => {
      const priority = entry.isStarred ? 3 : entry.isRead ? 1 : 2
      return { entry, priority, order: index }
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.order - b.order
    })
    .slice(0, limit)
}

export const pruneOfflineCache = async (keepEntryIds: number[]) => {
  if (!keepEntryIds.length) return
  try {
    const keepSet = new Set(keepEntryIds)
    const db = await openDb()

    const readTx = db.transaction(STORE_READABLE, 'readonly')
    const readableRecords = (await requestToPromise(readTx.objectStore(STORE_READABLE).getAll())) as ReadableCacheRecord[]
    await waitForTx(readTx)

    const keepImageUrls = new Set<string>()
    readableRecords.forEach(record => {
      if (!keepSet.has(record.entryId)) return
      record.imageUrls?.forEach(url => keepImageUrls.add(url))
    })

    const tx = db.transaction([STORE_READABLE, STORE_META, STORE_IMAGES, STORE_TRANSLATIONS, STORE_SUMMARIES], 'readwrite')
    const readableStore = tx.objectStore(STORE_READABLE)
    const metaStore = tx.objectStore(STORE_META)
    const imageStore = tx.objectStore(STORE_IMAGES)
    const translationStore = tx.objectStore(STORE_TRANSLATIONS)
    const summaryStore = tx.objectStore(STORE_SUMMARIES)

    const readableCursor = readableStore.openCursor()
    readableCursor.onsuccess = () => {
      const cursor = readableCursor.result
      if (!cursor) return
      const entryId = cursor.key as number
      if (!keepSet.has(entryId)) {
        cursor.delete()
      }
      cursor.continue()
    }

    const metaCursor = metaStore.openCursor()
    metaCursor.onsuccess = () => {
      const cursor = metaCursor.result
      if (!cursor) return
      const entryId = cursor.key as number
      if (!keepSet.has(entryId)) {
        cursor.delete()
      }
      cursor.continue()
    }

    const imageCursor = imageStore.openCursor()
    imageCursor.onsuccess = () => {
      const cursor = imageCursor.result
      if (!cursor) return
      const url = cursor.key as string
      if (!keepImageUrls.has(url)) {
        cursor.delete()
      }
      cursor.continue()
    }

    const translationCursor = translationStore.openCursor()
    translationCursor.onsuccess = () => {
      const cursor = translationCursor.result
      if (!cursor) return
      const entryId = Number((cursor.value as TranslationCacheRecord)?.entryId || 0)
      if (!keepSet.has(entryId)) {
        cursor.delete()
      }
      cursor.continue()
    }

    const summaryCursor = summaryStore.openCursor()
    summaryCursor.onsuccess = () => {
      const cursor = summaryCursor.result
      if (!cursor) return
      const entryId = Number((cursor.value as SummaryCacheRecord)?.entryId || 0)
      if (!keepSet.has(entryId)) {
        cursor.delete()
      }
      cursor.continue()
    }

    await waitForTx(tx)
    scheduleCacheMaintenance({ force: true })
  } catch {
    // ignore
  }
}
