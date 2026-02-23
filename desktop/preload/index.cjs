const { contextBridge, ipcRenderer } = require('electron')

const IPC_CHANNELS = {
  RSS_FETCH: 'rssive:rss:fetch',
  RSS_FETCH_HTML: 'rssive:rss:fetchHtml',
  AI_CHAT_COMPLETION: 'rssive:ai:chatCompletion',
  TTS_REQUEST: 'rssive:tts:request',
  SYSTEM_HEALTH: 'rssive:system:health',
  WINDOW_MINIMIZE: 'rssive:window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'rssive:window:toggleMaximize',
  WINDOW_CLOSE: 'rssive:window:close',
  WINDOW_GET_STATE: 'rssive:window:getState',
  WINDOW_STATE_CHANGED: 'rssive:window:stateChanged',
}

const bindWindowStateListener = listener => {
  const handler = (_event, payload) => {
    listener({
      isMaximized: Boolean(payload && payload.isMaximized),
    })
  }
  ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler)
  }
}

const desktopApi = {
  rss: {
    fetch: input => ipcRenderer.invoke(IPC_CHANNELS.RSS_FETCH, input),
    fetchHtml: input => ipcRenderer.invoke(IPC_CHANNELS.RSS_FETCH_HTML, input),
  },
  ai: {
    requestChatCompletion: input => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_COMPLETION, input),
  },
  tts: {
    request: input => ipcRenderer.invoke(IPC_CHANNELS.TTS_REQUEST, input),
  },
  system: {
    health: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_HEALTH),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
    onStateChange: listener => bindWindowStateListener(listener),
  },
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
