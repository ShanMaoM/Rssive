// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { Loader2, Moon, Sun } from 'lucide-react'
import { Interactive } from '../../modules/reader/components'
import { useI18nRead } from '../../modules/i18n/context'
import {
  applyThemePreference,
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../../shared/state/preferences'

const getActiveTheme = (): ThemePreference => {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }
  return getThemePreference()
}

const persistAndApplyTheme = (theme: ThemePreference) => {
  setThemePreference(theme)
  applyThemePreference(theme)
}

export const OverlayLoadingFallback = () => {
  const { t } = useI18nRead()
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/70 bg-white/90 px-4 py-2 text-xs font-semibold text-stone-700 shadow-lg dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200">
        <Loader2 size={14} className="animate-spin" />
        {t('overlay.loadingPanel')}
      </div>
    </div>
  )
}

export const ThemeToggleButton = React.memo(function ThemeToggleButton() {
  const { t } = useI18nRead()
  const [isDarkMode, setIsDarkMode] = useState(() => getActiveTheme() === 'dark')

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const syncFromClass = () => setIsDarkMode(root.classList.contains('dark'))
    syncFromClass()
    const observer = new MutationObserver(syncFromClass)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const handleToggleTheme = (event: React.MouseEvent<HTMLElement>) => {
    const nextTheme: ThemePreference = getActiveTheme() === 'dark' ? 'light' : 'dark'
    const applyNextTheme = () => persistAndApplyTheme(nextTheme)

    if (!document.startViewTransition) {
      applyNextTheme()
      return
    }

    const x = event.clientX
    const y = event.clientY
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    const transition = document.startViewTransition(applyNextTheme)

    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
          { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => {
        // Ignore transition animation errors and keep the applied theme.
      })
  }

  return (
    <Interactive
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        handleToggleTheme(event)
      }}
      className="text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700"
      aria-label={t('toolbar.toggleTheme')}
      aria-pressed={isDarkMode}
      title={isDarkMode ? t('toolbar.switchToLight') : t('toolbar.switchToDark')}
    >
      {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
    </Interactive>
  )
})

