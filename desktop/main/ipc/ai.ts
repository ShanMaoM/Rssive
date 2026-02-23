import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { DesktopProxyError, requestAiChatCompletion } from '../services/network.js'

const toErrorStatus = (error: unknown) => (error instanceof DesktopProxyError ? error.status : 502)
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'AI proxy error')

export const registerAiIpcHandlers = () => {
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_COMPLETION,
    async (_event, input: {
      apiBase?: unknown
      apiKey?: unknown
      model?: unknown
      systemPrompt?: unknown
      userPrompt?: unknown
      temperature?: unknown
      timeoutMs?: unknown
    }) => {
      const apiBase = typeof input?.apiBase === 'string' ? input.apiBase : ''
      const model = typeof input?.model === 'string' ? input.model : ''
      const systemPrompt = typeof input?.systemPrompt === 'string' ? input.systemPrompt : ''
      const userPrompt = typeof input?.userPrompt === 'string' ? input.userPrompt : ''
      const apiKey = typeof input?.apiKey === 'string' ? input.apiKey : undefined
      const temperature = typeof input?.temperature === 'number' ? input.temperature : undefined
      const timeoutMs = typeof input?.timeoutMs === 'number' ? input.timeoutMs : undefined

      if (!apiBase.trim() || !model.trim()) {
        return {
          ok: false,
          status: 400,
          error: 'Missing apiBase or model',
        }
      }

      try {
        return await requestAiChatCompletion({
          apiBase,
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          temperature,
          timeoutMs,
        })
      } catch (error) {
        return {
          ok: false,
          status: toErrorStatus(error),
          error: toErrorMessage(error),
        }
      }
    },
  )
}
