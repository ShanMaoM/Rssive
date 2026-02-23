// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  ArrowUp,
  BookOpen,
  BrainCircuit,
  CheckCircle,
  Command,
  ExternalLink,
  Feather,
  Layout,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Rss,
  Search,
  Share2,
  Settings,
  Star,
  Type,
  X,
} from 'lucide-react'
import { FeedIconBadge } from '../../modules/feeds/FeedIconBadge'
import {
  ArticleSkeleton,
  AudioWaveform,
  HighlightText,
  Interactive,
  QuantumAIPanel,
  RobustImage,
} from '../../modules/reader/components'
import { isTtsSupported } from '../../modules/tts'
import { ThemeToggleButton } from './common-ui'

const LIST_VIRTUALIZATION_THRESHOLD = 40
const LIST_ITEM_ESTIMATED_HEIGHT = 148
const LIST_OVERSCAN_COUNT = 8

export const SidebarPane = React.memo(function SidebarPane({
  showSidebar,
  interfaceFontClass,
  t,
  sidebarCategories,
  selectedCategory,
  setSelectedCategory,
  setSelectedFeedId,
  articlesCount,
  openFeedContextMenu,
  openRssManagerRoute,
  filteredFeeds,
  selectedFeedId,
  openSettingsRoute,
  closeMobilePanels,
}) {
  return (
    <aside
      className={`fixed md:relative inset-y-0 left-0 flex-shrink-0 bg-[#f7f7f5] dark:bg-stone-900/50 border-r border-stone-200 dark:border-stone-800 flex flex-col justify-between overflow-hidden z-30 transition-[width,opacity,transform] duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${showSidebar ? 'w-[260px] opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full md:-translate-x-10'}`}
    >
      <div className={`flex flex-col h-full w-[260px] transition-opacity duration-300 ${showSidebar ? 'opacity-100 delay-150' : 'opacity-0'}`}>
        <div className="h-16 flex items-center px-5 pt-1">
          <div className="flex items-center gap-2.5 text-stone-800 dark:text-stone-100 group cursor-pointer">
            <div className="w-8 h-8 bg-gradient-to-br from-stone-800 to-black dark:from-stone-100 dark:to-stone-300 text-white dark:text-stone-900 flex items-center justify-center rounded-lg shadow-lg transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
              <Feather size={16} strokeWidth={2.5} />
            </div>
            <span className={`font-bold text-xl tracking-tight ${interfaceFontClass}`}>Rssive</span>
          </div>
          <div className="ml-auto md:hidden">
            <Interactive
              onClick={closeMobilePanels}
              className="text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-2 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700"
              aria-label={t('nav.closeLibraryPanel')}
            >
              <X size={16} />
            </Interactive>
          </div>
        </div>

        <div className="px-3 py-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
          <div>
            <div className="px-3 text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3 opacity-80">{t('nav.library')}</div>
            {sidebarCategories.map(cat => (
              <Interactive
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id)
                  setSelectedFeedId(null)
                }}
                aria-current={selectedCategory === cat.id ? 'page' : undefined}
                className={`w-full flex items-center px-3 py-2 text-[14px] font-medium rounded-md mb-1 relative group/item transition-all duration-200 ${
                  selectedCategory === cat.id
                    ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm ring-1 ring-stone-200/50 dark:ring-stone-700'
                    : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {selectedCategory === cat.id && (
                  <div className="accent-bg absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full animate-fade-in"></div>
                )}
                <cat.icon size={16} className={`mr-3 transition-colors ${selectedCategory === cat.id ? 'accent-text' : 'text-stone-400 group-hover/item:text-stone-600 dark:group-hover/item:text-stone-300'}`} />
                {cat.name}
                {cat.id === 'all' && <span className="ml-auto text-xs text-stone-400 font-normal bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full">{articlesCount}</span>}
              </Interactive>
            ))}
          </div>

          <div onContextMenu={openFeedContextMenu}>
            <div className="flex items-center justify-between px-3 mb-3">
              <div className="text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest opacity-80">
                {t('nav.subscriptions')}
              </div>
              <Interactive
                onClick={openRssManagerRoute}
                className="text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800"
                title={t('nav.openRssManager')}
                aria-label={t('nav.openRssManager')}
              >
                <Rss size={12} />
              </Interactive>
            </div>
            <ul className="space-y-1">
              {filteredFeeds.map(feed => (
                <li
                  key={feed.id}
                  onContextMenu={(event) => {
                    event.stopPropagation()
                    openFeedContextMenu(event, feed.id)
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFeedId(feed.id)
                      setSelectedCategory('all')
                    }}
                    className="w-full flex items-center justify-start gap-1 px-3 py-1.5 text-sm text-stone-500 dark:text-stone-400 rounded-md hover:bg-stone-200/50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-200 transition-colors truncate group/feed"
                    aria-current={selectedFeedId === feed.id ? 'true' : undefined}
                    aria-label={t('nav.filterByFeed', { feed: feed.title })}
                  >
                    <FeedIconBadge
                      title={feed.title}
                      icon={feed.icon}
                      alt={feed.title}
                      imageClassName="h-4 w-4 rounded-sm object-cover opacity-80 grayscale group-hover/feed:grayscale-0 transition-all"
                      textClassName="w-4 flex justify-center text-[10px] opacity-60 grayscale group-hover/feed:grayscale-0 transition-all"
                    />
                    <span className="min-w-0 flex-1 truncate text-left opacity-90">{feed.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-4 border-t border-stone-200/60 dark:border-stone-800 bg-[#f7f7f5] dark:bg-stone-900/50">
          <div className="flex items-center justify-end gap-2">
            <Interactive
              onClick={openSettingsRoute}
              className="text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700"
              title={t('nav.settings')}
              aria-label={t('nav.settings')}
            >
              <Settings size={14} />
            </Interactive>
            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </aside>
  )
})

export const ArticleListPane = React.memo(function ArticleListPane({
  showList,
  t,
  searchQuery,
  onSearchQueryChange,
  toggleListPanel,
  isSyncingFeeds,
  hasFeeds,
  onManualRefreshAll,
  onMarkAllRead,
  syncStatusPrimary,
  syncStatusSecondary,
  filteredArticles,
  selectedArticleId,
  onSelectArticle,
  formatArticleDate,
  interfaceFontClass,
}) {
  const listScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const listScrollRafRef = useRef<number | null>(null)
  const [listViewportHeight, setListViewportHeight] = useState(0)
  const [listScrollTop, setListScrollTop] = useState(0)
  const hasSearchHighlight = Boolean(searchQuery.trim())

  const shouldVirtualize = filteredArticles.length > LIST_VIRTUALIZATION_THRESHOLD && listViewportHeight > 0
  const startIndex = shouldVirtualize
    ? Math.max(Math.floor(listScrollTop / LIST_ITEM_ESTIMATED_HEIGHT) - LIST_OVERSCAN_COUNT, 0)
    : 0
  const endIndex = shouldVirtualize
    ? Math.min(
      filteredArticles.length - 1,
      Math.ceil((listScrollTop + listViewportHeight) / LIST_ITEM_ESTIMATED_HEIGHT) + LIST_OVERSCAN_COUNT,
    )
    : filteredArticles.length - 1
  const visibleArticles = shouldVirtualize
    ? filteredArticles.slice(startIndex, endIndex + 1)
    : filteredArticles
  const virtualPaddingTop = shouldVirtualize ? startIndex * LIST_ITEM_ESTIMATED_HEIGHT : 0
  const virtualPaddingBottom = shouldVirtualize
    ? Math.max(0, (filteredArticles.length - endIndex - 1) * LIST_ITEM_ESTIMATED_HEIGHT)
    : 0
  const articleIndexById = useMemo(() => {
    const map = new Map<number, number>()
    filteredArticles.forEach((article, index) => {
      map.set(article.id, index)
    })
    return map
  }, [filteredArticles])

  const handleListScroll = useCallback((event) => {
    const target = event.currentTarget
    if (!target || listScrollRafRef.current != null) return
    listScrollRafRef.current = window.requestAnimationFrame(() => {
      listScrollRafRef.current = null
      setListScrollTop(target.scrollTop)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (listScrollRafRef.current != null) {
        window.cancelAnimationFrame(listScrollRafRef.current)
        listScrollRafRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const node = listScrollContainerRef.current
    if (!node) return
    const updateViewportHeight = () => {
      setListViewportHeight(node.clientHeight)
    }
    updateViewportHeight()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateViewportHeight)
      observer.observe(node)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateViewportHeight)
    return () => {
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [showList])

  useEffect(() => {
    if (!shouldVirtualize || selectedArticleId == null) return
    const targetIndex = articleIndexById.get(selectedArticleId)
    const node = listScrollContainerRef.current
    if (targetIndex == null || !node) return

    const itemTop = targetIndex * LIST_ITEM_ESTIMATED_HEIGHT
    const itemBottom = itemTop + LIST_ITEM_ESTIMATED_HEIGHT
    const viewportTop = node.scrollTop
    const viewportBottom = viewportTop + node.clientHeight

    if (itemTop < viewportTop) {
      node.scrollTop = itemTop
      return
    }
    if (itemBottom > viewportBottom) {
      node.scrollTop = itemBottom - node.clientHeight
    }
  }, [articleIndexById, selectedArticleId, shouldVirtualize])

  return (
    <div
      className={`fixed md:relative inset-y-0 left-0 flex-shrink-0 bg-white dark:bg-stone-950 border-r border-stone-200 dark:border-stone-800 flex flex-col z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-[width,opacity,transform] duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${showList ? 'w-full md:w-[380px] opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full md:-translate-x-10'}`}
    >
      <div className="h-16 border-b border-stone-100 dark:border-stone-800 flex items-center px-4 sticky top-0 bg-white/95 dark:bg-stone-950/95 backdrop-blur z-20 gap-3">
        <Interactive
          onClick={toggleListPanel}
          className="text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-2 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-md transition-all"
          title={showList ? t('toolbar.collapseArticleList') : t('toolbar.openArticleList')}
          aria-label={showList ? t('toolbar.collapseArticleList') : t('toolbar.openArticleList')}
        >
          <Layout size={18} />
        </Interactive>
        <div className="relative flex-1 group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-stone-600 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={event => onSearchQueryChange(event.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="w-full pl-9 pr-12 py-2 bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-md text-sm text-stone-700 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent-border)] transition-colors group-hover:bg-stone-100 dark:group-hover:bg-stone-800"
            aria-label={t('list.searchAria')}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <span
              className="inline-flex items-center gap-1 text-[10px] border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5 bg-white dark:bg-stone-800 text-stone-400"
              aria-hidden="true"
            >
              <Command size={10} />
              <span>K</span>
            </span>
          </div>
        </div>
      </div>

      <div
        ref={listScrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
        onScroll={handleListScroll}
      >
        <div className="border-b border-stone-100 dark:border-stone-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-600">{t('nav.today')}</h2>
            <div className="flex items-center gap-1.5">
              <Interactive
                className="text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onManualRefreshAll}
                aria-label={t('list.refreshNow')}
                disabled={!hasFeeds}
                title={t('list.refreshNow')}
              >
                {isSyncingFeeds ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </Interactive>
              <Interactive
                className="text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
                onClick={onMarkAllRead}
                aria-label={t('list.markAllRead')}
              >
                <CheckCircle size={14} />
              </Interactive>
            </div>
          </div>
          <div className="mt-2 min-w-0">
            <p className="truncate text-[11px] font-medium text-stone-500 dark:text-stone-400">{syncStatusPrimary}</p>
            {syncStatusSecondary && (
              <p className="truncate text-[10px] text-stone-400 dark:text-stone-500">{syncStatusSecondary}</p>
            )}
          </div>
        </div>

        <div style={shouldVirtualize ? { paddingTop: virtualPaddingTop, paddingBottom: virtualPaddingBottom } : undefined}>
          {visibleArticles.map((article, index) => {
            const itemIndex = shouldVirtualize ? startIndex + index : index
            return (
              <ArticleListItem
                key={article.id}
                article={article}
                isSelected={selectedArticleId === article.id}
                searchQuery={searchQuery}
                hasSearchHighlight={hasSearchHighlight}
                interfaceFontClass={interfaceFontClass}
                dateLabel={formatArticleDate(article)}
                animationDelayMs={shouldVirtualize ? 0 : Math.min(itemIndex, 10) * 40}
                disableEntryAnimation={shouldVirtualize}
                onSelectArticle={onSelectArticle}
              />
            )
          })}
        </div>

        {!filteredArticles.length && (
          <div className="px-6 py-12 text-center text-sm text-stone-400 dark:text-stone-500">
            {isSyncingFeeds ? t('list.syncingFeeds') : t('list.noArticles')}
          </div>
        )}
      </div>
    </div>
  )
})

const ArticleListItem = React.memo(function ArticleListItem({
  article,
  isSelected,
  searchQuery,
  hasSearchHighlight,
  interfaceFontClass,
  dateLabel,
  animationDelayMs,
  disableEntryAnimation,
  onSelectArticle,
}) {
  const handleSelect = useCallback(() => {
    onSelectArticle(article.id)
  }, [article.id, onSelectArticle])

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={`group cursor-pointer text-left px-5 py-4 border-b border-stone-50 dark:border-stone-900 hover:bg-stone-50/80 dark:hover:bg-stone-900/50 transition-all duration-200 relative ${disableEntryAnimation ? '' : 'animate-slide-in-right'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950 ${
        isSelected ? 'bg-[#f4f4f2] dark:bg-stone-900' : ''
      } article-list-item`}
      style={disableEntryAnimation ? undefined : { animationDelay: `${animationDelayMs}ms` }}
      aria-current={isSelected ? 'true' : undefined}
    >
      {isSelected && <div className="accent-bg absolute left-0 top-0 bottom-0 w-[3px] animate-scale-y"></div>}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {!article.isRead && <span className="accent-bg w-2 h-2 rounded-full shadow-sm animate-pulse-slow"></span>}
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-stone-600 dark:text-stone-300' : 'text-stone-400 dark:text-stone-600'}`}>
            {hasSearchHighlight ? <HighlightText text={article.feedName} highlight={searchQuery} /> : article.feedName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-400 dark:text-stone-600 font-mono tracking-tight">
          {article.isStarred && <Star size={12} className="text-orange-500 fill-orange-500" />}
          <span>{dateLabel}</span>
        </div>
      </div>

      <h3 className={`text-[15px] font-bold leading-snug mb-1.5 tracking-tight transition-colors duration-200 ${interfaceFontClass} ${
        isSelected
          ? 'text-black dark:text-white'
          : article.isRead
            ? 'text-stone-600 dark:text-stone-400'
            : 'text-stone-800 dark:text-stone-300'
      }`}>
        {hasSearchHighlight ? <HighlightText text={article.title} highlight={searchQuery} /> : article.title}
      </h3>

      <p className={`text-xs line-clamp-2 leading-relaxed transition-colors duration-200 ${interfaceFontClass} ${
        isSelected
          ? 'text-stone-600 dark:text-stone-400'
          : article.isRead
            ? 'text-stone-400 dark:text-stone-500'
            : 'text-stone-400 dark:text-stone-600'
      }`}>
        {hasSearchHighlight ? <HighlightText text={article.summary} highlight={searchQuery} /> : article.summary}
      </p>
    </button>
  )
}, (prev, next) => (
  prev.article === next.article
  && prev.isSelected === next.isSelected
  && prev.searchQuery === next.searchQuery
  && prev.hasSearchHighlight === next.hasSearchHighlight
  && prev.interfaceFontClass === next.interfaceFontClass
  && prev.dateLabel === next.dateLabel
  && prev.animationDelayMs === next.animationDelayMs
  && prev.disableEntryAnimation === next.disableEntryAnimation
  && prev.onSelectArticle === next.onSelectArticle
))

const ReaderArticleContent = React.memo(function ReaderArticleContent({
  t,
  isLoadingArticle,
  activeArticle,
  isFocusMode,
  titleFontClass,
  formatArticleDate,
  handleToggleRead,
  handleToggleStar,
  showOfflineMiss,
  isGeneratingSummary,
  activeAiSummary,
  summaryDisabledReason,
  handleDeepDive,
  activeAiError,
  translatedContentHtml,
  translationTargetLabel,
  translationOutputLabel,
  activeTranslationError,
  coverImageOverride,
  coverProxyUrl,
  setLightboxSrc,
  handleArticleContentClick,
  textSizeClass,
  proseTypographyFontClass,
  readerContentHtml,
}) {
  if (isLoadingArticle) {
    return <ArticleSkeleton />
  }

  if (!activeArticle) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-300 dark:text-stone-700">
        <BookOpen size={64} strokeWidth={0.5} className="mb-6 opacity-50" />
        <p className="font-serif italic text-xl text-stone-400 dark:text-stone-500">{t('overlay.selectStory')}</p>
      </div>
    )
  }

  return (
    <article className={`max-w-[720px] mx-auto px-8 py-16 pb-40 animate-slide-in-up transition-all duration-500 ${isFocusMode ? 'max-w-[800px]' : ''}`}>
      <header className="mb-10">
        <h1 className={`text-[2.75rem] font-bold text-stone-900 dark:text-stone-50 leading-[1.1] mb-6 tracking-tight ${titleFontClass}`}>
          {activeArticle.title}
        </h1>

        <div className="flex items-center justify-between border-t border-b border-stone-100 dark:border-stone-800 py-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-stone-900 dark:text-stone-200">{activeArticle.author}</span>
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-xs text-stone-400 dark:text-stone-500">{formatArticleDate(activeArticle)} - {activeArticle.feedName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Interactive
              className={`p-2 rounded-full transition-colors ${
                activeArticle.isRead
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-stone-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
              }`}
              onClick={handleToggleRead}
              title={activeArticle.isRead ? t('toolbar.markUnread') : t('toolbar.markRead')}
              aria-label={activeArticle.isRead ? t('toolbar.markUnread') : t('toolbar.markRead')}
              aria-pressed={activeArticle.isRead}
            >
              <CheckCircle size={20} className={activeArticle.isRead ? 'text-emerald-600 dark:text-emerald-400' : ''} />
            </Interactive>
            <Interactive
              className="text-stone-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors p-2 rounded-full hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={handleToggleStar}
              title={activeArticle.isStarred ? t('toolbar.removeFavorite') : t('toolbar.addFavorite')}
              aria-label={activeArticle.isStarred ? t('toolbar.removeFavorite') : t('toolbar.addFavorite')}
              aria-pressed={activeArticle.isStarred}
            >
              <Star size={20} className={activeArticle.isStarred ? 'fill-orange-500 text-orange-500' : ''} />
            </Interactive>
          </div>
        </div>
      </header>

      {showOfflineMiss && (
        <div className="mb-6 text-xs font-mono text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3">
          {t('overlay.offlineMiss')}
        </div>
      )}

      <QuantumAIPanel
        isGenerating={isGeneratingSummary}
        aiSummary={activeAiSummary}
        canRegenerate={!!activeAiSummary && !isGeneratingSummary && !summaryDisabledReason}
        onRegenerate={() => handleDeepDive({ force: true })}
      />

      {activeAiError ? (
        <div className="mb-8 rounded-lg border border-rose-200/70 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 dark:border-rose-800/70 dark:bg-rose-900/25 dark:text-rose-300">
          {activeAiError}
        </div>
      ) : null}

      {translatedContentHtml ? (
        <div className="mb-6 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300">
          {t('overlay.translatedBanner', { target: translationTargetLabel, output: translationOutputLabel })}
        </div>
      ) : null}

      {activeTranslationError ? (
        <div className="mb-8 rounded-lg border border-rose-200/70 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 dark:border-rose-800/70 dark:bg-rose-900/25 dark:text-rose-300">
          {activeTranslationError}
        </div>
      ) : null}

      {activeArticle.image && (
        <figure className="mb-12 group">
          <div className="overflow-hidden rounded-xl shadow-lg border border-stone-100 dark:border-stone-800/50">
            <RobustImage
              src={coverImageOverride || coverProxyUrl || activeArticle.image}
              alt="Cover"
              className="aspect-video"
              onClick={() => setLightboxSrc(coverImageOverride || coverProxyUrl || activeArticle.image)}
            />
          </div>
          <figcaption className="text-center text-xs text-stone-400 mt-3 font-mono">{t('overlay.photoCourtesy')}</figcaption>
        </figure>
      )}

      <div
        onClick={handleArticleContentClick}
        className={`prose prose-stone dark:prose-invert max-w-none ${textSizeClass}
        ${proseTypographyFontClass} prose-headings:font-bold prose-headings:text-stone-900 dark:prose-headings:text-stone-100
        prose-p:leading-[1.8] prose-p:text-stone-700 dark:prose-p:text-stone-300 prose-p:mb-6
        prose-a:text-[var(--color-accent)] prose-a:underline prose-a:decoration-1 prose-a:underline-offset-4 hover:prose-a:bg-[var(--color-accent-soft)] hover:prose-a:no-underline hover:prose-a:text-[var(--color-accent-strong)]
        prose-blockquote:border-l-[3px] prose-blockquote:border-[var(--color-accent)] prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-stone-600 dark:prose-blockquote:text-stone-400 prose-blockquote:bg-stone-50/50 dark:prose-blockquote:bg-stone-900/50 prose-blockquote:py-2 prose-blockquote:pr-4 prose-blockquote:rounded-r
        prose-img:rounded-xl prose-img:shadow-md
        prose-pre:bg-stone-100 dark:prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-stone-200 dark:prose-pre:border-stone-800 prose-pre:rounded-xl prose-pre:shadow-sm
        prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-stone-100 dark:prose-code:bg-stone-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
      `}
      >
        <div dangerouslySetInnerHTML={{ __html: readerContentHtml }} />
      </div>

      <div className="mt-32 flex flex-col items-center justify-center text-stone-300 dark:text-stone-700 space-y-4">
        <div className="flex items-center gap-4 w-full justify-center">
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-stone-200 dark:via-stone-800 to-transparent"></div>
          <div className="text-xl">*</div>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-stone-200 dark:via-stone-800 to-transparent"></div>
        </div>
        <span className="text-xs font-serif italic opacity-60">Finis</span>
      </div>
    </article>
  )
})

