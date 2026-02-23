import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { DesktopProxyError, fetchHtml, fetchRss, getDesktopHealth } from '../services/network.js'

const toHeaderRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const headers: Record<string, string> = {}
  Object.entries(source).forEach(([key, rawValue]) => {
    if (typeof rawValue === 'string' && rawValue.trim()) {
      headers[key] = rawValue
    }
  })
  return headers
}

const toErrorStatus = (error: unknown) => (error instanceof DesktopProxyError ? error.status : 502)
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Proxy error')

export const registerRssIpcHandlers = () => {
  ipcMain.handle(IPC_CHANNELS.RSS_FETCH, async (_event, input: { url?: unknown; headers?: unknown }) => {
    const url = typeof input?.url === 'string' ? input.url.trim() : ''
    if (!url) {
      return {
        status: 400,
        etag: null,
        lastModified: null,
        finalUrl: null,
        xml: '',
      }
    }

    try {
      return await fetchRss({
        url,
        headers: toHeaderRecord(input.headers),
      })
    } catch (error) {
      return {
        status: toErrorStatus(error),
        etag: null,
        lastModified: null,
        finalUrl: null,
        xml: JSON.stringify({ error: toErrorMessage(error) }),
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RSS_FETCH_HTML, async (_event, input: { url?: unknown; timeoutMs?: unknown }) => {
    const url = typeof input?.url === 'string' ? input.url.trim() : ''
    const timeoutMs = typeof input?.timeoutMs === 'number' && input.timeoutMs > 0
      ? input.timeoutMs
      : undefined
    if (!url) {
      return {
        status: 400,
        html: '',
        finalUrl: null,
        contentType: 'text/plain; charset=utf-8',
      }
    }

    try {
      return await fetchHtml({ url, timeoutMs })
    } catch (error) {
      return {
        status: toErrorStatus(error),
        html: '',
        finalUrl: null,
        contentType: 'text/plain; charset=utf-8',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_HEALTH, async () => getDesktopHealth())
}
