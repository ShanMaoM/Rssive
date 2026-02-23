// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Command,
  ImageOff,
  Loader2,
  Maximize2,
  MessageSquare,
  Rss,
  Search,
  Sparkles,
} from 'lucide-react'
import { useI18nRead } from '../i18n/context'

const EMPTY_COMMANDS: any[] = [];

const AUDIO_WAVEFORM_BARS = [
  { id: 'bar-1', delay: 0.05, duration: 0.65 },
  { id: 'bar-2', delay: 0.14, duration: 0.72 },
  { id: 'bar-3', delay: 0.22, duration: 0.58 },
  { id: 'bar-4', delay: 0.31, duration: 0.8 },
  { id: 'bar-5', delay: 0.4, duration: 0.69 },
];

export const HighlightText = ({ text, highlight }) => {
  if (!highlight || !highlight.trim()) return <span>{text}</span>;
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);
  let cursor = 0;
  let isMatch = false;
  return (
    <span>
      {parts.map((part) => {
        const currentIsMatch = isMatch;
        const key = `${cursor}-${part}-${currentIsMatch ? 'm' : 't'}`;
        cursor += part.length;
        isMatch = !isMatch;
        return currentIsMatch ? (
          <span key={key} className="bg-yellow-200 dark:bg-yellow-500/30 text-stone-900 dark:text-yellow-200 rounded-[2px] px-0.5 shadow-sm">{part}</span>
        ) : (
          part
        );
      })}
    </span>
  );
};

export const Interactive = ({ children, className, onClick, ...props }) => {
  const ariaLabel = props['aria-label'] ?? props.title;
  return (
    <button
      onClick={onClick}
      className={`active:scale-95 transition-transform duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950 ${className}`}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  );
};

// --- Custom Components ---

