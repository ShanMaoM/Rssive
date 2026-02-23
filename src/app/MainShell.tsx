// @ts-nocheck
import React, { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BrainCircuit,
  MessageSquare,
  Mic,
} from 'lucide-react'
import {
  CommandPalette,
  Lightbox,
  ToastContainer,
} from '../modules/reader/components'
import { getProxiedImageUrl, rewriteHtmlImageUrls } from '../modules/reader/imageProxy'
import {
  buildSummaryCacheKey,
  buildTranslationCacheKey,
  generateSummaryWithRetry,
  generateTranslationWithRetry,
  isAiTaskError,
  loadCachedSummary,
  loadCachedTranslation,
  type AiTaskLog,
  type AiTaskStatus,
} from '../modules/ai'
import { addFeed, loadFeeds, removeFeed, updateFeed } from '../modules/feeds/storage'
import {
  fetchAutoFeedIcon,
  normalizeFeedIconSource,
  shouldRefreshAutoFeedIcon,
} from '../modules/feeds/icon'
import {
  DEFAULT_FEED_CATEGORY_ID,
  loadFeedCategories,
  type FeedCategoryRecord,
} from '../modules/feeds/categories'
import {
  clearEntries,
  loadEntries,
  removeEntriesByFeedIds,
  toggleEntryRead,
  toggleEntryStar,
  updateEntryState,
  upsertEntries,
} from '../modules/articles/storage'
import { syncFeeds } from '../modules/feeds/rss'
import { checkProxyHealth, fetchHtmlViaProxy } from '../shared/services/rssProxy'
import { extractReadable } from '../shared/services/readability'
import { isDesktopGatewayRuntime } from '../shared/services/runtimeGateway'
import { writeDeveloperLog } from '../shared/services/logger'
import { useArticleViews } from './main-shell/useArticleViews'
import { OverlayLoadingFallback } from './main-shell/common-ui'
import { ArticleListPane, ReaderPane, SidebarPane } from './main-shell/panes'
import {
  buildTtsText,
  createTtsController,
  getTtsProviderLabel,
  isTtsSupported,
  validateCloudTtsConfig,
} from '../modules/tts'
import {
  cacheArticleAssets,
  extractImageUrlsFromHtml,
  getCachedImage,
  getCachedReadable,
  markCacheAccess,
  normalizeImageUrl,
} from '../modules/offline'
import {
  applyArticleFontPreference,
  applyThemeColorPreference,
  applyThemePreference,
  applyUiFontPreference,
  type ArticleFontPreference,
  type ThemeColorPreference,
  type UiFontPreference,
  getArticleFontCustomPreference,
  getArticleFontPreference,
  getAiApiBasePreference,
  getAiApiKeyPreference,
  getAiEnabledPreference,
  getAiModelPreference,
  getSummaryLanguagePreference,
  getAiSummaryPreference,
  getAiTranslationPreference,
  getFontSizePreference,
  getRssRefreshIntervalPreference,
  getThemeColorPreference,
  getTtsAppIdPreference,
  getTtsApiBasePreference,
  getTtsApiKeyPreference,
  getTtsApiSecretPreference,
  getTtsAudioFormatPreference,
  getTtsIncludeAuthorPreference,
  getTtsIncludeSourcePreference,
  getTtsModelPreference,
  getTtsProjectIdPreference,
  getTtsProviderPreference,
  getTtsRegionPreference,
  getTtsVoicePreference,
  getThemePreference,
  getUiFontCustomPreference,
  getUiFontPreference,
  getTranslationOutputPreference,
  getTranslationTargetPreference,
  setArticleFontCustomPreference,
  setArticleFontPreference,
  setAiSummaryPreference,
  setFontSizePreference,
  setRssRefreshIntervalPreference,
  setThemeColorPreference,
  setUiFontCustomPreference,
  setUiFontPreference,
  setTtsIncludeAuthorPreference,
  setTtsIncludeSourcePreference,
  SUMMARY_LANGUAGE_OPTIONS,
  TRANSLATION_OUTPUT_OPTIONS,
  TRANSLATION_TARGET_OPTIONS,
} from '../shared/state/preferences'
import { I18nProvider, useI18nRead } from '../modules/i18n/context'
import { DesktopWindowTitleBar } from './DesktopWindowTitleBar'

const SettingsPageLazy = lazy(() =>
  import('./SettingsPage').then(module => ({ default: module.SettingsPage }))
)
const RssManagerPageLazy = lazy(() =>
  import('./RssManagerPage').then(module => ({ default: module.RssManagerPage }))
)
const READABLE_MEMORY_LIMIT = 30
const OFFLINE_STATUS_MEMORY_LIMIT = 80
const AI_SUMMARY_MEMORY_LIMIT = 80
const AI_TRANSLATION_MEMORY_LIMIT = 80
const AI_ERROR_MEMORY_LIMIT = 120
const AI_STATUS_MEMORY_LIMIT = 160
const AUTO_ICON_ATTEMPT_LIMIT = 400
const OVERLAY_KEEP_ALIVE_MS = 90_000
const EMPTY_COMMAND_ITEMS: any[] = []
const EMPTY_COMMAND_PALETTE_ARTICLES: any[] = []

const trimRecordTail = <T,>(record: Record<string, T>, maxEntries: number): Record<string, T> => {
  if (maxEntries <= 0) return {}
  const keys = Object.keys(record)
  if (keys.length <= maxEntries) return record
  const trimmed: Record<string, T> = {}
  keys.slice(keys.length - maxEntries).forEach(key => {
    trimmed[key] = record[key]
  })
  return trimmed
}

const upsertCappedRecord = <T,>(
  record: Record<string, T>,
  key: string,
  value: T,
  maxEntries: number,
): Record<string, T> => {
  const hasSameValue = Object.prototype.hasOwnProperty.call(record, key) && record[key] === value
  if (hasSameValue) {
    return trimRecordTail(record, maxEntries)
  }
  return trimRecordTail({ ...record, [key]: value }, maxEntries)
}

const retainNumericKeyedRecord = <T,>(
  record: Record<string, T>,
  validIds: Set<string>,
  maxEntries: number,
) => {
  const filtered: Record<string, T> = {}
  Object.entries(record).forEach(([key, value]) => {
    if (validIds.has(key)) {
      filtered[key] = value
    }
  })
  return trimRecordTail(filtered, maxEntries)
}

const areRecordsEqual = <T,>(left: Record<string, T>, right: Record<string, T>) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

const getEntryIdFromAiCacheKey = (cacheKey: string): string | null => {
  if (!cacheKey) return null
  const segments = cacheKey.split(':')
  if (segments.length < 2) return null
  const entryId = segments[1]?.trim()
  return entryId || null
}

const retainAiCacheRecord = <T,>(
  record: Record<string, T>,
  validIds: Set<string>,
  maxEntries: number,
) => {
  const filtered: Record<string, T> = {}
  Object.entries(record).forEach(([cacheKey, value]) => {
    const entryId = getEntryIdFromAiCacheKey(cacheKey)
    if (!entryId || !validIds.has(entryId)) return
    filtered[cacheKey] = value
  })
  return trimRecordTail(filtered, maxEntries)
}

type MainShellOverlaysProps = {
  keepSettingsOverlayMounted: boolean;
  keepRssManagerOverlayMounted: boolean;
  isSettingsOpen: boolean;
  isRssManagerOpen: boolean;
  settingsVisualOpen: boolean;
  rssManagerVisualOpen: boolean;
  closeOverlayRoute: (origin?: 'settings' | 'rss' | null) => void;
  markSettingsSyncPending: () => void;
  markFeedsSyncPending: (options?: { reloadEntries?: boolean }) => void;
};

const MainShellOverlays = React.memo(function MainShellOverlays({
  keepSettingsOverlayMounted,
  keepRssManagerOverlayMounted,
  isSettingsOpen,
  isRssManagerOpen,
  settingsVisualOpen,
  rssManagerVisualOpen,
  closeOverlayRoute,
  markSettingsSyncPending,
  markFeedsSyncPending,
}: MainShellOverlaysProps) {
  if (!(keepSettingsOverlayMounted || keepRssManagerOverlayMounted || isSettingsOpen || isRssManagerOpen)) {
    return null;
  }

  return (
    <Suspense fallback={(isSettingsOpen || isRssManagerOpen) ? <OverlayLoadingFallback /> : null}>
      {(keepSettingsOverlayMounted || isSettingsOpen) && (
        <I18nProvider>
          <SettingsPageLazy
            isOpen={settingsVisualOpen}
            onRequestClose={() => closeOverlayRoute('settings')}
            onPreferencesChange={markSettingsSyncPending}
          />
        </I18nProvider>
      )}
      {(keepRssManagerOverlayMounted || isRssManagerOpen) && (
        <RssManagerPageLazy
          isOpen={rssManagerVisualOpen}
          onRequestClose={() => closeOverlayRoute('rss')}
          onFeedsChange={markFeedsSyncPending}
        />
      )}
    </Suspense>
  );
});

type MainShellOverlayControllerProps = {
  navigateWithDesktopFallback: (path: string, options?: { replace?: boolean }) => void;
  preloadSettingsOverlay: () => void;
  preloadRssManagerOverlay: () => void;
  bindCloseOverlayRoute: (handler: (origin?: 'settings' | 'rss' | null) => void) => void;
  overlayOpenRef: React.MutableRefObject<boolean>;
  onOverlayRouteClosed: () => void;
  markSettingsSyncPending: () => void;
  markFeedsSyncPending: (options?: { reloadEntries?: boolean }) => void;
};

