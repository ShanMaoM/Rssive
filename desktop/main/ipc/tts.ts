import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { DesktopProxyError, proxyTtsRequest } from '../services/network.js'

const toErrorStatus = (error: unknown) => (error instanceof DesktopProxyError ? error.status : 502)
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'TTS proxy error')

const buildErrorResponse = (status: number, message: string) => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
  },
  bodyBase64: Buffer.from(JSON.stringify({ error: message }), 'utf8').toString('base64'),
})

export const registerTtsIpcHandlers = () => {
  ipcMain.handle(
    IPC_CHANNELS.TTS_REQUEST,
    async (_event, input: {
      url?: unknown
      method?: unknown
      headers?: unknown
      body?: unknown
      timeoutMs?: unknown
      maxBytes?: unknown
    }) => {
      const url = typeof input?.url === 'string' ? input.url : ''
      const method = typeof input?.method === 'string' ? input.method : 'GET'
      const body = typeof input?.body === 'string' ? input.body : undefined
      const timeoutMs = typeof input?.timeoutMs === 'number' ? input.timeoutMs : undefined
      const maxBytes = typeof input?.maxBytes === 'number' ? input.maxBytes : undefined
      const headers = (input?.headers && typeof input.headers === 'object')
        ? Object.entries(input.headers as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === 'string') acc[key] = value
          return acc
        }, {})
        : undefined

      if (!url.trim()) {
        return buildErrorResponse(400, 'Missing URL')
      }

      try {
        return await proxyTtsRequest({
          url,
          method,
          headers,
          body,
          timeoutMs,
          maxBytes,
        })
      } catch (error) {
        return buildErrorResponse(toErrorStatus(error), toErrorMessage(error))
      }
    },
  )
}
