const DEV_SEED_STORAGE_KEY = 'rssive.dev-seed-enabled'

const isTruthyFlag = (value: string | null) => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export const getDevSeedStorageKey = () => DEV_SEED_STORAGE_KEY

export const isDevSeedEnabled = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try {
    return isTruthyFlag(localStorage.getItem(DEV_SEED_STORAGE_KEY))
  } catch {
    return false
  }
}
