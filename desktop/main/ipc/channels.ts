export const IPC_CHANNELS = {
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
} as const