const MainShellOverlayController = React.memo(function MainShellOverlayController({
  navigateWithDesktopFallback,
  preloadSettingsOverlay,
  preloadRssManagerOverlay,
  bindCloseOverlayRoute,
  overlayOpenRef,
  onOverlayRouteClosed,
  markSettingsSyncPending,
  markFeedsSyncPending,
}: MainShellOverlayControllerProps) {
  const location = useLocation();
  const hashPath = typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '') : '';
  const isSettingsOpen = location.pathname.startsWith('/settings') || hashPath.startsWith('/settings');
  const isRssManagerOpen = location.pathname.startsWith('/rss/manage') || hashPath.startsWith('/rss/manage');
  const isRouteOverlayOpen = isSettingsOpen || isRssManagerOpen;
  const [keepSettingsOverlayMounted, setKeepSettingsOverlayMounted] = useState(isSettingsOpen);
  const [keepRssManagerOverlayMounted, setKeepRssManagerOverlayMounted] = useState(isRssManagerOpen);
  const [settingsVisualOpen, setSettingsVisualOpen] = useState(isSettingsOpen);
  const [rssManagerVisualOpen, setRssManagerVisualOpen] = useState(isRssManagerOpen);
  const closeOverlayTimerRef = useRef<number | null>(null);
  const closingOverlayRef = useRef<'settings' | 'rss' | null>(null);
  const settingsResidentTimerRef = useRef<number | null>(null);
  const rssResidentTimerRef = useRef<number | null>(null);
  const wasRouteOverlayOpenRef = useRef(isRouteOverlayOpen);

  const closeOverlayRoute = useCallback((origin: 'settings' | 'rss' | null = null) => {
    if (typeof window === 'undefined') {
      navigateWithDesktopFallback('/', { replace: true });
      return;
    }

    const activeOverlay: 'settings' | 'rss' | null = origin
      ?? (isRssManagerOpen ? 'rss' : isSettingsOpen ? 'settings' : null);
    if (!activeOverlay) {
      navigateWithDesktopFallback('/', { replace: true });
      return;
    }

    const isVisible = activeOverlay === 'settings' ? settingsVisualOpen : rssManagerVisualOpen;
    if (!isVisible) {
      navigateWithDesktopFallback('/', { replace: true });
      return;
    }

    closingOverlayRef.current = activeOverlay;
    if (activeOverlay === 'settings') {
      setSettingsVisualOpen(false);
    } else {
      setRssManagerVisualOpen(false);
    }
    if (closeOverlayTimerRef.current != null) {
      window.clearTimeout(closeOverlayTimerRef.current);
    }
    closeOverlayTimerRef.current = window.setTimeout(() => {
      closeOverlayTimerRef.current = null;
      closingOverlayRef.current = null;
      navigateWithDesktopFallback('/', { replace: true });
    }, 180);
  }, [
    isRssManagerOpen,
    isSettingsOpen,
    navigateWithDesktopFallback,
    rssManagerVisualOpen,
    settingsVisualOpen,
  ]);

  useEffect(() => {
    bindCloseOverlayRoute(closeOverlayRoute);
  }, [bindCloseOverlayRoute, closeOverlayRoute]);

  useEffect(() => {
    overlayOpenRef.current = isRouteOverlayOpen || settingsVisualOpen || rssManagerVisualOpen;
  }, [isRouteOverlayOpen, overlayOpenRef, rssManagerVisualOpen, settingsVisualOpen]);

  useEffect(() => {
    if (wasRouteOverlayOpenRef.current && !isRouteOverlayOpen) {
      onOverlayRouteClosed();
    }
    wasRouteOverlayOpenRef.current = isRouteOverlayOpen;
  }, [isRouteOverlayOpen, onOverlayRouteClosed]);

  useEffect(() => {
    if (isSettingsOpen) {
      if (settingsResidentTimerRef.current != null && typeof window !== 'undefined') {
        window.clearTimeout(settingsResidentTimerRef.current);
        settingsResidentTimerRef.current = null;
      }
      setKeepSettingsOverlayMounted(true);
      setSettingsVisualOpen(true);
      if (closingOverlayRef.current === 'settings') {
        closingOverlayRef.current = null;
      }
      return;
    }
    if (closingOverlayRef.current !== 'settings') {
      setSettingsVisualOpen(false);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isRssManagerOpen) {
      if (rssResidentTimerRef.current != null && typeof window !== 'undefined') {
        window.clearTimeout(rssResidentTimerRef.current);
        rssResidentTimerRef.current = null;
      }
      setKeepRssManagerOverlayMounted(true);
      setRssManagerVisualOpen(true);
      if (closingOverlayRef.current === 'rss') {
        closingOverlayRef.current = null;
      }
      return;
    }
    if (closingOverlayRef.current !== 'rss') {
      setRssManagerVisualOpen(false);
    }
  }, [isRssManagerOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSettingsOpen || settingsVisualOpen || !keepSettingsOverlayMounted) return;
    if (settingsResidentTimerRef.current != null) {
      window.clearTimeout(settingsResidentTimerRef.current);
    }
    settingsResidentTimerRef.current = window.setTimeout(() => {
      setKeepSettingsOverlayMounted(false);
      settingsResidentTimerRef.current = null;
    }, OVERLAY_KEEP_ALIVE_MS);
  }, [isSettingsOpen, keepSettingsOverlayMounted, settingsVisualOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isRssManagerOpen || rssManagerVisualOpen || !keepRssManagerOverlayMounted) return;
    if (rssResidentTimerRef.current != null) {
      window.clearTimeout(rssResidentTimerRef.current);
    }
    rssResidentTimerRef.current = window.setTimeout(() => {
      setKeepRssManagerOverlayMounted(false);
      rssResidentTimerRef.current = null;
    }, OVERLAY_KEEP_ALIVE_MS);
  }, [isRssManagerOpen, keepRssManagerOverlayMounted, rssManagerVisualOpen]);

  useEffect(() => {
    return () => {
      if (closeOverlayTimerRef.current != null && typeof window !== 'undefined') {
        window.clearTimeout(closeOverlayTimerRef.current);
      }
      if (settingsResidentTimerRef.current != null && typeof window !== 'undefined') {
        window.clearTimeout(settingsResidentTimerRef.current);
      }
      if (rssResidentTimerRef.current != null && typeof window !== 'undefined') {
        window.clearTimeout(rssResidentTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timerId: number | null = null;
    let idleId: number | null = null;
    const preloadOverlays = () => {
      preloadSettingsOverlay();
      preloadRssManagerOverlay();
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(preloadOverlays, { timeout: 1500 });
    } else {
      timerId = window.setTimeout(preloadOverlays, 350);
    }

    return () => {
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [preloadRssManagerOverlay, preloadSettingsOverlay]);

  return (
    <MainShellOverlays
      keepSettingsOverlayMounted={keepSettingsOverlayMounted}
      keepRssManagerOverlayMounted={keepRssManagerOverlayMounted}
      isSettingsOpen={isSettingsOpen}
      isRssManagerOpen={isRssManagerOpen}
      settingsVisualOpen={settingsVisualOpen}
      rssManagerVisualOpen={rssManagerVisualOpen}
      closeOverlayRoute={closeOverlayRoute}
      markSettingsSyncPending={markSettingsSyncPending}
      markFeedsSyncPending={markFeedsSyncPending}
    />
  );
});

type MainShellChromeProps = {
  isDesktopShell: boolean;
  lightboxSrc: string | null;
  setLightboxSrc: (value: string | null) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  commandPaletteMode: string;
  commandPaletteArticles: any[];
  setSelectedArticleId: (articleId: number | null) => void;
  commandItems: any[];
  registerAddToast: (handler: ((message: string, type?: string) => void) | null) => void;
  handleDeepDive: () => void;
  handleTranslate: () => void;
  setTtsIncludeAuthor: React.Dispatch<React.SetStateAction<boolean>>;
  setTtsIncludeSource: React.Dispatch<React.SetStateAction<boolean>>;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  feedContextMenu: { open: boolean; x: number; y: number; feedId: number | null };
  contextMenuFeed: any;
  closeFeedContextMenu: () => void;
  handleManualRefreshFeed: (feedId: number) => Promise<void>;
  openRssManagerRoute: () => void;
  isMobile: boolean;
  isFocusMode: boolean;
  showSidebar: boolean;
  showList: boolean;
  closeMobilePanels: () => void;
};

const MainShellChrome = React.memo(function MainShellChrome({
  isDesktopShell,
  lightboxSrc,
  setLightboxSrc,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  commandPaletteMode,
  commandPaletteArticles,
  setSelectedArticleId,
  commandItems,
  registerAddToast,
  handleDeepDive,
  handleTranslate,
  setTtsIncludeAuthor,
  setTtsIncludeSource,
  t,
  feedContextMenu,
  contextMenuFeed,
  closeFeedContextMenu,
  handleManualRefreshFeed,
  openRssManagerRoute,
  isMobile,
  isFocusMode,
  showSidebar,
  showList,
  closeMobilePanels,
}: MainShellChromeProps) {
  const [toasts, setToasts] = useState<any[]>([]);
  const toastIdRef = useRef(0);
  const toastVisibleTimerRef = useRef<number | null>(null);
  const toastExitTimerRef = useRef<number | null>(null);
  const clearToastTimers = useCallback(() => {
    if (toastVisibleTimerRef.current !== null) {
      window.clearTimeout(toastVisibleTimerRef.current);
      toastVisibleTimerRef.current = null;
    }
    if (toastExitTimerRef.current !== null) {
      window.clearTimeout(toastExitTimerRef.current);
      toastExitTimerRef.current = null;
    }
  }, []);
  const startToastExit = useCallback((id: number) => {
    setToasts(current => {
      const active = current[0];
      if (!active || active.id !== id) return current;
      return [{ ...active, leaving: true }];
    });
    toastExitTimerRef.current = window.setTimeout(() => {
      setToasts(current => (current[0]?.id === id ? [] : current));
      toastExitTimerRef.current = null;
    }, 220);
  }, []);
  const addToast = useCallback((message: string, type = 'success') => {
    const id = Date.now() + toastIdRef.current++;
    clearToastTimers();
    // Keep only the latest toast to avoid stacking.
    setToasts([{ id, message, type, leaving: false }]);
    toastVisibleTimerRef.current = window.setTimeout(() => {
      startToastExit(id);
      toastVisibleTimerRef.current = null;
    }, 3200);
  }, [clearToastTimers, startToastExit]);

  useEffect(() => {
    registerAddToast(addToast);
    return () => {
      registerAddToast(null);
      clearToastTimers();
    };
  }, [addToast, clearToastTimers, registerAddToast]);

  return (
    <>
      <ToastContainer toasts={toasts} isDesktopShell={isDesktopShell} />
      <Lightbox src={lightboxSrc} alt="Expanded view" onClose={() => setLightboxSrc(null)} />

      {isCommandPaletteOpen && (
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          mode={commandPaletteMode}
          articles={commandPaletteArticles}
          onSelect={setSelectedArticleId}
          commands={commandItems}
          onCommand={(commandId) => {
            if (commandId === 'ai.summary') {
              handleDeepDive();
              return;
            }
            if (commandId === 'ai.translate') {
              handleTranslate();
              return;
            }
            if (commandId === 'tts.toggleAuthor') {
              setTtsIncludeAuthor(prev => {
                const next = !prev;
                setTtsIncludeAuthorPreference(next);
                addToast(next ? t('main.ttsAuthorEnabled') : t('main.ttsAuthorDisabled'), 'info');
                return next;
              });
              return;
            }
            if (commandId === 'tts.toggleSource') {
              setTtsIncludeSource(prev => {
                const next = !prev;
                setTtsIncludeSourcePreference(next);
                addToast(next ? t('main.ttsSourceEnabled') : t('main.ttsSourceDisabled'), 'info');
                return next;
              });
            }
          }}
        />
      )}

      {feedContextMenu.open && (
        <div
          className="fixed z-[120] min-w-[180px] rounded-lg border border-stone-200 bg-white/95 p-1.5 shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95"
          style={{ top: feedContextMenu.y, left: feedContextMenu.x }}
          role="menu"
          aria-label={t('nav.subscriptions')}
        >
          {contextMenuFeed && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeFeedContextMenu();
                void handleManualRefreshFeed(contextMenuFeed.id);
              }}
              className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {t('list.refreshFeed', { feed: contextMenuFeed.title })}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeFeedContextMenu();
              openRssManagerRoute();
            }}
            className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {t('nav.manageRssFeeds')}
          </button>
        </div>
      )}

      {isMobile && !isFocusMode && (showSidebar || showList) && (
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={closeMobilePanels}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-20 md:hidden"
        />
      )}
    </>
  );
});