export const ReaderPane = React.memo(function ReaderPane({
  t,
  activeArticle,
  showList,
  openSidebar,
  toggleListPanel,
  isFocusMode,
  setIsFocusMode,
  handleDeepDive,
  summaryDisabledReason,
  isGeneratingSummary,
  summaryLanguageLabel,
  handleTranslate,
  translationDisabledReason,
  isTranslating,
  translationTargetLabel,
  translationOutputLabel,
  handleToggleAudio,
  isGeneratingAudio,
  isPlayingAudio,
  isPausedAudio,
  ttsProviderLabel,
  articleFontFamily,
  setArticleFontFamily,
  articleCustomFontStack,
  setArticleCustomFontStack,
  fontSize,
  setFontSize,
  handleCopyLink,
  handleOpenOriginal,
  isLoadingArticle,
  titleFontClass,
  formatArticleDate,
  handleToggleRead,
  handleToggleStar,
  showOfflineMiss,
  activeAiSummary,
  activeAiError,
  translatedContentHtml,
  activeTranslationError,
  coverImageOverride,
  coverProxyUrl,
  setLightboxSrc,
  handleArticleContentClick,
  textSizeClass,
  proseTypographyFontClass,
  readerContentHtml,
  ttsIncludeAuthor,
  setTtsIncludeAuthor,
  ttsIncludeSource,
  setTtsIncludeSource,
  ttsControllerRef,
  setIsPlayingAudio,
  setIsPausedAudio,
  setIsGeneratingAudio,
}) {
  const [showStickyTitle, setShowStickyTitle] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)
  const [showTypeSettings, setShowTypeSettings] = useState(false)
  const topProgressBarRef = useRef(null)
  const articleRef = useRef(null)
  const scrollRafRef = useRef(null)
  const stickyTitleRef = useRef(false)
  const readingProgressRef = useRef(0)
  const progressCommitTimeRef = useRef(0)
  const backToTopVisibleRef = useRef(false)

  const handleScroll = useCallback((event) => {
    const target = event.currentTarget
    if (!target) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      const { scrollTop, scrollHeight, clientHeight } = target
      const denominator = Math.max(scrollHeight - clientHeight, 1)
      const progress = Math.max(0, Math.min(100, (scrollTop / denominator) * 100))
      if (topProgressBarRef.current) {
        topProgressBarRef.current.style.transform = `scaleX(${progress / 100})`
      }
      const roundedProgress = Math.round(progress * 10) / 10
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const shouldShowBackToTop = roundedProgress > 5

      if (backToTopVisibleRef.current !== shouldShowBackToTop) {
        backToTopVisibleRef.current = shouldShowBackToTop
        setShowBackToTop(shouldShowBackToTop)
      }

      if (shouldShowBackToTop) {
        const progressDelta = Math.abs(roundedProgress - readingProgressRef.current)
        const elapsed = now - progressCommitTimeRef.current
        if (progressDelta >= 2 || elapsed >= 120 || roundedProgress >= 99.9 || progressCommitTimeRef.current === 0) {
          readingProgressRef.current = roundedProgress
          progressCommitTimeRef.current = now
          setReadingProgress(roundedProgress)
        }
      } else if (readingProgressRef.current !== 0) {
        readingProgressRef.current = 0
        progressCommitTimeRef.current = now
        setReadingProgress(0)
      }

      const shouldShowStickyTitle = scrollTop > 150
      if (stickyTitleRef.current !== shouldShowStickyTitle) {
        stickyTitleRef.current = shouldShowStickyTitle
        setShowStickyTitle(shouldShowStickyTitle)
      }
    })
  }, [])

  const handleScrollToTop = useCallback(() => {
    articleRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    readingProgressRef.current = 0
    progressCommitTimeRef.current = 0
    backToTopVisibleRef.current = false
    stickyTitleRef.current = false
    setReadingProgress(0)
    setShowBackToTop(false)
    setShowStickyTitle(false)
    if (topProgressBarRef.current) {
      topProgressBarRef.current.style.transform = 'scaleX(0)'
    }
    if (articleRef.current) {
      articleRef.current.scrollTop = 0
    }
  }, [activeArticle?.id])

  useEffect(() => {
    if (!showTypeSettings) return
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowTypeSettings(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [showTypeSettings])

  return (
    <main className="flex-1 bg-white dark:bg-stone-950 h-full overflow-hidden flex flex-col relative min-w-0 transition-colors duration-500">
      <div className="h-[2px] w-full bg-stone-100 dark:bg-stone-900 absolute top-0 left-0 z-50">
        <div
          ref={topProgressBarRef}
          className="accent-bg accent-progress-glow h-full w-full origin-left scale-x-0 transition-transform duration-75 ease-out"
        ></div>
      </div>

      <div className={`h-16 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between px-4 md:px-8 sticky top-0 z-40 transition-all duration-500 ${
        showStickyTitle
          ? 'bg-white/80 dark:bg-stone-950/80 backdrop-blur-md shadow-sm'
          : 'bg-white/95 dark:bg-stone-950/95 backdrop-blur-sm'
      }`}>
        <div className="flex items-center text-stone-500 text-xs gap-3 font-medium overflow-hidden">
          <div className="flex items-center gap-2">
            <Interactive
              onClick={openSidebar}
              className="p-2 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 md:hidden"
              aria-label={t('toolbar.openLibraryPanel')}
            >
              <Layout size={16} />
            </Interactive>
            {!showList && (
              <Interactive
                onClick={toggleListPanel}
                className="p-2 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                aria-label={t('toolbar.openArticleList')}
                title={t('toolbar.openArticleList')}
              >
                <AlignLeft size={16} />
              </Interactive>
            )}
          </div>
          {showStickyTitle ? (
            <span className="font-bold text-stone-800 dark:text-stone-200 text-sm truncate animate-slide-up-fade">
              {activeArticle?.title}
            </span>
          ) : (
            <>
              <div className="flex items-center gap-2 px-2 py-1 bg-stone-100 dark:bg-stone-900 rounded text-stone-600 dark:text-stone-400 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-600"></span>
                {activeArticle?.feedName}
              </div>
              <span className="text-stone-300 dark:text-stone-700">|</span>
              <span className="font-mono text-stone-400 dark:text-stone-500">{t('toolbar.readSuffix', { value: activeArticle?.readTime || '' })}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Interactive
            onClick={() => { setIsFocusMode(!isFocusMode) }}
            className={`p-2 rounded-full transition-colors ${isFocusMode ? 'accent-text accent-bg-soft' : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'}`}
            title={t('toolbar.focusMode')}
            aria-label={t('toolbar.toggleFocusMode')}
            aria-pressed={isFocusMode}
          >
            {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </Interactive>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-2"></div>

          <div className="flex items-center gap-1">
            <Interactive
              onClick={handleDeepDive}
              disabled={Boolean(summaryDisabledReason)}
              className={`p-2 rounded-md transition-all disabled:opacity-50 ${
                isGeneratingSummary
                  ? 'accent-text accent-bg-soft'
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-300 dark:hover:bg-stone-800'
              }`}
              title={summaryDisabledReason || t('toolbar.analyzeWithAi', { language: summaryLanguageLabel })}
              aria-label={t('toolbar.generateSummary')}
              aria-disabled={Boolean(summaryDisabledReason)}
            >
              {isGeneratingSummary ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={18} />}
            </Interactive>
            <Interactive
              onClick={handleTranslate}
              disabled={Boolean(translationDisabledReason)}
              className={`p-2 rounded-md transition-all disabled:opacity-50 ${
                isTranslating
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/20'
              }`}
              title={translationDisabledReason || t('toolbar.translateTo', { target: translationTargetLabel, output: translationOutputLabel })}
              aria-label={t('toolbar.translateArticle')}
              aria-disabled={Boolean(translationDisabledReason)}
            >
              {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={18} />}
            </Interactive>
            <Interactive
              onClick={handleToggleAudio}
              disabled={isGeneratingAudio || !activeArticle || !isTtsSupported()}
              className={`p-2 rounded-md transition-all disabled:opacity-50 ${
                isPlayingAudio || isPausedAudio
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'text-stone-400 hover:text-green-600 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20'
              }`}
              title={t('toolbar.textToSpeech', { provider: ttsProviderLabel })}
              aria-label={t('toolbar.toggleSpeech')}
              aria-pressed={isPlayingAudio || isPausedAudio}
              aria-disabled={isGeneratingAudio || !activeArticle || !isTtsSupported()}
            >
              {isGeneratingAudio ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isPlayingAudio ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </Interactive>
          </div>

          <div className="relative">
            <Interactive
              onClick={() => setShowTypeSettings(!showTypeSettings)}
              className={`p-2 rounded-md transition-all ${showTypeSettings ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'}`}
              aria-label={t('toolbar.typography')}
              aria-expanded={showTypeSettings}
              aria-controls="type-settings-panel"
            >
              <Type size={18} />
            </Interactive>

            {showTypeSettings && (
              <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl p-4 z-50 animate-spring-in origin-top-right" id="type-settings-panel">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">{t('toolbar.articleFont')}</div>
                    <div className="flex gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-lg">
                      <button onClick={() => setArticleFontFamily('sans')} className={`flex-1 py-1.5 text-xs rounded-md transition-all duration-300 ${articleFontFamily === 'sans' ? 'bg-white dark:bg-stone-700 shadow text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`}>{t('toolbar.fontSans')}</button>
                      <button onClick={() => setArticleFontFamily('serif')} className={`flex-1 py-1.5 text-xs rounded-md font-serif transition-all duration-300 ${articleFontFamily === 'serif' ? 'bg-white dark:bg-stone-700 shadow text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`}>{t('toolbar.fontSerif')}</button>
                      <button onClick={() => setArticleFontFamily('custom')} className={`flex-1 py-1.5 text-xs rounded-md transition-all duration-300 ${articleFontFamily === 'custom' ? 'bg-white dark:bg-stone-700 shadow text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`}>{t('toolbar.fontCustom')}</button>
                    </div>
                    {articleFontFamily === 'custom' ? (
                      <input
                        type="text"
                        value={articleCustomFontStack}
                        onChange={(event) => setArticleCustomFontStack(event.target.value)}
                        placeholder='"Source Han Serif SC", serif'
                        className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-700 outline-none focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent-border)] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      />
                    ) : null}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">{t('toolbar.scale')}</div>
                    <div className="flex gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-lg">
                      {['small', 'medium', 'large'].map((s) => (
                        <button key={s} onClick={() => setFontSize(s)} className={`flex-1 py-1.5 text-xs rounded-md transition-all duration-300 ${fontSize === s ? 'bg-white dark:bg-stone-700 shadow text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`}>A{s === 'large' ? '+' : s === 'small' ? '-' : ''}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-stone-200 dark:bg-stone-800 mx-2"></span>
          <Interactive onClick={handleCopyLink} title={t('toolbar.copyLink')} className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300" aria-label={t('toolbar.copyArticleLink')}><Share2 size={18}/></Interactive>
          <Interactive
            onClick={handleOpenOriginal}
            disabled={!activeArticle?.link}
            title={t('toolbar.openOriginal')}
            className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('toolbar.openOriginalAria')}
          >
            <ExternalLink size={18}/>
          </Interactive>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-smooth" onScroll={handleScroll} ref={articleRef}>
        <ReaderArticleContent
          t={t}
          isLoadingArticle={isLoadingArticle}
          activeArticle={activeArticle}
          isFocusMode={isFocusMode}
          titleFontClass={titleFontClass}
          formatArticleDate={formatArticleDate}
          handleToggleRead={handleToggleRead}
          handleToggleStar={handleToggleStar}
          showOfflineMiss={showOfflineMiss}
          isGeneratingSummary={isGeneratingSummary}
          activeAiSummary={activeAiSummary}
          summaryDisabledReason={summaryDisabledReason}
          handleDeepDive={handleDeepDive}
          activeAiError={activeAiError}
          translatedContentHtml={translatedContentHtml}
          translationTargetLabel={translationTargetLabel}
          translationOutputLabel={translationOutputLabel}
          activeTranslationError={activeTranslationError}
          coverImageOverride={coverImageOverride}
          coverProxyUrl={coverProxyUrl}
          setLightboxSrc={setLightboxSrc}
          handleArticleContentClick={handleArticleContentClick}
          textSizeClass={textSizeClass}
          proseTypographyFontClass={proseTypographyFontClass}
          readerContentHtml={readerContentHtml}
        />
      </div>

      {showBackToTop && (
        <button
          onClick={handleScrollToTop}
          className="absolute bottom-8 right-8 z-50 flex items-center gap-2 rounded-full border border-stone-200/80 bg-white/90 px-3 py-2 text-xs font-mono text-stone-700 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-white dark:border-white/10 dark:bg-stone-800/80 dark:text-white dark:hover:bg-stone-700 animate-fade-in group"
        >
          <div className="relative w-5 h-5 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path className="text-stone-300 dark:text-white/20" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
              <path className="accent-text" strokeDasharray={`${readingProgress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
            </svg>
            <ArrowUp size={10} className="absolute text-stone-700 dark:text-white" />
          </div>
          <span className="hidden group-hover:inline-block pr-1">{t('overlay.top')}</span>
        </button>
      )}

      {(isPlayingAudio || isPausedAudio) && (
        <div className="absolute bottom-8 left-1/2 z-50 flex w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-4 rounded-2xl border border-white/10 bg-stone-900/90 px-5 py-4 text-white shadow-2xl backdrop-blur-xl transition-transform duration-300 hover:scale-[1.01] dark:border-stone-700 dark:bg-stone-800/90 animate-spring-up">
          <AudioWaveform isPlaying={isPlayingAudio} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold leading-5 text-stone-100 break-words">{activeArticle?.title}</span>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-stone-300">
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-stone-200">
                {ttsProviderLabel}
              </span>
              <Interactive
                onClick={() => setTtsIncludeAuthor(prev => !prev)}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  ttsIncludeAuthor
                    ? 'border-green-500/40 bg-green-500/10 text-green-200'
                    : 'border-white/10 text-stone-400 hover:text-stone-300'
                }`}
                aria-label={t('toolbar.toggleAuthorSpeech')}
                aria-pressed={ttsIncludeAuthor}
              >
                {t('toolbar.author')} {ttsIncludeAuthor ? t('toolbar.on') : t('toolbar.off')}
              </Interactive>
              <Interactive
                onClick={() => setTtsIncludeSource(prev => !prev)}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  ttsIncludeSource
                    ? 'border-green-500/40 bg-green-500/10 text-green-200'
                    : 'border-white/10 text-stone-400 hover:text-stone-300'
                }`}
                aria-label={t('toolbar.toggleSourceSpeech')}
                aria-pressed={ttsIncludeSource}
              >
                {t('toolbar.source')} {ttsIncludeSource ? t('toolbar.on') : t('toolbar.off')}
              </Interactive>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch border-l border-white/10 pl-3">
            <Interactive onClick={handleToggleAudio} className="rounded-md p-1 transition-colors hover:bg-white/5 hover:text-green-400" aria-label={t('toolbar.playOrPauseSpeech')}>
              {isPlayingAudio ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </Interactive>
            <Interactive
              onClick={() => {
                if (ttsControllerRef.current) ttsControllerRef.current.stop()
                setIsPlayingAudio(false)
                setIsPausedAudio(false)
                setIsGeneratingAudio(false)
              }}
              className="rounded-md p-1 transition-colors hover:bg-white/5 hover:text-stone-300"
              aria-label={t('toolbar.stopSpeech')}
            >
              <X size={14} />
            </Interactive>
          </div>
        </div>
      )}
    </main>
  )
})
