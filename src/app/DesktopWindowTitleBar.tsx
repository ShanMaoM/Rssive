import type { CSSProperties, MouseEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Minus, X } from 'lucide-react'
import { getDesktopApi } from '../shared/services/desktopApi'

const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

type WindowStateLike = {
  isMaximized?: boolean
}

const stopEventPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation()
}

const MaximizeRectIcon = () => (
  <svg width="13" height="11" viewBox="0 0 13 11" fill="none" aria-hidden="true">
    <rect x="1.25" y="1.25" width="10.5" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const DesktopWindowTitleBar = () => {
  const desktopApi = useMemo(() => getDesktopApi(), [])
  const windowApi = desktopApi?.window
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!windowApi) return

    let disposed = false
    windowApi
      .getState()
      .then((state: WindowStateLike) => {
        if (!disposed) {
          setIsMaximized(Boolean(state?.isMaximized))
        }
      })
      .catch(() => undefined)

    const dispose = windowApi.onStateChange((state: WindowStateLike) => {
      setIsMaximized(Boolean(state?.isMaximized))
    })

    return () => {
      disposed = true
      dispose()
    }
  }, [windowApi])

  if (!windowApi) return null

  const syncState = (state: WindowStateLike) => {
    setIsMaximized(Boolean(state?.isMaximized))
  }

  const runWindowAction = (action: () => Promise<WindowStateLike>) => {
    action().then(syncState).catch(() => undefined)
  }

  const handleToggleMaximize = () => {
    runWindowAction(windowApi.toggleMaximize)
  }

  return (
    <header
      className="desktop-titlebar relative z-[140] flex h-[38px] items-center justify-between border-b border-zinc-300 px-2 dark:border-zinc-700"
      style={DRAG_REGION_STYLE}
      onDoubleClick={handleToggleMaximize}
    >
      <div className="desktop-titlebar-drag-region min-w-0 flex-1" aria-hidden="true" />

      <div className="desktop-titlebar-controls flex items-center" style={NO_DRAG_REGION_STYLE}>
        <button
          type="button"
          className="desktop-titlebar-control"
          onMouseDown={stopEventPropagation}
          onClick={() => runWindowAction(windowApi.minimize)}
          aria-label="Minimize window"
          title="Minimize"
        >
          <Minus size={14} strokeWidth={2.1} />
        </button>

        <button
          type="button"
          className={`desktop-titlebar-control${isMaximized ? ' desktop-titlebar-control--active' : ''}`}
          onMouseDown={stopEventPropagation}
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <MaximizeRectIcon />
        </button>

        <button
          type="button"
          className="desktop-titlebar-control desktop-titlebar-control--close"
          onMouseDown={stopEventPropagation}
          onClick={() => runWindowAction(windowApi.close)}
          aria-label="Close window"
          title="Close"
        >
          <X size={14} strokeWidth={2.1} />
        </button>
      </div>
    </header>
  )
}
