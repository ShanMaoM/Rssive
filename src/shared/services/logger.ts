import {
  getDeveloperLogEnabledPreference,
  getDeveloperLogLevelPreference,
  type DeveloperLogLevelPreference,
} from '../state/preferences'

export type DeveloperLogResult = 'info' | 'success' | 'failure'

export type DeveloperLogEntry = {
  id: string
  timestamp: string
  level: DeveloperLogLevelPreference
  module: string
  action: string
  result: DeveloperLogResult
  errorCode?: string
  context?: Record<string, unknown>
}

export type DeveloperLogInput = {
  level?: DeveloperLogLevelPreference
  module: string
  action: string
  result?: DeveloperLogResult
  errorCode?: string | null
  context?: unknown
}

export type DeveloperLogExport = {
  exportedAt: string
  total: number
  retentionLimit: number
  logs: DeveloperLogEntry[]
}

const STORAGE_KEY = 'rss-developer-logs'
const LEVEL_WEIGHT: Record<DeveloperLogLevelPreference, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY_PATTERN = /(api[-_]?key|token|cookie|authorization|secret|password|credential|session)/i
const CREDENTIAL_URL_PATTERN = /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+[^\s]*/gi
const QUERY_SECRET_PATTERN = /([?&](?:api[-_]?key|token|access_token|auth|authorization|cookie|password|secret|credential)=)[^&\s]*/gi
const BEARER_PATTERN = /\b(Bearer)\s+([A-Za-z0-9._\-+/=]+)/gi
const OPENAI_KEY_PATTERN = /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/g
const MAX_STRING_LENGTH = 600
const MAX_CONTEXT_DEPTH = 4
const MAX_OBJECT_KEYS = 40
const MAX_ARRAY_ITEMS = 40
export const DEVELOPER_LOG_RETENTION_LIMIT = 320

const readStorage = () => {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const writeStorage = (value: string) => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Ignore storage failures.
  }
}

const normalizeLevel = (value?: DeveloperLogLevelPreference): DeveloperLogLevelPreference => {
  if (value && Object.prototype.hasOwnProperty.call(LEVEL_WEIGHT, value)) return value
  return 'info'
}

const normalizeResult = (value?: DeveloperLogResult): DeveloperLogResult => {
  if (value === 'success' || value === 'failure' || value === 'info') return value
  return 'info'
}

const passesLevelGate = (level: DeveloperLogLevelPreference, minLevel: DeveloperLogLevelPreference) => {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minLevel]
}

const truncateString = (value: string) => {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}...(truncated)`
}

const redactUrlCredentials = (value: string) => {
  return value.replace(CREDENTIAL_URL_PATTERN, (match) => {
    try {
      const url = new URL(match)
      if (!url.username && !url.password) return match
      url.username = '[REDACTED]'
      url.password = '[REDACTED]'
      return url.toString()
    } catch {
      return match.replace(/\/\/([^:/\s]+):([^@/\s]+)@/, '//[REDACTED]:[REDACTED]@')
    }
  })
}

const sanitizeString = (value: string) => {
  if (!value) return value
  let next = value
  next = redactUrlCredentials(next)
  next = next.replace(QUERY_SECRET_PATTERN, '$1[REDACTED]')
  next = next.replace(BEARER_PATTERN, '$1 [REDACTED]')
  next = next.replace(OPENAI_KEY_PATTERN, '[REDACTED]')
  return truncateString(next)
}

const sanitizeValue = (
  value: unknown,
  {
    depth = 0,
    keyHint = '',
    seen = new WeakSet<object>(),
  }: {
    depth?: number
    keyHint?: string
    seen?: WeakSet<object>
  } = {},
): unknown => {
  if (value === null || value === undefined) return value
  if (SENSITIVE_KEY_PATTERN.test(keyHint)) return '[REDACTED]'
  if (depth >= MAX_CONTEXT_DEPTH) return '[TRUNCATED_DEPTH]'
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message || ''),
      stack: sanitizeString(value.stack || ''),
    }
  }
  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS).map(item =>
      sanitizeValue(item, { depth: depth + 1, keyHint, seen }),
    )
    if (value.length > MAX_ARRAY_ITEMS) {
      limited.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return limited
  }
  if (typeof value === 'object') {
    const target = value as Record<string, unknown>
    if (seen.has(target)) return '[CIRCULAR]'
    seen.add(target)
    const keys = Object.keys(target)
    const limitedKeys = keys.slice(0, MAX_OBJECT_KEYS)
    const output: Record<string, unknown> = {}
    limitedKeys.forEach((key) => {
      output[key] = sanitizeValue(target[key], {
        depth: depth + 1,
        keyHint: key,
        seen,
      })
    })
    if (keys.length > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = keys.length - MAX_OBJECT_KEYS
    }
    return output
  }
  return sanitizeString(String(value))
}

const toContextRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || value === undefined) return undefined
  const sanitized = sanitizeValue(value)
  if (sanitized === undefined || sanitized === null) return undefined
  if (typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>
  }
  return { value: sanitized }
}

const safeParseLogs = (raw: string | null): DeveloperLogEntry[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const record = item as Record<string, unknown>
        const level = normalizeLevel(record.level as DeveloperLogLevelPreference | undefined)
        return {
          id: typeof record.id === 'string' ? record.id : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
          level,
          module: typeof record.module === 'string' ? record.module : 'unknown',
          action: typeof record.action === 'string' ? record.action : 'unknown',
          result: normalizeResult(record.result as DeveloperLogResult | undefined),
          errorCode: typeof record.errorCode === 'string' ? record.errorCode : undefined,
          context: toContextRecord(record.context),
        } satisfies DeveloperLogEntry
      })
      .slice(-DEVELOPER_LOG_RETENTION_LIMIT)
  } catch {
    return []
  }
}

export const getDeveloperLogs = (): DeveloperLogEntry[] => {
  return safeParseLogs(readStorage())
}

export const clearDeveloperLogs = () => {
  writeStorage('[]')
}

export const writeDeveloperLog = (input: DeveloperLogInput): DeveloperLogEntry | null => {
  if (!getDeveloperLogEnabledPreference()) return null

  const level = normalizeLevel(input.level)
  const minLevel = getDeveloperLogLevelPreference()
  if (!passesLevelGate(level, minLevel)) return null

  const entry: DeveloperLogEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    module: sanitizeString((input.module || 'unknown').trim() || 'unknown'),
    action: sanitizeString((input.action || 'unknown').trim() || 'unknown'),
    result: normalizeResult(input.result),
    errorCode: input.errorCode ? sanitizeString(String(input.errorCode)) : undefined,
    context: toContextRecord(input.context),
  }

  const logs = [...getDeveloperLogs(), entry]
  const next = logs.slice(-DEVELOPER_LOG_RETENTION_LIMIT)
  writeStorage(JSON.stringify(next))
  return entry
}

export const createDeveloperLogExport = (): DeveloperLogExport => {
  const logs = getDeveloperLogs()
  return {
    exportedAt: new Date().toISOString(),
    total: logs.length,
    retentionLimit: DEVELOPER_LOG_RETENTION_LIMIT,
    logs,
  }
}

export const downloadDeveloperLogExport = (
  payload: DeveloperLogExport,
  fileName: string,
) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Download is unavailable in this environment.')
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}