const MainShellCore = React.memo(function MainShellCore() {
  const { t, language } = useI18nRead();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const isDesktopShell = typeof window !== 'undefined'
    && (window.location.protocol === 'file:' || isDesktopGatewayRuntime());

  const runInIdle = useCallback((job: () => void, timeout = 450) => {
    if (typeof window === 'undefined') {
      job();
      return;
    }
    const runtime = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof runtime.requestIdleCallback === 'function') {
      runtime.requestIdleCallback(job, { timeout });
      return;
    }
    window.setTimeout(job, 0);
  }, []);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const navigateWithDesktopFallback = useCallback((path: string, options: { replace?: boolean } = {}) => {
    navigateRef.current(path, options);
    if (!isDesktopShell) return;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const nextHash = `#${normalized}`;
    window.setTimeout(() => {
      if (window.location.hash === nextHash) return;
      if (options.replace) {
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
        return;
      }
      window.location.hash = nextHash;
    }, 0);
  }, [isDesktopShell]);

  const preloadSettingsOverlay = useCallback(() => {
    void import('./SettingsPage');
  }, []);

  const preloadRssManagerOverlay = useCallback(() => {
    void import('./RssManagerPage');
  }, []);

  const openSettingsRoute = useCallback(() => {
    preloadSettingsOverlay();
    navigateWithDesktopFallback('/settings');
  }, [navigateWithDesktopFallback, preloadSettingsOverlay]);

  const openRssManagerRoute = useCallback(() => {
    preloadRssManagerOverlay();
    navigateWithDesktopFallback('/rss/manage');
  }, [navigateWithDesktopFallback, preloadRssManagerOverlay]);
  // --- Global State & Persistence ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try { return localStorage.getItem('rss-sidebar') !== 'closed'; } catch { return true; }
  });
  const [isListOpen, setIsListOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1024px)').matches;
  });

  const [isFocusMode, setIsFocusMode] = useState(false);

  const [themeColor, setThemeColor] = useState<ThemeColorPreference>(() => getThemeColorPreference());
  const [uiFontFamily, setUiFontFamily] = useState<UiFontPreference>(() => getUiFontPreference());
  const [uiCustomFontStack, setUiCustomFontStack] = useState(() => getUiFontCustomPreference());
  const [articleFontFamily, setArticleFontFamily] = useState<ArticleFontPreference>(() => getArticleFontPreference());
  const [articleCustomFontStack, setArticleCustomFontStack] = useState(() => getArticleFontCustomPreference());
  const [fontSize, setFontSize] = useState(() => getFontSizePreference());
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(() => getRssRefreshIntervalPreference());

  const [aiEnabled, setAiEnabled] = useState(() => getAiEnabledPreference());
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(() => getAiSummaryPreference());
  const [aiTranslationEnabled, setAiTranslationEnabled] = useState(() => getAiTranslationPreference());
  const [aiApiBase, setAiApiBase] = useState(() => getAiApiBasePreference());
  const [aiApiKey, setAiApiKey] = useState(() => getAiApiKeyPreference());
  const [aiModel, setAiModel] = useState(() => getAiModelPreference());
  const [summaryLanguage, setSummaryLanguage] = useState(() => getSummaryLanguagePreference());
  const [translationTarget, setTranslationTarget] = useState(() => getTranslationTargetPreference());
  const [translationOutput, setTranslationOutput] = useState(() => getTranslationOutputPreference());

  const [, startSearchTransition] = useTransition();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] = useState('palette');

  // --- Content State ---
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [feedCategories, setFeedCategories] = useState<FeedCategoryRecord[]>(() => loadFeedCategories());
  const [articles, setArticles] = useState(() => loadEntries());
  const [isSyncingFeeds, setIsSyncingFeeds] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedCategory, setNewFeedCategory] = useState(DEFAULT_FEED_CATEGORY_ID);
  const [feedContextMenu, setFeedContextMenu] = useState({ open: false, x: 0, y: 0, feedId: null });
  const [readableById, setReadableById] = useState({});
  const [renderedContent, setRenderedContent] = useState('');
  const [offlineStatusById, setOfflineStatusById] = useState({});
  const [coverImageOverride, setCoverImageOverride] = useState(null);
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  // Effects for Persistence
  useEffect(() => {
    applyThemePreference(getThemePreference());
    applyThemeColorPreference(getThemeColorPreference());
    applyUiFontPreference(getUiFontPreference(), getUiFontCustomPreference());
    applyArticleFontPreference(getArticleFontPreference(), getArticleFontCustomPreference());
  }, []);

  useEffect(() => { try { localStorage.setItem('rss-sidebar', isSidebarOpen ? 'open' : 'closed'); } catch {} }, [isSidebarOpen]);
  useEffect(() => { setThemeColorPreference(themeColor); applyThemeColorPreference(themeColor); }, [themeColor]);
  useEffect(() => { setUiFontPreference(uiFontFamily); applyUiFontPreference(uiFontFamily, uiCustomFontStack); }, [uiFontFamily, uiCustomFontStack]);
  useEffect(() => { setArticleFontPreference(articleFontFamily); applyArticleFontPreference(articleFontFamily, articleCustomFontStack); }, [articleFontFamily, articleCustomFontStack]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1024px)');
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  useEffect(() => {
    if (!isMobile) return;
    if (selectedArticleId == null) {
      setIsListOpen(true);
    }
  }, [isMobile, selectedArticleId]);

  useEffect(() => {
    if (isMobile) return;
    setIsSidebarOpen(true);
    setIsListOpen(true);
  }, [isMobile]);

  // --- Typography UI State ---
  // --- AI & Audio State ---
  const [aiSummariesByKey, setAiSummariesByKey] = useState({});
  const [aiErrorByKey, setAiErrorByKey] = useState({});
  const [summaryTaskStatusByKey, setSummaryTaskStatusByKey] = useState<Record<string, AiTaskStatus>>({});
  const [translationTaskStatusByKey, setTranslationTaskStatusByKey] = useState<Record<string, AiTaskStatus>>({});
  const [aiTaskLogs, setAiTaskLogs] = useState<AiTaskLog[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [translationsByKey, setTranslationsByKey] = useState({});
  const [translationErrorByKey, setTranslationErrorByKey] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPausedAudio, setIsPausedAudio] = useState(false);
  const [ttsIncludeAuthor, setTtsIncludeAuthor] = useState(() => getTtsIncludeAuthorPreference());
  const [ttsIncludeSource, setTtsIncludeSource] = useState(() => getTtsIncludeSourcePreference());
  const [ttsProvider, setTtsProvider] = useState(() => getTtsProviderPreference());
  const [ttsApiBase, setTtsApiBase] = useState(() => getTtsApiBasePreference());
  const [ttsApiKey, setTtsApiKey] = useState(() => getTtsApiKeyPreference());
  const [ttsApiSecret, setTtsApiSecret] = useState(() => getTtsApiSecretPreference());
  const [ttsRegion, setTtsRegion] = useState(() => getTtsRegionPreference());
  const [ttsProjectId, setTtsProjectId] = useState(() => getTtsProjectIdPreference());
  const [ttsAppId, setTtsAppId] = useState(() => getTtsAppIdPreference());
  const [ttsModel, setTtsModel] = useState(() => getTtsModelPreference());
  const [ttsVoice, setTtsVoice] = useState(() => getTtsVoicePreference());
  const [ttsAudioFormat, setTtsAudioFormat] = useState(() => getTtsAudioFormatPreference());

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const ttsControllerRef = useRef(null);
  const imageObjectUrlsRef = useRef<string[]>([]);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const translationAbortRef = useRef<AbortController | null>(null);
  const summaryTaskKeyRef = useRef<string | null>(null);
  const translationTaskKeyRef = useRef<string | null>(null);
  const autoIconAttemptRef = useRef<Set<string>>(new Set());
  const syncInFlightRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const closeOverlayRouteRef = useRef<(origin?: 'settings' | 'rss' | null) => void>(() => {});
  const settingsSyncPendingRef = useRef(false);
  const feedsSyncPendingRef = useRef<{ pending: boolean; reloadEntries: boolean }>({
    pending: false,
    reloadEntries: false,
  });

  useEffect(() => {
    syncInFlightRef.current = isSyncingFeeds;
  }, [isSyncingFeeds]);

  const activeArticle = useMemo(
    () => articles.find(article => article.id === selectedArticleId) || null,
    [articles, selectedArticleId]
  );

  useEffect(() => {
    const hasAnyEphemeralState = Boolean(
      Object.keys(readableById).length
      || Object.keys(offlineStatusById).length
      || Object.keys(aiSummariesByKey).length
      || Object.keys(translationsByKey).length
      || Object.keys(aiErrorByKey).length
      || Object.keys(translationErrorByKey).length
      || Object.keys(summaryTaskStatusByKey).length
      || Object.keys(translationTaskStatusByKey).length,
    )
    if (!hasAnyEphemeralState) return

    const validArticleIds = new Set(articles.map(article => String(article.id)))

    setReadableById(prev => {
      const next = retainNumericKeyedRecord(prev, validArticleIds, READABLE_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setOfflineStatusById(prev => {
      const next = retainNumericKeyedRecord(prev, validArticleIds, OFFLINE_STATUS_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setAiSummariesByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_SUMMARY_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setTranslationsByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_TRANSLATION_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setAiErrorByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_ERROR_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setTranslationErrorByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_ERROR_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setSummaryTaskStatusByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_STATUS_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
    setTranslationTaskStatusByKey(prev => {
      const next = retainAiCacheRecord(prev, validArticleIds, AI_STATUS_MEMORY_LIMIT)
      return areRecordsEqual(prev, next) ? prev : next
    })
  }, [articles])

  const activeReadable = activeArticle ? readableById[activeArticle.id] : null;
  const activeReadableContent = activeReadable?.content || '';
  const coverProxyUrl = activeArticle?.image
    ? getProxiedImageUrl(activeArticle.image, activeArticle.link)
    : '';
  const normalizedAiModel = (aiModel || '').trim();
  const summaryCacheKey = activeArticle
    ? buildSummaryCacheKey({
      entryId: activeArticle.id,
      model: normalizedAiModel,
      targetLanguage: summaryLanguage,
    })
    : null;
  const activeAiSummary = summaryCacheKey ? aiSummariesByKey[summaryCacheKey] : null;
  const activeAiError = summaryCacheKey ? aiErrorByKey[summaryCacheKey] : null;
  const translationCacheKey = activeArticle
    ? buildTranslationCacheKey({
      entryId: activeArticle.id,
      targetLanguage: translationTarget,
      outputStyle: translationOutput,
      model: normalizedAiModel,
    })
    : null;
  const activeTranslation = translationCacheKey ? translationsByKey[translationCacheKey] : null;
  const activeTranslationError = translationCacheKey ? translationErrorByKey[translationCacheKey] : null;
  const translatedContentHtml = useMemo(
    () => (activeTranslation?.html || '').trim(),
    [activeTranslation?.html],
  );
  const readerContentHtml = translatedContentHtml || renderedContent;
  const showSidebar = isSidebarOpen && !isFocusMode;
  const showList = !isFocusMode && isListOpen;
  const {
    filteredFeeds,
    sidebarCategories,
    formatArticleDate,
    syncStatusPrimary,
    syncStatusSecondary,
    contextMenuFeed,
    navigableArticles,
    filteredArticles,
  } = useArticleViews({
    articles,
    feeds,
    feedCategories,
    selectedCategory,
    selectedFeedId,
    searchQuery,
    isSyncingFeeds,
    contextMenuFeedId: feedContextMenu.feedId,
    language,
    t,
  });

  useEffect(() => {
    if (selectedFeedId == null) return;
    if (feeds.some(feed => feed.id === selectedFeedId)) return;
    setSelectedFeedId(null);
  }, [feeds, selectedFeedId]);
  useEffect(() => {
    if (selectedCategory === 'all') return;
    if (feedCategories.some(category => category.id === selectedCategory)) return;
    setSelectedCategory('all');
  }, [feedCategories, selectedCategory]);
  useEffect(() => {
    if (feedCategories.some(category => category.id === newFeedCategory)) return;
    setNewFeedCategory(feedCategories[0]?.id || DEFAULT_FEED_CATEGORY_ID);
  }, [feedCategories, newFeedCategory]);
  const translationTargetLabel = useMemo(() => {
    const keyByValue: Record<string, string> = {
      en: 'language.english',
      zh: 'language.chineseSimplified',
      ja: 'language.japanese',
      ko: 'language.korean',
      fr: 'language.french',
      de: 'language.german',
      es: 'language.spanish',
    };
    const key = keyByValue[translationTarget];
    if (key) return t(key);
    return TRANSLATION_TARGET_OPTIONS.find(option => option.value === translationTarget)?.label
      || translationTarget.toUpperCase();
  }, [translationTarget, t]);
  const translationOutputLabel = useMemo(() => {
    if (translationOutput === 'full') return t('translation.output.full');
    if (translationOutput === 'brief') return t('translation.output.brief');
    if (translationOutput === 'bullet') return t('translation.output.bullet');
    return TRANSLATION_OUTPUT_OPTIONS.find(option => option.value === translationOutput)?.label
      || translationOutput;
  }, [translationOutput, t]);
  const summaryLanguageLabel = useMemo(() => {
    const keyByValue: Record<string, string> = {
      en: 'language.english',
      zh: 'language.chineseSimplified',
      ja: 'language.japanese',
      ko: 'language.korean',
      fr: 'language.french',
      de: 'language.german',
      es: 'language.spanish',
    };
    const key = keyByValue[summaryLanguage];
    if (key) return t(key);
    return SUMMARY_LANGUAGE_OPTIONS.find(option => option.value === summaryLanguage)?.label
      || summaryLanguage.toUpperCase();
  }, [summaryLanguage, t]);
  const aiConfigIssue = useMemo(() => {
    if (!normalizedAiModel) return t('main.ai.modelMissing');
    if (!(aiApiKey || '').trim()) return t('main.ai.apiKeyMissing');
    return null;
  }, [normalizedAiModel, aiApiKey, t]);
  const aiRequestConfig = useMemo(() => ({
    apiBase: aiApiBase,
    apiKey: aiApiKey,
    model: normalizedAiModel,
    timeoutMs: 20_000,
  }), [aiApiBase, aiApiKey, normalizedAiModel]);

  const getSummaryDisabledReason = useCallback((options?: { includeBusy?: boolean }) => {
    const includeBusy = options?.includeBusy ?? true;
    if (!activeArticle) return t('main.ai.selectArticleFirst');
    if (!aiEnabled) return t('main.ai.disabled');
    if (!aiSummaryEnabled) return t('main.ai.summaryDisabled');
    if (aiConfigIssue) return aiConfigIssue;
    if (includeBusy && isGeneratingSummary) return t('main.ai.summaryInProgress');
    return null;
  }, [activeArticle, aiEnabled, aiSummaryEnabled, aiConfigIssue, isGeneratingSummary, t]);

  const getTranslationDisabledReason = useCallback((options?: { includeBusy?: boolean }) => {
    const includeBusy = options?.includeBusy ?? true;
    if (!activeArticle) return t('main.ai.selectArticleFirst');
    if (!aiEnabled) return t('main.ai.disabled');
    if (!aiTranslationEnabled) return t('main.ai.translationDisabled');
    if (aiConfigIssue) return aiConfigIssue;
    if (includeBusy && isTranslating) return t('main.ai.translationInProgress');
    return null;
  }, [activeArticle, aiEnabled, aiTranslationEnabled, aiConfigIssue, isTranslating, t]);

  const ttsProviderLabel = useMemo(() => getTtsProviderLabel(ttsProvider), [ttsProvider]);

  // --- Helpers ---
  const addToastHandlerRef = useRef<((message: string, type?: string) => void) | null>(null);
  const pendingToastsRef = useRef<Array<{ message: string; type: string }>>([]);
  const registerAddToast = useCallback((handler: ((message: string, type?: string) => void) | null) => {
    addToastHandlerRef.current = handler;
    if (!handler || pendingToastsRef.current.length === 0) {
      return;
    }
    const queued = [...pendingToastsRef.current];
    pendingToastsRef.current = [];
    queued.forEach(toast => handler(toast.message, toast.type));
  }, []);
  const addToast = useCallback((message, type = 'success') => {
    const handler = addToastHandlerRef.current;
    if (handler) {
      handler(message, type);
      return;
    }
    pendingToastsRef.current.push({ message, type });
    if (pendingToastsRef.current.length > 4) {
      pendingToastsRef.current.shift();
    }
  }, []);
  const appendAiTaskLog = useCallback((log: AiTaskLog) => {
    setAiTaskLogs(prev => [log, ...prev].slice(0, 120));
  }, []);
  const handleAiTaskLog = useCallback((log: AiTaskLog) => {
    appendAiTaskLog(log);
    writeDeveloperLog({
      level: log.status === 'failure'
        ? 'error'
        : log.status === 'retrying'
          ? 'warn'
          : 'info',
      module: 'ai',
      action: `${log.task}.${log.status}`,
      result: log.status === 'success'
        ? 'success'
        : log.status === 'failure'
          ? 'failure'
          : 'info',
      errorCode: log.code,
      context: {
        attempt: log.attempt,
        entryId: log.entryId,
        cacheKey: log.cacheKey,
        httpStatus: log.httpStatus,
        retryInMs: log.retryInMs,
        message: log.message,
        timestamp: log.timestamp,
      },
    });
    if (!log.cacheKey) return;
    if (log.task === 'summary') {
      setSummaryTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        log.cacheKey!,
        log.status,
        AI_STATUS_MEMORY_LIMIT,
      ));
      return;
    }
    if (log.task === 'translation') {
      setTranslationTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        log.cacheKey!,
        log.status,
        AI_STATUS_MEMORY_LIMIT,
      ));
    }
  }, [appendAiTaskLog]);
  const formatAiErrorMessage = useCallback((error: unknown) => {
    if (!isAiTaskError(error)) return t('main.ai.requestFailed');
    if (error.code === 'auth') {
      return t('main.ai.authFailed');
    }
    if (error.code === 'rate_limit') {
      return t('main.ai.rateLimit');
    }
    if (error.code === 'timeout') {
      return t('main.ai.timeout');
    }
    if (error.code === 'empty_result') {
      return t('main.ai.emptyResult');
    }
    if (error.code === 'invalid_config') {
      return error.message || t('main.ai.invalidConfig');
    }
    if (error.code === 'cancelled') {
      return t('main.ai.cancelled');
    }
    if (error.code === 'network') {
      return t('main.ai.network');
    }
    if (error.status) {
      return t('main.ai.httpError', { status: error.status });
    }
    return error.message || t('main.ai.requestFailed');
  }, [t]);
  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
    if (isMobile) setIsListOpen(false);
  }, [isMobile]);
  const toggleListPanel = useCallback(() => {
    setIsListOpen(prev => {
      const next = !prev;
      if (next && isMobile) {
        setIsSidebarOpen(false);
      }
      return next;
    });
  }, [isMobile]);
  const closeMobilePanels = useCallback(() => {
    if (!isMobile) return;
    setIsSidebarOpen(false);
    setIsListOpen(false);
  }, [isMobile]);
  const openFeedContextMenu = useCallback((event, feedId: number | null = null) => {
    event.preventDefault();
    setFeedContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      feedId,
    });
  }, []);
  const closeFeedContextMenu = useCallback(() => {
    setFeedContextMenu(prev => (
      prev.open
        ? { open: false, x: 0, y: 0, feedId: null }
        : prev
    ));
  }, []);

  useEffect(() => {
    if (!feedContextMenu.open) return;
    const dismiss = () => closeFeedContextMenu();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeFeedContextMenu();
      }
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('contextmenu', dismiss);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('contextmenu', dismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [feedContextMenu.open, closeFeedContextMenu]);

  const syncPreferencesFromStorage = useCallback(() => {
    const nextThemeColor = getThemeColorPreference();
    const nextUiFontFamily = getUiFontPreference();
    const nextUiCustomFontStack = getUiFontCustomPreference();
    const nextArticleFontFamily = getArticleFontPreference();
    const nextArticleCustomFontStack = getArticleFontCustomPreference();
    const nextFontSize = getFontSizePreference();
    const nextRefreshIntervalMinutes = getRssRefreshIntervalPreference();
    const nextAiEnabled = getAiEnabledPreference();
    const nextAiSummaryEnabled = getAiSummaryPreference();
    const nextAiTranslationEnabled = getAiTranslationPreference();
    const nextAiApiBase = getAiApiBasePreference();
    const nextAiApiKey = getAiApiKeyPreference();
    const nextAiModel = getAiModelPreference();
    const nextSummaryLanguage = getSummaryLanguagePreference();
    const nextTranslationTarget = getTranslationTargetPreference();
    const nextTranslationOutput = getTranslationOutputPreference();
    const nextTtsIncludeAuthor = getTtsIncludeAuthorPreference();
    const nextTtsIncludeSource = getTtsIncludeSourcePreference();
    const nextTtsProvider = getTtsProviderPreference();
    const nextTtsApiBase = getTtsApiBasePreference();
    const nextTtsApiKey = getTtsApiKeyPreference();
    const nextTtsApiSecret = getTtsApiSecretPreference();
    const nextTtsRegion = getTtsRegionPreference();
    const nextTtsProjectId = getTtsProjectIdPreference();
    const nextTtsAppId = getTtsAppIdPreference();
    const nextTtsModel = getTtsModelPreference();
    const nextTtsVoice = getTtsVoicePreference();
    const nextTtsAudioFormat = getTtsAudioFormatPreference();

    startTransition(() => {
      setThemeColor(prev => (prev === nextThemeColor ? prev : nextThemeColor));
      setUiFontFamily(prev => (prev === nextUiFontFamily ? prev : nextUiFontFamily));
      setUiCustomFontStack(prev => (prev === nextUiCustomFontStack ? prev : nextUiCustomFontStack));
      setArticleFontFamily(prev => (prev === nextArticleFontFamily ? prev : nextArticleFontFamily));
      setArticleCustomFontStack(prev => (prev === nextArticleCustomFontStack ? prev : nextArticleCustomFontStack));
      setFontSize(prev => (prev === nextFontSize ? prev : nextFontSize));
      setRefreshIntervalMinutes(prev => (prev === nextRefreshIntervalMinutes ? prev : nextRefreshIntervalMinutes));
      setAiEnabled(prev => (prev === nextAiEnabled ? prev : nextAiEnabled));
      setAiSummaryEnabled(prev => (prev === nextAiSummaryEnabled ? prev : nextAiSummaryEnabled));
      setAiTranslationEnabled(prev => (prev === nextAiTranslationEnabled ? prev : nextAiTranslationEnabled));
      setAiApiBase(prev => (prev === nextAiApiBase ? prev : nextAiApiBase));
      setAiApiKey(prev => (prev === nextAiApiKey ? prev : nextAiApiKey));
      setAiModel(prev => (prev === nextAiModel ? prev : nextAiModel));
      setSummaryLanguage(prev => (prev === nextSummaryLanguage ? prev : nextSummaryLanguage));
      setTranslationTarget(prev => (prev === nextTranslationTarget ? prev : nextTranslationTarget));
      setTranslationOutput(prev => (prev === nextTranslationOutput ? prev : nextTranslationOutput));
      setTtsIncludeAuthor(prev => (prev === nextTtsIncludeAuthor ? prev : nextTtsIncludeAuthor));
      setTtsIncludeSource(prev => (prev === nextTtsIncludeSource ? prev : nextTtsIncludeSource));
      setTtsProvider(prev => (prev === nextTtsProvider ? prev : nextTtsProvider));
      setTtsApiBase(prev => (prev === nextTtsApiBase ? prev : nextTtsApiBase));
      setTtsApiKey(prev => (prev === nextTtsApiKey ? prev : nextTtsApiKey));
      setTtsApiSecret(prev => (prev === nextTtsApiSecret ? prev : nextTtsApiSecret));
      setTtsRegion(prev => (prev === nextTtsRegion ? prev : nextTtsRegion));
      setTtsProjectId(prev => (prev === nextTtsProjectId ? prev : nextTtsProjectId));
      setTtsAppId(prev => (prev === nextTtsAppId ? prev : nextTtsAppId));
      setTtsModel(prev => (prev === nextTtsModel ? prev : nextTtsModel));
      setTtsVoice(prev => (prev === nextTtsVoice ? prev : nextTtsVoice));
      setTtsAudioFormat(prev => (prev === nextTtsAudioFormat ? prev : nextTtsAudioFormat));
    });
  }, []);

  const syncFeedStateFromStorage = useCallback((options: { reloadEntries?: boolean } = {}) => {
    const { reloadEntries = true } = options;
    const storedFeeds = loadFeeds();
    const storedEntries = reloadEntries
      ? (storedFeeds.length ? loadEntries() : clearEntries())
      : null;

    startTransition(() => {
      setFeedCategories(loadFeedCategories());
      setFeeds(storedFeeds);
      if (!reloadEntries) return;
      if (!storedFeeds.length) {
        setArticles(storedEntries ?? []);
        setSelectedArticleId(null);
        return;
      }
      const nextEntries = storedEntries ?? [];
      setArticles(nextEntries);
      if (!nextEntries.length) {
        setSelectedArticleId(null);
        return;
      }
      setSelectedArticleId(prev => (
        prev != null && nextEntries.some(entry => entry.id === prev)
          ? prev
          : nextEntries[0].id
      ));
    });
  }, []);

  const markSettingsSyncPending = useCallback(() => {
    settingsSyncPendingRef.current = true;
  }, []);

  const markFeedsSyncPending = useCallback((options: { reloadEntries?: boolean } = {}) => {
    feedsSyncPendingRef.current = {
      pending: true,
      reloadEntries: feedsSyncPendingRef.current.reloadEntries || Boolean(options.reloadEntries),
    };
  }, []);

  const bindCloseOverlayRoute = useCallback((handler: (origin?: 'settings' | 'rss' | null) => void) => {
    closeOverlayRouteRef.current = handler;
  }, []);

  const handleOverlayRouteClosed = useCallback(() => {
    if (settingsSyncPendingRef.current) {
      settingsSyncPendingRef.current = false;
      runInIdle(syncPreferencesFromStorage, 1500);
    }
    if (feedsSyncPendingRef.current.pending) {
      const { reloadEntries } = feedsSyncPendingRef.current;
      feedsSyncPendingRef.current = { pending: false, reloadEntries: false };
      runInIdle(() => syncFeedStateFromStorage({ reloadEntries }), 1500);
    }
  }, [runInIdle, syncFeedStateFromStorage, syncPreferencesFromStorage]);

  const notifySyncFailure = useCallback(async () => {
    try {
      const health = await checkProxyHealth();
      if (!health.ok) {
        addToast(t('main.proxyUnavailable'), 'warning');
        return;
      }
    } catch {
      addToast(t('main.proxyUnavailable'), 'warning');
      return;
    }
    addToast(t('main.rssSyncFailed'), 'warning');
  }, [t]);

  const applySyncResults = useCallback((
    results,
    preferredFeedId = null,
    options: {
      selectPreferredFeedArticle?: boolean
      selectFirstArticleWhenEmpty?: boolean
    } = {},
  ) => {
    const {
      selectPreferredFeedArticle = true,
      selectFirstArticleWhenEmpty = true,
    } = options;
    const entries = results.flatMap(result => result.entries);
    const hasError = results.some(result => result.updates?.syncError);
    results.forEach(result => {
      updateFeed(result.feedId, result.updates);
    });
    const updatedFeeds = loadFeeds();
    setFeeds(updatedFeeds);
    if (entries.length) {
      const merged = upsertEntries(entries);
      setArticles(merged);
      if (selectPreferredFeedArticle && preferredFeedId != null) {
        const firstFromFeed = merged.find(entry => entry.feedId === preferredFeedId);
        if (firstFromFeed) {
          setSelectedArticleId(firstFromFeed.id);
          return { merged, hasError, entries, updatedFeeds };
        }
      }
      if (selectFirstArticleWhenEmpty) {
        setSelectedArticleId(prev => (prev == null && merged.length > 0 ? merged[0].id : prev));
      }
      return { merged, hasError, entries, updatedFeeds };
    }
    return { merged: null, hasError, entries, updatedFeeds };
  }, []);
  const waitForSyncIdle = useCallback(async (timeoutMs = 20_000) => {
    const startedAt = Date.now();
    while (syncInFlightRef.current && Date.now() - startedAt < timeoutMs) {
      await new Promise<void>(resolve => {
        window.setTimeout(resolve, 120);
      });
    }
    return !syncInFlightRef.current;
  }, []);
  const runFeedSync = useCallback(async ({
    feedIds = null,
    preferredFeedId = null,
    force = false,
    mode = 'auto',
    lightweight = false,
    entryLimit = null,
  }: {
    feedIds?: number[] | null
    preferredFeedId?: number | null
    force?: boolean
    mode?: 'initial' | 'auto' | 'manual-global' | 'manual-feed' | 'manual-add'
    lightweight?: boolean
    entryLimit?: number | null
  } = {}) => {
    if (syncInFlightRef.current) {
      if (!mode.startsWith('manual')) {
        return { skipped: true };
      }
      const idle = await waitForSyncIdle();
      if (!idle) {
        addToast(t('list.syncingFeeds'), 'info');
        writeDeveloperLog({
          level: 'warn',
          module: 'feeds',
          action: 'sync.skipped_busy',
          result: 'failure',
          errorCode: 'sync_busy_timeout',
          context: {
            mode,
            force,
            feedIds,
            lightweight,
            entryLimit,
          },
        });
        return { skipped: true };
      }
    }

    const storedFeeds = loadFeeds();
    const targetFeeds = Array.isArray(feedIds) && feedIds.length
      ? storedFeeds.filter(feed => feedIds.includes(feed.id))
      : storedFeeds;

    if (!targetFeeds.length) {
      return { skipped: true };
    }

    syncInFlightRef.current = true;
    setIsSyncingFeeds(true);
    try {
      const syncConcurrency = mode === 'manual-add' || lightweight ? 1 : 4;
      const results = await syncFeeds(targetFeeds, syncConcurrency, {
        force,
        lightweight,
        entryLimit: lightweight ? (entryLimit ?? 20) : entryLimit,
      });
      const outcome = applySyncResults(results, preferredFeedId, {
        selectPreferredFeedArticle: !lightweight,
        selectFirstArticleWhenEmpty: !lightweight,
      });
      const failedResults = results.filter(result => (result.updates?.syncError || '').trim());
      const shouldLogSync = mode !== 'auto' || failedResults.length > 0;
      if (shouldLogSync) {
        writeDeveloperLog({
          level: failedResults.length > 0 ? 'warn' : 'info',
          module: 'feeds',
          action: 'sync.completed',
          result: failedResults.length > 0 ? 'failure' : 'success',
          errorCode: failedResults.length > 0 ? 'feed_sync_error' : undefined,
          context: {
            mode,
            force,
            targetFeedCount: targetFeeds.length,
            fetchedEntryCount: outcome.entries.length,
            lightweight,
            entryLimit: lightweight ? (entryLimit ?? 20) : entryLimit,
            concurrency: syncConcurrency,
            failedFeedCount: failedResults.length,
            failedFeeds: failedResults.map(result => ({
              feedId: result.feedId,
              error: result.updates?.syncError,
            })),
          },
        });
      }

      if (mode.startsWith('manual')) {
        if (outcome.entries.length) {
          addToast(t('main.fetchedArticles', { count: outcome.entries.length }), 'success');
        } else if (outcome.hasError) {
          await notifySyncFailure();
        } else {
          addToast(t('main.noNewArticles'), 'info');
        }
      } else if (mode === 'initial' && !outcome.entries.length && outcome.hasError) {
        await notifySyncFailure();
      }

      return outcome;
    } catch (error) {
      writeDeveloperLog({
        level: 'error',
        module: 'feeds',
        action: 'sync.completed',
        result: 'failure',
        errorCode: 'sync_exception',
        context: {
          mode,
          force,
          targetFeedCount: targetFeeds.length,
          lightweight,
          entryLimit,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      if (mode !== 'auto') {
        await notifySyncFailure();
      }
      return { skipped: false, hasError: true, entries: [] };
    } finally {
      setIsSyncingFeeds(false);
      syncInFlightRef.current = false;
    }
  }, [applySyncResults, notifySyncFailure, t, waitForSyncIdle]);

  // --- Handlers ---
  useEffect(() => {
    setFeedCategories(loadFeedCategories());
    const storedFeeds = loadFeeds();
    setFeeds(storedFeeds);
    if (!storedFeeds.length) {
      setArticles(clearEntries());
      setSelectedArticleId(null);
      return;
    }
    if (!articles.length) {
      const storedEntries = loadEntries();
      setArticles(storedEntries);
      if (storedEntries.length > 0) {
        setSelectedArticleId(storedEntries[0].id);
      }
    } else if (selectedArticleId == null && articles.length > 0) {
      setSelectedArticleId(articles[0].id);
    }

    void runFeedSync({ mode: 'initial' });
  }, []);

  useEffect(() => {
    if (!feeds.length) return;
    const intervalMs = Math.max(1, refreshIntervalMinutes) * 60_000;
    const timer = window.setInterval(() => {
      if (syncInFlightRef.current) return;
      void runFeedSync({ mode: 'auto' });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [feeds.length, refreshIntervalMinutes, runFeedSync]);

  useEffect(() => {
    if (!feeds.length) return;
    let cancelled = false;

    feeds.forEach(feed => {
      if (!shouldRefreshAutoFeedIcon(feed)) return;
      const source = normalizeFeedIconSource(feed.iconSource, feed.icon);
      if (source !== 'auto') return;

      const attemptKey = `${feed.id}:${feed.url}:${feed.siteUrl || ''}:${feed.updatedAt || ''}`;
      if (autoIconAttemptRef.current.has(attemptKey)) return;
      autoIconAttemptRef.current.add(attemptKey);
      while (autoIconAttemptRef.current.size > AUTO_ICON_ATTEMPT_LIMIT) {
        const oldest = autoIconAttemptRef.current.values().next().value;
        if (!oldest) break;
        autoIconAttemptRef.current.delete(oldest);
      }

      void fetchAutoFeedIcon({
        title: feed.title,
        url: feed.url,
        siteUrl: feed.siteUrl || '',
      })
        .then(icon => {
          if (cancelled) return;
          const latest = loadFeeds().find(item => item.id === feed.id);
          if (!latest) return;
          if (normalizeFeedIconSource(latest.iconSource, latest.icon) !== 'auto') return;
          if (latest.icon === icon) return;
          const next = updateFeed(feed.id, { icon, iconSource: 'auto' });
          setFeeds(next);
        })
        .catch(() => {
          // Swallow icon refresh failures and keep fallback glyph.
        });
    });

    return () => {
      cancelled = true;
    };
  }, [feeds]);

  const deriveSiteUrl = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return '';
    }
  };

  const handleAddFeed = async () => {
    const name = newFeedName.trim();
    const url = newFeedUrl.trim();
    if (!name || !url) {
      addToast(t('main.feedNameUrlRequired'), 'warning');
      return;
    }
    try {
      new URL(url);
    } catch {
      addToast(t('main.enterValidUrl'), 'warning');
      return;
    }

    const record = addFeed({
      title: name,
      url,
      siteUrl: deriveSiteUrl(url),
      categoryId: newFeedCategory,
      iconSource: 'auto',
    });

    setFeeds(prev => [record, ...prev]);
    setSelectedCategory('all');
    setSelectedFeedId(null);
    setSearchQuery('');
    setNewFeedName('');
    setNewFeedUrl('');
    setShowAddFeed(false);
    addToast(t('main.subscriptionAdded'), 'success');
    writeDeveloperLog({
      level: 'info',
      module: 'feeds',
      action: 'subscription.added',
      result: 'success',
      context: {
        feedId: record.id,
        title: record.title,
        url: record.url,
        categoryId: record.categoryId,
      },
    });

    addToast(t('main.fetchingLatestArticles'), 'info');
    await runFeedSync({
      feedIds: [record.id],
      force: true,
      mode: 'manual-add',
      lightweight: true,
      entryLimit: 20,
    });
  };

  const handleManualRefreshAll = useCallback(async () => {
    if (!feeds.length) return;
    addToast(t('main.fetchingLatestArticles'), 'info');
    await runFeedSync({ force: true, mode: 'manual-global' });
  }, [feeds.length, runFeedSync, t]);

  const handleManualRefreshFeed = useCallback(async (feedId: number) => {
    const target = feeds.find(feed => feed.id === feedId);
    if (!target) return;
    addToast(t('main.fetchingFeedArticles', { feed: target.title }), 'info');
    await runFeedSync({
      feedIds: [feedId],
      preferredFeedId: feedId,
      force: true,
      mode: 'manual-feed',
    });
  }, [feeds, runFeedSync, t]);

  const handleRemoveFeed = (id) => {
    const removedFeed = feeds.find(feed => feed.id === id);
    const next = removeFeed(id);
    setFeeds(next);
    const remainingEntries = removeEntriesByFeedIds([id]);
    setArticles(remainingEntries);
    if (selectedArticleId != null && !remainingEntries.some(entry => entry.id === selectedArticleId)) {
      setSelectedArticleId(remainingEntries[0]?.id ?? null);
    }
    addToast(t('main.subscriptionRemoved'), 'info');
    writeDeveloperLog({
      level: 'info',
      module: 'feeds',
      action: 'subscription.removed',
      result: 'success',
      context: {
        feedId: id,
        title: removedFeed?.title,
        url: removedFeed?.url,
      },
    });
  };

  // --- Effects ---

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.isComposing) return;
      if (overlayOpenRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeOverlayRouteRef.current();
        }
        return;
      }
      const target = e.target;
      const isEditableTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const key = (e.key || '').toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        setCommandPaletteMode('palette');
        setIsCommandPaletteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'p') {
        e.preventDefault();
        setCommandPaletteMode('jump');
        setIsCommandPaletteOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        if (isFocusMode) {
          setIsFocusMode(false);
          return;
        }
        setIsCommandPaletteOpen(false);
        setLightboxSrc(null);
        return;
      }
      if (isEditableTarget) return;

      if (key === 'f') {
        e.preventDefault();
        setIsFocusMode(!isFocusMode);
        return;
      }

      if (isCommandPaletteOpen || lightboxSrc) return;

      const currentIndex = navigableArticles.findIndex(a => a.id === selectedArticleId);

      if (key === 'j') {
        if (currentIndex < navigableArticles.length - 1) {
          setSelectedArticleId(navigableArticles[currentIndex + 1].id);
        }
      } else if (key === 'k') {
        if (currentIndex > 0) {
          setSelectedArticleId(navigableArticles[currentIndex - 1].id);
        }
      } else if (key === '[') {
        setIsSidebarOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedArticleId, isCommandPaletteOpen, lightboxSrc, isFocusMode, navigableArticles]);

  // Loading Simulation & Scroll Reset
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  useEffect(() => {
    if (activeArticle && !activeArticle.isRead) {
      setArticles(prev => updateEntryState(activeArticle.id, { isRead: true }, prev));
    }
    setIsLoadingArticle(true);
    const timer = setTimeout(() => setIsLoadingArticle(false), 300);

    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
      summaryAbortRef.current = null;
    }
    if (translationAbortRef.current) {
      translationAbortRef.current.abort();
      translationAbortRef.current = null;
    }
    if (summaryTaskKeyRef.current) {
      const cancelledKey = summaryTaskKeyRef.current;
      setSummaryTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        cancelledKey,
        'cancelled',
        AI_STATUS_MEMORY_LIMIT,
      ));
      summaryTaskKeyRef.current = null;
    }
    if (translationTaskKeyRef.current) {
      const cancelledKey = translationTaskKeyRef.current;
      setTranslationTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        cancelledKey,
        'cancelled',
        AI_STATUS_MEMORY_LIMIT,
      ));
      translationTaskKeyRef.current = null;
    }

    setIsGeneratingSummary(false);
    setIsTranslating(false);
    setIsPlayingAudio(false);
    setIsGeneratingAudio(false);
    setIsPausedAudio(false);
    if (ttsControllerRef.current) {
      ttsControllerRef.current.stop();
    }

    return () => clearTimeout(timer);
  }, [selectedArticleId]);

  useEffect(() => {
    if (!activeArticle || !summaryCacheKey) return;
    let cancelled = false;
    const loadSummary = async () => {
      const cached = await loadCachedSummary(summaryCacheKey);
      if (!cached || cancelled) return;
      setAiSummariesByKey(prev => (
        prev[summaryCacheKey]
          ? prev
          : upsertCappedRecord(prev, summaryCacheKey, cached, AI_SUMMARY_MEMORY_LIMIT)
      ));
    };
    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [activeArticle?.id, summaryCacheKey]);

  useEffect(() => {
    if (!activeArticle || !translationCacheKey) return;
    let cancelled = false;
    const loadTranslation = async () => {
      const cached = await loadCachedTranslation(translationCacheKey);
      if (!cached || cancelled) return;
      setTranslationsByKey(prev => (
        prev[translationCacheKey]
          ? prev
          : upsertCappedRecord(prev, translationCacheKey, cached, AI_TRANSLATION_MEMORY_LIMIT)
      ));
    };
    loadTranslation();
    return () => {
      cancelled = true;
    };
  }, [activeArticle?.id, translationCacheKey]);

  useEffect(() => {
    return () => {
      if (ttsControllerRef.current) {
        ttsControllerRef.current.stop();
      }
      if (summaryAbortRef.current) {
        summaryAbortRef.current.abort();
      }
      if (translationAbortRef.current) {
        translationAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      imageObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!activeArticle?.link) return;
    let ignore = false;

    const loadCachedReadable = async () => {
      const cached = await getCachedReadable(activeArticle.id);
      if (ignore || !cached?.content) return;
      setReadableById(prev => (
        prev[activeArticle.id]
          ? prev
          : upsertCappedRecord(prev, String(activeArticle.id), cached, READABLE_MEMORY_LIMIT)
      ));
      setOfflineStatusById(prev => upsertCappedRecord(
        prev,
        String(activeArticle.id),
        {
          cached: true,
          source: 'cache',
          cachedAt: cached.cachedAt,
        },
        OFFLINE_STATUS_MEMORY_LIMIT,
      ));
      markCacheAccess(activeArticle.id);
    };

    loadCachedReadable();

    const loadReadable = async () => {
      let didCacheReadable = false;
      if (!isOnline) return;
      if (activeReadableContent) return;
      try {
        const response = await fetchHtmlViaProxy(activeArticle.link);
        if (ignore) return;
        if (response.status >= 400) return;
        const baseUrl = response.finalUrl || activeArticle.link;
        const extracted = extractReadable(response.html, baseUrl);
        if (!extracted?.content) return;
        const proxiedContent = rewriteHtmlImageUrls(extracted.content, baseUrl);
        const readablePayload = { ...extracted, content: proxiedContent };
        setReadableById(prev => upsertCappedRecord(
          prev,
          String(activeArticle.id),
          readablePayload,
          READABLE_MEMORY_LIMIT,
        ));
        const imageUrls = extractImageUrlsFromHtml(proxiedContent, baseUrl);
        await cacheArticleAssets({
          entryId: activeArticle.id,
          content: proxiedContent,
          title: extracted.title,
          byline: extracted.byline,
          excerpt: extracted.excerpt,
          sourceUrl: activeArticle.link,
          baseUrl,
          coverImageUrl: coverProxyUrl,
          priority: activeArticle.isStarred ? 3 : activeArticle.isRead ? 1 : 2,
          imageUrls,
          cacheImages: false,
        });
        didCacheReadable = true;
        setOfflineStatusById(prev => upsertCappedRecord(
          prev,
          String(activeArticle.id),
          {
            cached: true,
            source: 'network',
            cachedAt: Date.now(),
          },
          OFFLINE_STATUS_MEMORY_LIMIT,
        ));
      } catch {
        // fallback to RSS content
      } finally {
        const fallbackContent = activeArticle.content;
        if (!didCacheReadable && fallbackContent) {
          const proxiedFallback = rewriteHtmlImageUrls(fallbackContent, activeArticle.link);
          const result = await cacheArticleAssets({
            entryId: activeArticle.id,
            content: proxiedFallback,
            title: activeArticle.title,
            byline: activeArticle.author,
            excerpt: activeArticle.summary,
            sourceUrl: activeArticle.link,
            baseUrl: activeArticle.link,
            coverImageUrl: coverProxyUrl,
            priority: activeArticle.isStarred ? 3 : activeArticle.isRead ? 1 : 2,
            cacheImages: false,
          });
          if (result.cachedReadable) {
            setOfflineStatusById(prev => upsertCappedRecord(
              prev,
              String(activeArticle.id),
              {
                cached: true,
                source: 'fallback',
                cachedAt: Date.now(),
              },
              OFFLINE_STATUS_MEMORY_LIMIT,
            ));
          }
        }
      }
    };

    loadReadable();

    return () => {
      ignore = true;
    };
  }, [activeArticle?.id, activeArticle?.link, activeArticle?.isStarred, activeArticle?.isRead, activeArticle?.image, activeArticle?.content, activeReadableContent, coverProxyUrl, isOnline]);

  const scheduleIdleWork = useCallback((callback) => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const runtime = window as typeof window & {
      requestIdleCallback?: (cb: (...args: unknown[]) => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    };
    if (typeof runtime.requestIdleCallback === 'function') {
      const idleId = runtime.requestIdleCallback(callback, { timeout: 250 });
      return () => {
        if (typeof runtime.cancelIdleCallback === 'function') {
          runtime.cancelIdleCallback(idleId);
        }
      };
    }
    const timeoutId = window.setTimeout(callback, 32);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!activeArticle) {
      imageObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      imageObjectUrlsRef.current = [];
      setRenderedContent('');
      return;
    }
    const baseContent = activeReadableContent || activeArticle.content || '';
    const proxiedContent = rewriteHtmlImageUrls(baseContent, activeArticle.link);
    setRenderedContent(proxiedContent);

    if (!proxiedContent || !proxiedContent.includes('<img')) {
      imageObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      imageObjectUrlsRef.current = [];
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      const doc = new DOMParser().parseFromString(proxiedContent, 'text/html');
      const images = Array.from(doc.images);
      const objectUrls: string[] = [];
      for (const image of images) {
        if (cancelled) break;
        const rawSrc = image.getAttribute('src') || '';
        const normalized = normalizeImageUrl(rawSrc, activeArticle.link);
        if (!normalized) continue;
        const cached = await getCachedImage(normalized);
        if (!cached) continue;
        const objectUrl = URL.createObjectURL(cached);
        objectUrls.push(objectUrl);
        image.setAttribute('src', objectUrl);
      }
      if (cancelled) {
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        return;
      }
      imageObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      imageObjectUrlsRef.current = objectUrls;
      const nextRenderedContent = doc.body.innerHTML;
      setRenderedContent(prev => (prev === nextRenderedContent ? prev : nextRenderedContent));
    };

    const cancelScheduledHydration = scheduleIdleWork(() => {
      void hydrate();
    });
    return () => {
      cancelled = true;
      cancelScheduledHydration();
    };
  }, [activeArticle?.id, activeArticle?.content, activeArticle?.link, activeReadableContent, scheduleIdleWork]);

  useEffect(() => {
    if (!coverProxyUrl) {
      setCoverImageOverride(null);
      return;
    }
    let ignore = false;
    let objectUrl: string | null = null;
    const loadCover = async () => {
      const cached = await getCachedImage(coverProxyUrl);
      if (!cached || ignore) return;
      objectUrl = URL.createObjectURL(cached);
      setCoverImageOverride(objectUrl);
    };
    loadCover();
    return () => {
      ignore = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverProxyUrl]);

  const handleDeepDive = useCallback(async ({ force = false } = {}) => {
    if (!activeArticle || !summaryCacheKey) return;
    const disabledReason = getSummaryDisabledReason({ includeBusy: false });
    if (disabledReason) {
      addToast(disabledReason, 'warning');
      if (aiConfigIssue && disabledReason === aiConfigIssue) {
        openSettingsRoute();
      }
      return;
    }
    if (isGeneratingSummary) return;
    if (activeAiSummary && !force) {
      addToast(t('main.summaryAlreadyGenerated'), 'info');
      return;
    }

    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
    }
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    summaryTaskKeyRef.current = summaryCacheKey;

    setIsGeneratingSummary(true);
    setAiErrorByKey(prev => upsertCappedRecord(
      prev,
      summaryCacheKey,
      null,
      AI_ERROR_MEMORY_LIMIT,
    ));
    setSummaryTaskStatusByKey(prev => upsertCappedRecord(
      prev,
      summaryCacheKey,
      'requesting',
      AI_STATUS_MEMORY_LIMIT,
    ));
    try {
      const summary = await generateSummaryWithRetry({
        id: String(activeArticle.id),
        title: activeArticle.title || '',
        summary: activeArticle.summary || '',
        content: activeReadableContent || activeArticle.content || '',
        targetLanguage: summaryLanguage,
      }, {
        config: aiRequestConfig,
        cacheKey: summaryCacheKey,
        force,
        signal: controller.signal,
        onLog: handleAiTaskLog,
      });
      if (controller.signal.aborted) return;
      setAiSummariesByKey(prev => upsertCappedRecord(
        prev,
        summaryCacheKey,
        summary,
        AI_SUMMARY_MEMORY_LIMIT,
      ));
      setSummaryTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        summaryCacheKey,
        'success',
        AI_STATUS_MEMORY_LIMIT,
      ));
    } catch (error) {
      const message = formatAiErrorMessage(error);
      if (isAiTaskError(error) && error.code === 'cancelled') {
        setSummaryTaskStatusByKey(prev => upsertCappedRecord(
          prev,
          summaryCacheKey,
          'cancelled',
          AI_STATUS_MEMORY_LIMIT,
        ));
      } else {
        setAiErrorByKey(prev => upsertCappedRecord(
          prev,
          summaryCacheKey,
          message,
          AI_ERROR_MEMORY_LIMIT,
        ));
        setSummaryTaskStatusByKey(prev => upsertCappedRecord(
          prev,
          summaryCacheKey,
          'failure',
          AI_STATUS_MEMORY_LIMIT,
        ));
        addToast(message, 'warning');
      }
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
      }
      if (summaryTaskKeyRef.current === summaryCacheKey) {
        summaryTaskKeyRef.current = null;
      }
      setIsGeneratingSummary(false);
    }
  }, [
    activeAiSummary,
    activeArticle,
    activeReadableContent,
    addToast,
    aiConfigIssue,
    aiRequestConfig,
    formatAiErrorMessage,
    getSummaryDisabledReason,
    handleAiTaskLog,
    isGeneratingSummary,
    openSettingsRoute,
    summaryCacheKey,
    summaryLanguage,
    t,
  ]);

  const handleTranslate = useCallback(async ({ force = false } = {}) => {
    if (!activeArticle) return;
    if (!translationCacheKey) return;
    const shouldForce = force || Boolean(activeTranslation);
    const disabledReason = getTranslationDisabledReason({ includeBusy: false });
    if (disabledReason) {
      addToast(disabledReason, 'warning');
      if (aiConfigIssue && disabledReason === aiConfigIssue) {
        openSettingsRoute();
      }
      return;
    }
    if (isTranslating) return;

    if (translationAbortRef.current) {
      translationAbortRef.current.abort();
    }
    const controller = new AbortController();
    translationAbortRef.current = controller;
    translationTaskKeyRef.current = translationCacheKey;

    setIsTranslating(true);
    setTranslationTaskStatusByKey(prev => upsertCappedRecord(
      prev,
      translationCacheKey,
      'requesting',
      AI_STATUS_MEMORY_LIMIT,
    ));
    setTranslationErrorByKey(prev => upsertCappedRecord(
      prev,
      translationCacheKey,
      null,
      AI_ERROR_MEMORY_LIMIT,
    ));
    try {
      const translation = await generateTranslationWithRetry({
        id: String(activeArticle.id),
        title: activeArticle.title || '',
        summary: activeArticle.summary || '',
        content: activeReadableContent || activeArticle.content || '',
        targetLanguage: translationTarget,
        outputStyle: translationOutput,
        sourceLanguage: 'auto',
      }, {
        config: aiRequestConfig,
        cacheKey: translationCacheKey,
        force: shouldForce,
        signal: controller.signal,
        onLog: handleAiTaskLog,
      });
      if (controller.signal.aborted) return;
      setTranslationsByKey(prev => upsertCappedRecord(
        prev,
        translationCacheKey,
        translation,
        AI_TRANSLATION_MEMORY_LIMIT,
      ));
      setTranslationTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        translationCacheKey,
        'success',
        AI_STATUS_MEMORY_LIMIT,
      ));
      if (!translation?.html) {
        addToast(t('main.translationNoStructuredHtml'), 'warning');
      }
    } catch (error) {
      const message = formatAiErrorMessage(error);
      if (isAiTaskError(error) && error.code === 'cancelled') {
        setTranslationTaskStatusByKey(prev => upsertCappedRecord(
          prev,
          translationCacheKey,
          'cancelled',
          AI_STATUS_MEMORY_LIMIT,
        ));
        return;
      }
      setTranslationErrorByKey(prev => upsertCappedRecord(
        prev,
        translationCacheKey,
        message,
        AI_ERROR_MEMORY_LIMIT,
      ));
      setTranslationTaskStatusByKey(prev => upsertCappedRecord(
        prev,
        translationCacheKey,
        'failure',
        AI_STATUS_MEMORY_LIMIT,
      ));
      addToast(message, 'warning');
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null;
      }
      if (translationTaskKeyRef.current === translationCacheKey) {
        translationTaskKeyRef.current = null;
      }
      setIsTranslating(false);
    }
  }, [
    activeArticle,
    activeReadableContent,
    activeTranslation,
    addToast,
    aiConfigIssue,
    aiRequestConfig,
    formatAiErrorMessage,
    getTranslationDisabledReason,
    handleAiTaskLog,
    isTranslating,
    openSettingsRoute,
    t,
    translationCacheKey,
    translationOutput,
    translationTarget,
  ]);

  const handleToggleAudio = useCallback(async () => {
    if (!activeArticle) return;
    if (!isTtsSupported()) {
      addToast(t('main.ttsUnsupported'), 'warning');
      return;
    }

    const cloudTtsConfig = {
      provider: ttsProvider,
      apiBase: ttsApiBase,
      apiKey: ttsApiKey,
      apiSecret: ttsApiSecret,
      region: ttsRegion,
      projectId: ttsProjectId,
      appId: ttsAppId,
      model: ttsModel,
      voice: ttsVoice,
      format: ttsAudioFormat,
    };
    const validation = validateCloudTtsConfig(cloudTtsConfig);
    if (!validation.ok) {
      addToast(validation.message, 'warning');
      openSettingsRoute();
      return;
    }

    if (!ttsControllerRef.current) {
      ttsControllerRef.current = createTtsController();
    }

    const controller = ttsControllerRef.current;
    controller.configure(cloudTtsConfig);

    if (isPlayingAudio) {
      controller.pause();
      setIsPlayingAudio(false);
      setIsPausedAudio(true);
      return;
    }

    if (isPausedAudio) {
      controller.resume();
      setIsPlayingAudio(true);
      setIsPausedAudio(false);
      return;
    }

    const speechText = buildTtsText({
      title: activeArticle.title,
      author: activeArticle.author,
      source: activeArticle.feedName,
      contentHtml: readerContentHtml,
      summaryText: activeArticle.summary,
      excludeSummary: true,
      includeAuthor: ttsIncludeAuthor,
      includeSource: ttsIncludeSource,
    });

    if (!speechText) {
      addToast(t('main.noReadableTextForTts'), 'warning');
      return;
    }

    setIsGeneratingAudio(true);
    addToast(t('main.preparingSpeech', { provider: ttsProviderLabel }), 'info');
    controller.speak(speechText, {
      onStart: () => {
        setIsGeneratingAudio(false);
        setIsPlayingAudio(true);
        setIsPausedAudio(false);
        addToast(t('main.nowPlaying'), 'success');
      },
      onPause: () => {
        setIsPlayingAudio(false);
        setIsPausedAudio(true);
      },
      onResume: () => {
        setIsPlayingAudio(true);
        setIsPausedAudio(false);
      },
      onEnd: () => {
        setIsGeneratingAudio(false);
        setIsPlayingAudio(false);
        setIsPausedAudio(false);
      },
      onError: (error) => {
        setIsGeneratingAudio(false);
        setIsPlayingAudio(false);
        setIsPausedAudio(false);
        addToast(error?.message || t('main.ttsFailed'), 'warning');
      },
    });
  }, [
    activeArticle,
    addToast,
    isPausedAudio,
    isPlayingAudio,
    openSettingsRoute,
    readerContentHtml,
    t,
    ttsApiBase,
    ttsApiKey,
    ttsApiSecret,
    ttsAppId,
    ttsAudioFormat,
    ttsIncludeAuthor,
    ttsIncludeSource,
    ttsModel,
    ttsProjectId,
    ttsProvider,
    ttsProviderLabel,
    ttsRegion,
    ttsVoice,
  ]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    addToast(t('main.copyLinkSuccess'));
  }, [addToast, t]);

  const handleOpenOriginal = useCallback(() => {
    if (!activeArticle?.link) {
      addToast(t('main.originalLinkUnavailable'), 'warning');
      return;
    }
    window.open(activeArticle.link, '_blank', 'noopener,noreferrer');
  }, [activeArticle?.link, addToast, t]);

  const handleToggleRead = useCallback(() => {
    if (!activeArticle) return;
    setArticles(prev => toggleEntryRead(activeArticle.id, prev));
    addToast(activeArticle.isRead ? t('main.markedUnread') : t('main.markedRead'), 'info');
  }, [activeArticle, addToast, t]);

  const handleToggleStar = useCallback(() => {
    if (!activeArticle) return;
    setArticles(prev => toggleEntryStar(activeArticle.id, prev));
    addToast(activeArticle.isStarred ? t('main.removedFavorites') : t('main.addedFavorites'));
  }, [activeArticle, addToast, t]);

  const handleArticleContentClick = useCallback((event) => {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    const src = target.getAttribute('src');
    if (src) setLightboxSrc(src);
  }, []);
  const handleSearchQueryChange = useCallback((nextValue: string) => {
    startSearchTransition(() => {
      setSearchQuery(nextValue);
    });
  }, [startSearchTransition]);
  const handleSelectArticle = useCallback((articleId: number) => {
    setSelectedArticleId(articleId);
    if (isMobile) setIsListOpen(false);
  }, [isMobile]);
  const handleMarkAllRead = useCallback(() => {
    addToast(t('list.allItemsMarkedRead'));
  }, [addToast, t]);
  const handleManualRefreshAllClick = useCallback(() => {
    void handleManualRefreshAll();
  }, [handleManualRefreshAll]);
  const interfaceFontClass = uiFontFamily === 'custom'
    ? 'font-ui-custom'
    : uiFontFamily === 'serif'
      ? 'font-serif'
      : 'font-sans';
  const titleFontClass = articleFontFamily === 'custom'
    ? 'font-article-custom'
    : articleFontFamily === 'serif'
      ? 'font-serif'
      : 'font-sans';
  const proseTypographyFontClass = articleFontFamily === 'custom'
    ? 'article-prose-font-custom'
    : articleFontFamily === 'serif'
      ? 'prose-headings:font-serif prose-p:font-serif prose-li:font-serif prose-blockquote:font-serif'
      : 'prose-headings:font-sans prose-p:font-sans prose-li:font-sans prose-blockquote:font-sans';
  const textSizeClass = (() => {
    if (fontSize === 'small') return 'prose-sm';
    if (fontSize === 'large') return 'prose-xl';
    return 'prose-lg';
  })();

  const readableContent = activeReadableContent || null;
  const offlineStatus = activeArticle ? offlineStatusById[activeArticle.id] : null;
  const isCachedReadable = offlineStatus?.cached === true;
  const showOfflineMiss = activeArticle && !isOnline && !isCachedReadable && !readableContent && !activeArticle?.content;
  const summaryDisabledReason = getSummaryDisabledReason();
  const translationDisabledReason = getTranslationDisabledReason();
  const commandItems = useMemo(() => {
    if (!isCommandPaletteOpen) return EMPTY_COMMAND_ITEMS;
    return [
      {
        id: 'ai.summary',
        label: t('command.summary.label'),
        description: summaryDisabledReason
          ? summaryDisabledReason
          : activeArticle
            ? t('command.summary.descriptionArticle', { language: summaryLanguageLabel, title: activeArticle.title })
            : t('command.summary.descriptionDefault'),
        icon: <BrainCircuit size={10} />,
        disabled: Boolean(summaryDisabledReason),
      },
      {
        id: 'ai.translate',
        label: t('command.translate.label', { target: translationTargetLabel }),
        description: translationDisabledReason
          ? translationDisabledReason
          : activeArticle
            ? t('command.translate.descriptionArticle', { target: translationTargetLabel, output: translationOutputLabel })
            : t('command.translate.descriptionDefault'),
        icon: <MessageSquare size={10} />,
        disabled: Boolean(translationDisabledReason),
      },
      {
        id: 'tts.toggleAuthor',
        label: t('command.ttsAuthor.label', { state: ttsIncludeAuthor ? t('toolbar.on') : t('toolbar.off') }),
        description: ttsIncludeAuthor ? t('command.ttsAuthor.descriptionOn') : t('command.ttsAuthor.descriptionOff'),
        icon: <Mic size={10} />,
        disabled: !isTtsSupported(),
      },
      {
        id: 'tts.toggleSource',
        label: t('command.ttsSource.label', { state: ttsIncludeSource ? t('toolbar.on') : t('toolbar.off') }),
        description: ttsIncludeSource ? t('command.ttsSource.descriptionOn') : t('command.ttsSource.descriptionOff'),
        icon: <Mic size={10} />,
        disabled: !isTtsSupported(),
      },
    ];
  }, [
    isCommandPaletteOpen,
    activeArticle,
    summaryDisabledReason,
    translationDisabledReason,
    ttsIncludeAuthor,
    ttsIncludeSource,
    summaryLanguageLabel,
    translationTargetLabel,
    translationOutputLabel,
    t,
  ]);
  const commandPaletteArticles = isCommandPaletteOpen ? filteredArticles : EMPTY_COMMAND_PALETTE_ARTICLES;
  const hasFeeds = feeds.length > 0;
  const articlesCount = articles.length;
  const shellPanes = useMemo(() => (
    <>
      <MainShellChrome
        isDesktopShell={isDesktopShell}
        lightboxSrc={lightboxSrc}
        setLightboxSrc={setLightboxSrc}
        isCommandPaletteOpen={isCommandPaletteOpen}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        commandPaletteMode={commandPaletteMode}
        commandPaletteArticles={commandPaletteArticles}
        setSelectedArticleId={setSelectedArticleId}
        commandItems={commandItems}
        registerAddToast={registerAddToast}
        handleDeepDive={handleDeepDive}
        handleTranslate={handleTranslate}
        setTtsIncludeAuthor={setTtsIncludeAuthor}
        setTtsIncludeSource={setTtsIncludeSource}
        t={t}
        feedContextMenu={feedContextMenu}
        contextMenuFeed={contextMenuFeed}
        closeFeedContextMenu={closeFeedContextMenu}
        handleManualRefreshFeed={handleManualRefreshFeed}
        openRssManagerRoute={openRssManagerRoute}
        isMobile={isMobile}
        isFocusMode={isFocusMode}
        showSidebar={showSidebar}
        showList={showList}
        closeMobilePanels={closeMobilePanels}
      />

      <SidebarPane
        showSidebar={showSidebar}
        interfaceFontClass={interfaceFontClass}
        t={t}
        sidebarCategories={sidebarCategories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        setSelectedFeedId={setSelectedFeedId}
        articlesCount={articlesCount}
        openFeedContextMenu={openFeedContextMenu}
        openRssManagerRoute={openRssManagerRoute}
        filteredFeeds={filteredFeeds}
        selectedFeedId={selectedFeedId}
        openSettingsRoute={openSettingsRoute}
        closeMobilePanels={closeMobilePanels}
      />

      <ArticleListPane
        showList={showList}
        t={t}
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchQueryChange}
        toggleListPanel={toggleListPanel}
        isSyncingFeeds={isSyncingFeeds}
        hasFeeds={hasFeeds}
        onManualRefreshAll={handleManualRefreshAllClick}
        onMarkAllRead={handleMarkAllRead}
        syncStatusPrimary={syncStatusPrimary}
        syncStatusSecondary={syncStatusSecondary}
        filteredArticles={filteredArticles}
        selectedArticleId={selectedArticleId}
        onSelectArticle={handleSelectArticle}
        formatArticleDate={formatArticleDate}
        interfaceFontClass={interfaceFontClass}
      />
      <ReaderPane
        t={t}
        activeArticle={activeArticle}
        showList={showList}
        openSidebar={openSidebar}
        toggleListPanel={toggleListPanel}
        isFocusMode={isFocusMode}
        setIsFocusMode={setIsFocusMode}
        handleDeepDive={handleDeepDive}
        summaryDisabledReason={summaryDisabledReason}
        isGeneratingSummary={isGeneratingSummary}
        summaryLanguageLabel={summaryLanguageLabel}
        handleTranslate={handleTranslate}
        translationDisabledReason={translationDisabledReason}
        isTranslating={isTranslating}
        translationTargetLabel={translationTargetLabel}
        translationOutputLabel={translationOutputLabel}
        handleToggleAudio={handleToggleAudio}
        isGeneratingAudio={isGeneratingAudio}
        isPlayingAudio={isPlayingAudio}
        isPausedAudio={isPausedAudio}
        ttsProviderLabel={ttsProviderLabel}
        articleFontFamily={articleFontFamily}
        setArticleFontFamily={setArticleFontFamily}
        articleCustomFontStack={articleCustomFontStack}
        setArticleCustomFontStack={setArticleCustomFontStack}
        fontSize={fontSize}
        setFontSize={setFontSize}
        handleCopyLink={handleCopyLink}
        handleOpenOriginal={handleOpenOriginal}
        isLoadingArticle={isLoadingArticle}
        titleFontClass={titleFontClass}
        formatArticleDate={formatArticleDate}
        handleToggleRead={handleToggleRead}
        handleToggleStar={handleToggleStar}
        showOfflineMiss={showOfflineMiss}
        activeAiSummary={activeAiSummary}
        activeAiError={activeAiError}
        translatedContentHtml={translatedContentHtml}
        activeTranslationError={activeTranslationError}
        coverImageOverride={coverImageOverride}
        coverProxyUrl={coverProxyUrl}
        setLightboxSrc={setLightboxSrc}
        handleArticleContentClick={handleArticleContentClick}
        textSizeClass={textSizeClass}
        proseTypographyFontClass={proseTypographyFontClass}
        readerContentHtml={readerContentHtml}
        ttsIncludeAuthor={ttsIncludeAuthor}
        setTtsIncludeAuthor={setTtsIncludeAuthor}
        ttsIncludeSource={ttsIncludeSource}
        setTtsIncludeSource={setTtsIncludeSource}
        ttsControllerRef={ttsControllerRef}
        setIsPlayingAudio={setIsPlayingAudio}
        setIsPausedAudio={setIsPausedAudio}
        setIsGeneratingAudio={setIsGeneratingAudio}
      />
    </>
  ), [
    activeAiError,
    activeAiSummary,
    activeArticle,
    articleCustomFontStack,
    articleFontFamily,
    articlesCount,
    closeFeedContextMenu,
    closeMobilePanels,
    commandItems,
    commandPaletteArticles,
    commandPaletteMode,
    contextMenuFeed,
    coverImageOverride,
    coverProxyUrl,
    feedContextMenu,
    filteredArticles,
    filteredFeeds,
    fontSize,
    formatArticleDate,
    handleArticleContentClick,
    handleCopyLink,
    handleDeepDive,
    handleManualRefreshAllClick,
    handleManualRefreshFeed,
    handleMarkAllRead,
    handleOpenOriginal,
    handleSearchQueryChange,
    handleSelectArticle,
    handleToggleAudio,
    handleToggleRead,
    handleToggleStar,
    handleTranslate,
    hasFeeds,
    interfaceFontClass,
    isCommandPaletteOpen,
    isDesktopShell,
    isFocusMode,
    isGeneratingAudio,
    isGeneratingSummary,
    isLoadingArticle,
    isMobile,
    isPausedAudio,
    isPlayingAudio,
    isSyncingFeeds,
    isTranslating,
    lightboxSrc,
    openFeedContextMenu,
    openRssManagerRoute,
    openSettingsRoute,
    openSidebar,
    proseTypographyFontClass,
    readerContentHtml,
    registerAddToast,
    searchQuery,
    selectedArticleId,
    selectedCategory,
    selectedFeedId,
    setArticleFontFamily,
    setArticleCustomFontStack,
    setFontSize,
    setIsCommandPaletteOpen,
    setIsFocusMode,
    setLightboxSrc,
    setSelectedArticleId,
    setSelectedCategory,
    setSelectedFeedId,
    setTtsIncludeAuthor,
    setTtsIncludeSource,
    showList,
    showOfflineMiss,
    showSidebar,
    sidebarCategories,
    summaryDisabledReason,
    summaryLanguageLabel,
    syncStatusPrimary,
    syncStatusSecondary,
    t,
    textSizeClass,
    titleFontClass,
    toggleListPanel,
    translatedContentHtml,
    translationDisabledReason,
    translationOutputLabel,
    translationTargetLabel,
    ttsControllerRef,
    ttsIncludeAuthor,
    ttsIncludeSource,
    ttsProviderLabel,
  ]);

  return (
    <div className={`relative flex h-screen w-full flex-col overflow-hidden antialiased transition-colors duration-500 ease-out bg-[var(--color-bg)] text-[var(--color-text)] accent-selection ${interfaceFontClass}`}>
      {isDesktopShell && <DesktopWindowTitleBar />}

      <div className="relative flex min-h-0 flex-1">
        {shellPanes}

      <MainShellOverlayController
        navigateWithDesktopFallback={navigateWithDesktopFallback}
        preloadSettingsOverlay={preloadSettingsOverlay}
        preloadRssManagerOverlay={preloadRssManagerOverlay}
        bindCloseOverlayRoute={bindCloseOverlayRoute}
        overlayOpenRef={overlayOpenRef}
        onOverlayRouteClosed={handleOverlayRouteClosed}
        markSettingsSyncPending={markSettingsSyncPending}
        markFeedsSyncPending={markFeedsSyncPending}
      />
      </div>
    </div>
  );
});

export function MainShell() {
  return <MainShellCore />;
}


