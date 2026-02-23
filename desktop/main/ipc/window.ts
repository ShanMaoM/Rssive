import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from './channels.js'

type WindowStatePayload = {
  isMaximized: boolean
}

const getSenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)

const toWindowState = (window: BrowserWindow | null): WindowStatePayload => ({
  isMaximized: Boolean(window && !window.isDestroyed() && window.isMaximized()),
})

export const registerWindowIpcHandlers = () => {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, event => {
    const window = getSenderWindow(event)
    if (window && !window.isDestroyed()) {
      window.minimize()
    }
    return toWindowState(window)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, event => {
    const window = getSenderWindow(event)
    let nextIsMaximized = false
    if (window && !window.isDestroyed()) {
      const wasMaximized = window.isMaximized()
      if (wasMaximized) {
        window.unmaximize()
        nextIsMaximized = false
      } else {
        window.maximize()
        nextIsMaximized = true
      }
    }
    return {
      isMaximized: nextIsMaximized,
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, event => {
    const window = getSenderWindow(event)
    if (window && !window.isDestroyed()) {
      window.close()
    }
    return toWindowState(window)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, event => {
    const window = getSenderWindow(event)
    return toWindowState(window)
  })
}
