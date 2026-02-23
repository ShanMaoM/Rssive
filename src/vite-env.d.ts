/// <reference types="vite/client" />

declare const __APP_VERSION__: string

type DesktopRssFetchResult = {
  status: number
  etag?: string | null
  lastModified?: string | null
  finalUrl?: string | null
  json?: unknown
  xml?: string
}

type DesktopHtmlFetchResult = {
  status: number
  html: string
  finalUrl?: string | null
  contentType: string
}

type DesktopAiChatCompletionResult = {
  ok: boolean
  status: number
  content?: string
  error?: string
}

type DesktopTtsRequestPayload = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
}

type DesktopTtsResponsePayload = {
  status: number
  headers: Record<string, string>
  bodyBase64: string
  finalUrl?: string
}

type DesktopWindowStatePayload = {
  isMaximized: boolean
}

interface DesktopApi {
  rss: {
    fetch: (input: { url: string; headers?: Record<string, string> }) => Promise<DesktopRssFetchResult>
    fetchHtml: (input: { url: string; timeoutMs?: number }) => Promise<DesktopHtmlFetchResult>
  }
  ai: {
    requestChatCompletion: (input: {
      apiBase: string
      apiKey?: string
      model: string
      systemPrompt: string
      userPrompt: string
      temperature?: number
      timeoutMs?: number
    }) => Promise<DesktopAiChatCompletionResult>
  }
  tts: {
    request: (input: DesktopTtsRequestPayload) => Promise<DesktopTtsResponsePayload>
  }
  system: {
    health: () => Promise<{ status: string; version: string; uptime: number }>
  }
  window: {
    minimize: () => Promise<DesktopWindowStatePayload>
    toggleMaximize: () => Promise<DesktopWindowStatePayload>
    close: () => Promise<DesktopWindowStatePayload>
    getState: () => Promise<DesktopWindowStatePayload>
    onStateChange: (listener: (state: DesktopWindowStatePayload) => void) => () => void
  }
}

interface Window {
  desktopApi?: DesktopApi
}
