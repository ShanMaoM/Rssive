import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels.js'

type WindowStatePayload = {
  isMaximized: boolean
}

const bindWindowStateListener = (listener: (state: WindowStatePayload) => void) => {
  const handler = (_event: unknown, payload: WindowStatePayload) => {
    listener({
      isMaximized: Boolean(payload?.isMaximized),
    })
  }
  ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler)
  }
}

const desktopApi = {
  rss: {
    fetch: (input: { url: string; headers?: Record<string, string> }) =>
      ipcRenderer.invoke(IPC_CHANNELS.RSS_FETCH, input),
    fetchHtml: (input: { url: string; timeoutMs?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.RSS_FETCH_HTML, input),
  },
  ai: {
    requestChatCompletion: (input: {
      apiBase: string
      apiKey?: string
      model: string
      systemPrompt: string
      userPrompt: string
      temperature?: number
      timeoutMs?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_COMPLETION, input),
  },
  tts: {
    request: (input: {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
      timeoutMs?: number
      maxBytes?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.TTS_REQUEST, input),
  },
  system: {
    health: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_HEALTH),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
    onStateChange: (listener: (state: WindowStatePayload) => void) => bindWindowStateListener(listener),
  },
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