// Compact AI summary panel (brief summary only)
export const QuantumAIPanel = ({ isGenerating, aiSummary, onRegenerate, canRegenerate }) => {
  const { t } = useI18nRead();
  if (!isGenerating && !aiSummary) return null;

  return (
    <div className="mb-10 animate-slide-in-up">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className={`accent-bg-soft accent-text rounded-md p-1.5 ${isGenerating ? 'animate-pulse-slow' : ''}`}>
              <Sparkles size={14} />
            </div>
            <div className="flex flex-col">
              <span className="accent-text text-[11px] font-semibold uppercase tracking-[0.12em]">{t('ai.panel.title')}</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">{t('ai.panel.subtitle')}</span>
            </div>
          </div>
          {isGenerating ? (
            <div className="accent-text flex items-center gap-1.5 text-[11px]">
              <Loader2 size={12} className="animate-spin" />
              <span>{t('ai.panel.processing')}</span>
            </div>
          ) : aiSummary && canRegenerate ? (
            <button
              onClick={onRegenerate}
              className="accent-text rounded-md border border-[color:var(--color-accent-border)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-[color:var(--color-accent-soft)]"
            >
              {t('ai.panel.regenerate')}
            </button>
          ) : null}
        </div>

        <div className="px-4 py-3">
          {isGenerating ? (
            <div className="space-y-2.5">
              <div className="animate-shimmer h-3 w-full rounded bg-stone-200/60 bg-[length:200%_100%] dark:bg-white/10"></div>
              <div className="animate-shimmer h-3 w-5/6 rounded bg-stone-200/60 bg-[length:200%_100%] delay-75 dark:bg-white/10"></div>
            </div>
          ) : aiSummary ? (
            <p className="text-[15px] leading-7 text-stone-700 dark:text-stone-300">
              {aiSummary.summary}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const TranslationPanel = ({
  isTranslating,
  translation,
  error,
  onRegenerate,
  canRegenerate,
  targetLabel,
  outputStyleLabel,
}) => {
  const { t } = useI18nRead();
  if (!isTranslating && !translation && !error) return null;

  const formatStyle = (style) => {
    if (!style) return '';
    if (style === 'full') return t('translation.output.full');
    if (style === 'brief') return t('translation.output.brief');
    if (style === 'bullet') return t('translation.output.bullet');
    return style;
  };

  const sourceText = translation?.sourceLanguage ? translation.sourceLanguage.toUpperCase() : t('translation.output.auto');
  const targetText = translation?.targetLanguage
    ? translation.targetLanguage.toUpperCase()
    : (targetLabel || t('translation.output.target'));
  const outputText = translation?.outputStyle
    ? formatStyle(translation.outputStyle)
    : (outputStyleLabel || t('translation.output.full'));

  return (
    <div className="mb-12 relative group/panel animate-zoom-in origin-top perspective-1000">
      <div className="absolute -inset-[2px] bg-gradient-to-r from-emerald-500/20 via-sky-500/20 to-indigo-500/20 blur-lg animate-pulse-slow rounded-2xl"></div>
      <div className="relative rounded-xl overflow-hidden border border-white/20 dark:border-white/10 shadow-2xl bg-white/80 dark:bg-black/60 backdrop-blur-xl">
        <div className="absolute inset-0 opacity-10 dark:opacity-20 mix-blend-overlay pointer-events-none">
          <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] animate-aurora bg-[conic-gradient(from_0deg_at_50%_50%,#10b981,#0ea5e9,#6366f1,#10b981)] filter blur-[70px]"></div>
        </div>

        {isTranslating && (
          <div className="absolute inset-0 z-10 pointer-events-none">
            <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-scan"></div>
          </div>
        )}

        <div className="relative z-20 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gradient-to-tr from-emerald-500 to-sky-500 shadow-lg ${isTranslating ? 'animate-bounce-slight' : ''}`}>
                <MessageSquare size={16} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">{t('translation.panel.title')}</span>
                <span className="text-[10px] text-stone-400 font-mono">{sourceText} → {targetText} · {outputText}</span>
              </div>
            </div>
            {isTranslating ? (
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-500">
                <Loader2 size={12} className="animate-spin" />
                <span>{t('translation.panel.translating')}</span>
              </div>
            ) : translation && canRegenerate ? (
              <button
                onClick={onRegenerate}
                className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-200/70 dark:border-emerald-400/30 hover:bg-emerald-50/80 dark:hover:bg-emerald-900/30 transition-colors"
              >
                {t('translation.panel.regenerate')}
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-900/30 border border-rose-200/60 dark:border-rose-800/60 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : isTranslating ? (
            <div className="space-y-4">
              <div className="h-4 bg-stone-200/50 dark:bg-white/5 rounded w-full animate-shimmer bg-[length:200%_100%]"></div>
              <div className="h-4 bg-stone-200/50 dark:bg-white/5 rounded w-5/6 animate-shimmer bg-[length:200%_100%] delay-75"></div>
              <div className="h-4 bg-stone-200/50 dark:bg-white/5 rounded w-4/6 animate-shimmer bg-[length:200%_100%] delay-150"></div>
            </div>
          ) : translation ? (
            <div className="space-y-4 animate-fade-in">
              {translation.outputStyle === 'bullet' && translation.bullets?.length ? (
                <ul className="list-disc list-inside text-sm text-stone-700 dark:text-stone-200 space-y-2">
                  {(() => {
                    let bulletCursor = 0;
                    return translation.bullets.map((item) => {
                      const key = `${bulletCursor}-${item}`;
                      bulletCursor += item.length + 1;
                      return <li key={key}>{item}</li>;
                    });
                  })()}
                </ul>
              ) : (
                <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-200 whitespace-pre-line">
                  {translation.text}
                </p>
              )}
              <div className="text-[10px] font-mono text-stone-400 dark:text-stone-500">
                {t('translation.model')}: {translation.model}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const AudioWaveform = ({ isPlaying }) => {
  return (
    <div className="flex items-center gap-[3px] h-4">
      {AUDIO_WAVEFORM_BARS.map((bar) => (
        <div
          key={bar.id}
          className={`w-[3px] bg-green-500 rounded-full transition-all duration-300 ease-in-out ${isPlaying ? 'animate-music-bar' : 'h-1'}`}
          style={{
            animationDelay: `${bar.delay}s`,
            animationDuration: `${bar.duration}s`,
            height: isPlaying ? '100%' : '20%'
          }}
        ></div>
      ))}
    </div>
  );
};

export const Lightbox = ({ src, alt, onClose }) => {
  const { t } = useI18nRead();
  if (!src) return null;
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <div
      className="fixed inset-0 z-[100] bg-white/95 dark:bg-black/95 backdrop-blur-2xl flex items-center justify-center animate-fade-in cursor-zoom-out"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.aria')}
      tabIndex={0}
    >
      <div className="relative max-w-[95vw] max-h-[95vh] perspective-1000">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[95vh] rounded-lg shadow-2xl animate-zoom-in-spring object-contain ring-1 ring-white/10"
        />
        <div className="absolute -bottom-12 left-0 right-0 text-center text-stone-500 dark:text-stone-400 text-xs font-mono animate-fade-in delay-200 flex justify-center items-center gap-2">
          <Maximize2 size={12} /> {t('lightbox.highResolution')}
        </div>
      </div>
    </div>
  );
};

export const ArticleSkeleton = () => (
  <div className="max-w-[720px] mx-auto px-8 py-16">
    <div className="h-16 bg-stone-200 dark:bg-stone-800 rounded-xl w-3/4 mb-10 animate-shimmer bg-[length:200%_100%]"></div>
    <div className="flex items-center gap-4 mb-12 border-y border-stone-100 dark:border-stone-800 py-6">
      <div className="w-12 h-12 rounded-full bg-stone-200 dark:bg-stone-800 animate-pulse"></div>
      <div className="flex-1 space-y-3">
        <div className="h-3 bg-stone-200 dark:bg-stone-800 rounded w-1/4 animate-pulse"></div>
        <div className="h-2 bg-stone-200 dark:bg-stone-800 rounded w-1/3 animate-pulse"></div>
      </div>
    </div>
    <div className="space-y-6">
      <div className="h-4 bg-stone-200 dark:bg-stone-800 rounded w-full animate-shimmer bg-[length:200%_100%] delay-75"></div>
      <div className="h-4 bg-stone-200 dark:bg-stone-800 rounded w-full animate-shimmer bg-[length:200%_100%] delay-100"></div>
      <div className="h-4 bg-stone-200 dark:bg-stone-800 rounded w-5/6 animate-shimmer bg-[length:200%_100%] delay-150"></div>
      <div className="h-4 bg-stone-200 dark:bg-stone-800 rounded w-full animate-shimmer bg-[length:200%_100%] delay-200"></div>
    </div>
  </div>
);

export const RobustImage = ({ src, alt, className, onClick }) => {
  const { t } = useI18nRead();
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const handleKeyDown = (event) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  };

  if (error || !src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-stone-100 dark:bg-stone-800/50 text-stone-400 dark:text-stone-500 rounded-xl border border-stone-200 dark:border-stone-700 border-dashed ${className} min-h-[240px]`}>
        <ImageOff size={24} className="mb-2 opacity-50" />
        <span className="text-xs font-mono">{t('image.unavailable')}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-stone-100 dark:bg-stone-800 ${className} ${onClick ? 'cursor-zoom-in group' : ''}`}
      {...(onClick ? {
        onClick,
        onKeyDown: handleKeyDown,
        role: 'button',
        tabIndex: 0,
        'aria-label': t('image.openPreview', { alt: alt || '' }),
      } : {})}
    >
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-all duration-700 ease-out ${loaded ? 'opacity-100 scale-100 group-hover:scale-105' : 'opacity-0 scale-110'}`}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-stone-300" />
        </div>
      )}
      {onClick && (
        <div className="absolute top-2 right-2 p-2 bg-black/50 backdrop-blur rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Maximize2 size={14} />
        </div>
      )}
    </div>
  );
};

export const ToastContainer = ({ toasts, isDesktopShell = false }) => {
  const { t } = useI18nRead();
  const containerPositionClass = isDesktopShell ? 'bottom-8 right-8 z-[170]' : 'bottom-8 right-8 z-[100]';
  return (
    <div className={`fixed ${containerPositionClass} flex flex-col gap-2 pointer-events-none`} role="status" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto origin-bottom-right flex w-[min(360px,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border border-stone-200 px-3.5 py-2.5 text-stone-800 shadow-[0_12px_28px_rgba(0,0,0,0.14)] bg-white dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 ${
            toast.leaving ? 'animate-toast-shrink-out' : 'animate-toast-rise-in'
          }`}
        >
          <div className={`mt-0.5 h-10 w-0.5 flex-shrink-0 rounded-full ${
            toast.type === 'success' ? 'bg-gradient-to-b from-green-400 to-green-600' :
            toast.type === 'info' ? 'bg-gradient-to-b from-indigo-400 to-indigo-600' : 'bg-gradient-to-b from-orange-400 to-orange-600'
          }`}></div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">
              {toast.type === 'success' ? t('toast.success') : toast.type === 'info' ? t('toast.note') : t('toast.alert')}
            </div>
            <div className="text-[13px] leading-[1.45] text-stone-700 dark:text-stone-300">
              {toast.message}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const CommandPalette = ({
  isOpen,
  onClose,
  articles,
  onSelect,
  onCommand,
  commands = EMPTY_COMMANDS,
  mode = 'palette',
}) => {
  const { t } = useI18nRead();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    setQuery('');
    setSelectedIndex(0);
  }, [isOpen]);

  const filteredArticles = useMemo(() => {
    if (!query) return articles.slice(0, 5);
    return articles.filter(a =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.feedName.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  }, [query, articles]);

  const filteredCommands = useMemo(() => {
    if (mode !== 'palette') return [];
    if (!query) return commands.slice(0, 4);
    return commands.filter(command =>
      command.label.toLowerCase().includes(query.toLowerCase()) ||
      (command.description || '').toLowerCase().includes(query.toLowerCase())
    ).slice(0, 4);
  }, [commands, mode, query]);

  const items = useMemo(() => {
    const commandItems = filteredCommands.map(command => ({
      type: 'command',
      id: command.id,
      label: command.label,
      description: command.description,
      icon: command.icon,
      disabled: command.disabled,
    }));
    const articleItems = filteredArticles.map(article => ({
      type: 'article',
      id: article.id,
      label: article.title,
      description: article.feedName,
      article,
    }));
    return [...commandItems, ...articleItems];
  }, [filteredCommands, filteredArticles]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (items.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = items[selectedIndex];
        if (!selected) return;
        if (selected.type === 'command') {
          if (!selected.disabled && onCommand) {
            onCommand(selected.id);
            onClose();
          }
          return;
        }
        if (selected.type === 'article') {
          onSelect(selected.id);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, selectedIndex, onSelect, onClose, onCommand]);

  if (!isOpen) return null;

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-stone-900/20 dark:bg-black/80 backdrop-blur-[4px] flex items-start justify-center pt-[15vh] animate-fade-in"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette.aria')}
      tabIndex={-1}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-zoom-in origin-top transform transition-all ring-1 ring-black/5"
        role="document"
      >
        <div className="flex items-center px-4 py-4 border-b border-stone-100 dark:border-stone-800">
          <Search size={20} className="text-stone-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === 'jump' ? t('commandPalette.jumpPlaceholder') : t('commandPalette.searchPlaceholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            className="flex-1 bg-transparent border-none outline-none text-lg text-stone-800 dark:text-stone-100 placeholder:text-stone-400"
            aria-label={mode === 'jump' ? t('commandPalette.jumpSearchAria') : t('commandPalette.searchAria')}
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
              {mode === 'jump' ? t('commandPalette.quickJump') : t('commandPalette.command')}
            </span>
            <kbd className="text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700">ESC</kbd>
          </div>
        </div>
        <div className="p-2 space-y-1" ref={listRef}>
          {items.length > 0 ? (
            items.map((item, i) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  if (item.type === 'command') {
                    if (!item.disabled && onCommand) onCommand(item.id);
                    onClose();
                    return;
                  }
                  onSelect(item.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                disabled={item.type === 'command' && item.disabled}
                aria-selected={i === selectedIndex}
                aria-disabled={item.type === 'command' && item.disabled}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between group transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950 ${
                  i === selectedIndex ? 'bg-stone-100 dark:bg-stone-800 shadow-sm scale-[1.01]' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50 text-stone-500'
                } ${item.type === 'command' && item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex flex-col overflow-hidden gap-0.5">
                  <span className={`text-sm font-medium truncate ${i === selectedIndex ? 'text-stone-900 dark:text-stone-50' : 'text-stone-700 dark:text-stone-400'}`}>
                    <HighlightText text={item.label} highlight={query} />
                  </span>
                  <span className="text-xs text-stone-400 dark:text-stone-500 flex items-center gap-1">
                    {item.type === 'command' ? (item.icon || <Command size={10} />) : <Rss size={10} />}
                    {item.description}
                  </span>
                </div>
                {i === selectedIndex && <CornerDownLeftIcon className="text-stone-400 w-4 h-4 animate-pulse" />}
              </button>
            ))
          ) : (
            <div className="py-12 text-center text-stone-400 text-sm flex flex-col items-center">
               <Search size={32} className="mb-3 opacity-20" />
               <span>{t('commandPalette.noResults', { query })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CornerDownLeftIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
);



