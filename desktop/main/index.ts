import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, protocol } from 'electron'
import { registerRssIpcHandlers } from './ipc/rss.js'
import { registerAiIpcHandlers } from './ipc/ai.js'
import { registerTtsIpcHandlers } from './ipc/tts.js'
import { registerWindowIpcHandlers } from './ipc/window.js'
import { IPC_CHANNELS } from './ipc/channels.js'
import { registerImageProtocol } from './protocols/imageProtocol.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'rssive-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let mainWindow: BrowserWindow | null = null

const resolveWindowIconPath = () => {
  const iconPath = path.resolve(__dirname, '../../assets/app-icon.png')
  return fs.existsSync(iconPath) ? iconPath : undefined
}

const resolveRendererFilePath = () => {
  const candidates = app.isPackaged
    ? [
        path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'),
        path.join(app.getAppPath(), 'dist', 'index.html'),
        path.join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html'),
        path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
        path.join(process.resourcesPath, 'dist', 'index.html'),
      ]
    : [
        path.resolve(__dirname, '../renderer/index.html'),
        path.resolve(__dirname, '../../../dist/index.html'),
        path.resolve(process.cwd(), '../dist/index.html'),
        path.resolve(process.cwd(), 'dist/index.html'),
      ]

  const existingPath = candidates.find(candidate => fs.existsSync(candidate))
  if (existingPath) return existingPath

  console.warn('[desktop] renderer file not found in candidates', { candidates })
  return candidates[0]
}

const resolveRendererTarget = () => {
  const devUrl = process.env.RSSIVE_DESKTOP_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    return {
      mode: 'url' as const,
      value: devUrl,
    }
  }

  return {
    mode: 'file' as const,
    value: resolveRendererFilePath(),
  }
}

const focusMainWindow = () => {
  const window =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed()) || null

  if (!window) return
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
}

const createMainWindow = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow()
    return mainWindow
  }

  const window = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  const emitWindowState = () => {
    if (window.isDestroyed()) return
    window.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, {
      isMaximized: window.isMaximized(),
    })
  }

  window.on('maximize', emitWindowState)
  window.on('unmaximize', emitWindowState)

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error('[desktop] did-fail-load', { errorCode, errorDescription, validatedUrl })
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[desktop] render-process-gone', details)
  })

  window.webContents.on('did-finish-load', async () => {
    try {
      const hasDesktopApi = await window.webContents.executeJavaScript(
        "Boolean(window.desktopApi && window.desktopApi.rss && window.desktopApi.ai && window.desktopApi.tts)",
      )
      const locationHref = await window.webContents.executeJavaScript('window.location.href')
      console.log('[desktop] did-finish-load', { hasDesktopApi, locationHref })
      emitWindowState()
    } catch (error) {
      console.error('[desktop] did-finish-load-check failed', error)
    }
  })

  const target = resolveRendererTarget()
  try {
    if (target.mode === 'url') {
      await window.loadURL(target.value)
    } else {
      await window.loadFile(target.value)
    }
  } catch (error) {
    console.error('[desktop] renderer load failed', { target, error })
    throw error
  }

  console.log('[desktop] renderer loaded', target)
  return window
}

const registerIpcHandlers = () => {
  registerRssIpcHandlers()
  registerAiIpcHandlers()
  registerTtsIpcHandlers()
  registerWindowIpcHandlers()
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      focusMainWindow()
      return
    }
    if (app.isReady()) {
      createMainWindow().catch(error => {
        console.error('[desktop] second-instance create window failed', error)
      })
    }
  })

  app.whenReady()
    .then(async () => {
      registerImageProtocol()
      registerIpcHandlers()
      await createMainWindow()

      app.on('activate', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          focusMainWindow()
          return
        }
        await createMainWindow()
      })
    })
    .catch(error => {
      console.error('[desktop] app bootstrap failed', error)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
