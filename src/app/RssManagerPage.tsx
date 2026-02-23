import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Download,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { removeEntriesByFeedIds } from '../modules/articles/storage';
import {
  DEFAULT_FEED_CATEGORY_ID,
  addFeedCategory,
  loadFeedCategories,
  removeFeedCategory,
  updateFeedCategory,
  type FeedCategoryRecord,
} from '../modules/feeds/categories';
import {
  addFeed,
  loadFeeds,
  removeFeed,
  reorderFeeds,
  replaceFeeds,
  updateFeed,
} from '../modules/feeds/storage';
import { FeedIconBadge } from '../modules/feeds/FeedIconBadge';
import {
  fetchAutoFeedIcon,
  getFeedIconFallback,
  isFeedDataImage,
  normalizeFeedIconSource,
} from '../modules/feeds/icon';
import type { FeedIconSource, FeedRecord } from '../modules/feeds/types';
import { useI18nRead } from '../modules/i18n/context';

type ManageCategoryId = FeedRecord['categoryId'];
type ManagerNoticeType = 'success' | 'warning' | 'info';

type ManagerNotice = {
  type: ManagerNoticeType;
  message: string;
} | null;

type FeedFormState = {
  title: string;
  url: string;
  categoryId: ManageCategoryId;
  customIconUrl: string;
  customIconDataUrl: string;
};

const deriveSiteUrl = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

const buildDefaultFormState = (defaultCategoryId: ManageCategoryId): FeedFormState => ({
  title: '',
  url: '',
  categoryId: defaultCategoryId,
  customIconUrl: '',
  customIconDataUrl: '',
});

const toDraftFromFeed = (feed: FeedRecord, fallbackCategoryId: ManageCategoryId): FeedFormState => ({
  ...((): Pick<FeedFormState, 'customIconDataUrl' | 'customIconUrl'> => {
    const source = normalizeFeedIconSource(feed.iconSource, feed.icon);
    const icon = typeof feed.icon === 'string' ? feed.icon.trim() : '';
    if (source !== 'custom' || !icon) {
      return { customIconUrl: '', customIconDataUrl: '' };
    }
    if (isFeedDataImage(icon)) {
      return { customIconUrl: '', customIconDataUrl: icon };
    }
    return { customIconUrl: icon, customIconDataUrl: '' };
  })(),
  title: feed.title || '',
  url: feed.url || '',
  categoryId: feed.categoryId || fallbackCategoryId,
});

const isValidCategoryId = (categories: FeedCategoryRecord[], value: string): value is ManageCategoryId =>
  categories.some(option => option.id === value);

const selectClass =
  'w-full appearance-none rounded-xl border border-stone-200/90 bg-stone-50/80 px-3 py-2.5 pr-10 text-sm text-stone-700 shadow-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-indigo-500';

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('failed to read file'));
  reader.readAsDataURL(file);
});

const resolveCustomIconValue = (form: FeedFormState) => {
  const uploaded = form.customIconDataUrl.trim();
  if (uploaded) return uploaded;
  const typed = form.customIconUrl.trim();
  return typed || '';
};

const buildIconPayload = (title: string, form: FeedFormState): { icon: string; iconSource: FeedIconSource } => {
  const customIcon = resolveCustomIconValue(form);
  if (customIcon) {
    return { iconSource: 'custom', icon: customIcon };
  }
  return { iconSource: 'auto', icon: getFeedIconFallback(title) };
};

type CategorySelectProps = {
  value: ManageCategoryId;
  options: FeedCategoryRecord[];
  onChange: (value: ManageCategoryId) => void;
  className?: string;
  placeholder: string;
};

const CategorySelect = ({ value, options, onChange, className, placeholder }: CategorySelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find(option => option.id === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`${className || selectClass} flex items-center justify-between text-left`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{selected?.name || placeholder}</span>
        <ChevronDown
          size={14}
          className={`ml-2 shrink-0 text-stone-400 transition-transform dark:text-stone-500 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-stone-200/90 bg-white/95 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
          <ul role="listbox" className="max-h-56 overflow-y-auto custom-scrollbar">
            {options.map((option, index) => {
              const isSelected = option.id === selected?.id;
              const isFirst = index === 0;
              const isLast = index === options.length - 1;
              return (
                <li
                  key={option.id}
                  className={`${isFirst ? 'rounded-t-[11px]' : ''} ${
                    isLast ? 'rounded-b-[11px]' : ''
                  } overflow-hidden ${isLast ? '' : 'border-b border-stone-100/80 dark:border-stone-800/80'}`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/18 text-indigo-700 dark:bg-indigo-500/35 dark:text-indigo-100'
                        : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800/90'
                    }`}
                  >
                    <span className="truncate">{option.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

type FeedDisplayRowProps = {
  feed: FeedRecord;
  isSelected: boolean;
  isDragging: boolean;
  categoryName: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onToggleSelect: (feedId: number) => void;
  onDragStart: (feedId: number) => void;
  onDragEnd: () => void;
  onDropOnFeed: (targetFeedId: number) => void;
  onRestoreAutoIcon: (feed: FeedRecord) => void;
  onStartEditFeed: (feed: FeedRecord) => void;
  onDeleteFeed: (feed: FeedRecord) => void;
};

const FeedDisplayRow = React.memo(function FeedDisplayRow({
  feed,
  isSelected,
  isDragging,
  categoryName,
  t,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  onDropOnFeed,
  onRestoreAutoIcon,
  onStartEditFeed,
  onDeleteFeed,
}: FeedDisplayRowProps) {
  const iconSource = useMemo(
    () => normalizeFeedIconSource(feed.iconSource, feed.icon),
    [feed.iconSource, feed.icon],
  );
  const rowClass = isDragging
    ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-900/20'
    : 'border-stone-200/80 bg-white/90 dark:border-stone-700 dark:bg-stone-900/80';
  const handleToggle = useCallback(() => onToggleSelect(feed.id), [feed.id, onToggleSelect]);
  const handleDragStart = useCallback(() => onDragStart(feed.id), [feed.id, onDragStart]);
  const handleDrop = useCallback(() => onDropOnFeed(feed.id), [feed.id, onDropOnFeed]);
  const handleRestore = useCallback(() => onRestoreAutoIcon(feed), [feed, onRestoreAutoIcon]);
  const handleEdit = useCallback(() => onStartEditFeed(feed), [feed, onStartEditFeed]);
  const handleDelete = useCallback(() => onDeleteFeed(feed), [feed, onDeleteFeed]);

  return (
    <li
      onDragOver={event => event.preventDefault()}
      onDrop={handleDrop}
      className={`rounded-xl border px-3 py-3 transition ${rowClass}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleToggle}
          className="mt-1 h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500/50 dark:border-stone-600 dark:bg-stone-900"
          aria-label={t('rssManager.selectFeedAria', { name: feed.title })}
        />
        <button
          type="button"
          draggable
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
          className="mt-0.5 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          aria-label={t('rssManager.reorderFeedAria', { name: feed.title })}
          title={t('rssManager.dragReorder')}
        >
          <GripVertical size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FeedIconBadge
              title={feed.title}
              icon={feed.icon}
              alt={feed.title}
              imageClassName="h-6 w-6 rounded-md border border-stone-200 object-cover dark:border-stone-700"
              textClassName="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-100 text-[11px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
            />
            <div className="min-w-0 text-sm font-semibold text-stone-900 dark:text-stone-100">
              <span className="block truncate">{feed.title}</span>
            </div>
          </div>
          <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{feed.url}</div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
            {t('rssManager.categoryPrefix', { name: categoryName })}
          </div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
            {t('rssManager.iconSourcePrefix', {
              source: iconSource === 'custom'
                ? t('rssManager.iconSourceCustom')
                : t('rssManager.iconSourceAuto'),
            })}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRestore}
            className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            title={t('rssManager.restoreAutoIcon')}
            aria-label={t('rssManager.restoreAutoIcon')}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            title={t('rssManager.editFeedAria', { name: feed.title })}
            aria-label={t('rssManager.editFeedAria', { name: feed.title })}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md p-1.5 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
            title={t('rssManager.deleteFeedAria', { name: feed.title })}
            aria-label={t('rssManager.deleteFeedAria', { name: feed.title })}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  );
}, (prev, next) => (
  prev.feed === next.feed
  && prev.isSelected === next.isSelected
  && prev.isDragging === next.isDragging
  && prev.categoryName === next.categoryName
  && prev.t === next.t
  && prev.onToggleSelect === next.onToggleSelect
  && prev.onDragStart === next.onDragStart
  && prev.onDragEnd === next.onDragEnd
  && prev.onDropOnFeed === next.onDropOnFeed
  && prev.onRestoreAutoIcon === next.onRestoreAutoIcon
  && prev.onStartEditFeed === next.onStartEditFeed
  && prev.onDeleteFeed === next.onDeleteFeed
));

type RssManagerPageProps = {
  onFeedsChange?: (options?: { reloadEntries?: boolean }) => void;
  onRequestClose?: () => void;
  isOpen?: boolean;
};

export function RssManagerPage({ onFeedsChange, onRequestClose, isOpen = true }: RssManagerPageProps) {
  const { t } = useI18nRead();
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createIconInputRef = useRef<HTMLInputElement | null>(null);
  const editIconInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<FeedCategoryRecord[]>(() => loadFeedCategories());
  const [feeds, setFeeds] = useState<FeedRecord[]>(() => loadFeeds());
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);
  const [notice, setNotice] = useState<ManagerNotice>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<ManageCategoryId | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const defaultCategoryId = categories[0]?.id || DEFAULT_FEED_CATEGORY_ID;
  const [createForm, setCreateForm] = useState<FeedFormState>(() => buildDefaultFormState(defaultCategoryId));
  const [editingFeedId, setEditingFeedId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FeedFormState>(() => buildDefaultFormState(defaultCategoryId));
  const [draggingFeedId, setDraggingFeedId] = useState<number | null>(null);
  const [hasPendingFeedChanges, setHasPendingFeedChanges] = useState(false);
  const pendingSyncOptionsRef = useRef<{ reloadEntries: boolean }>({ reloadEntries: false });

  const selectedCount = selectedFeedIds.length;

  const selectedSet = useMemo(() => new Set(selectedFeedIds), [selectedFeedIds]);
  const categoryUsageMap = useMemo(() => {
    const map = new Map<ManageCategoryId, number>();
    feeds.forEach(feed => {
      map.set(feed.categoryId, (map.get(feed.categoryId) || 0) + 1);
    });
    return map;
  }, [feeds]);
  const categoryNameById = useMemo(() => {
    const map = new Map<ManageCategoryId, string>();
    categories.forEach(category => {
      map.set(category.id, category.name);
    });
    return map;
  }, [categories]);
  const closeManager = useCallback(() => {
    if (hasPendingFeedChanges) {
      onFeedsChange?.(pendingSyncOptionsRef.current);
    }
    setHasPendingFeedChanges(false);
    pendingSyncOptionsRef.current = { reloadEntries: false };
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, [hasPendingFeedChanges, onFeedsChange, onRequestClose]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frameId);
    }
    setIsVisible(false);
    const timeoutId = window.setTimeout(() => setShouldRender(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const reloadedCategories = loadFeedCategories();
    const reloadedFeeds = loadFeeds();
    const fallbackCategoryId = reloadedCategories[0]?.id || DEFAULT_FEED_CATEGORY_ID;
    startTransition(() => {
      setCategories(reloadedCategories);
      setFeeds(reloadedFeeds);
      setSelectedFeedIds([]);
      setNotice(null);
      setNewCategoryName('');
      setEditingCategoryId(null);
      setEditingCategoryName('');
      setCreateForm(buildDefaultFormState(fallbackCategoryId));
      setEditingFeedId(null);
      setEditForm(buildDefaultFormState(fallbackCategoryId));
      setDraggingFeedId(null);
      setHasPendingFeedChanges(false);
    });
    pendingSyncOptionsRef.current = { reloadEntries: false };
  }, [isOpen]);

  useEffect(() => {
    if (!categories.length) {
      const reloaded = loadFeedCategories();
      setCategories(reloaded);
      return;
    }
    setCreateForm(prev => (
      isValidCategoryId(categories, prev.categoryId)
        ? prev
        : { ...prev, categoryId: categories[0].id }
    ));
    setEditForm(prev => (
      isValidCategoryId(categories, prev.categoryId)
        ? prev
        : { ...prev, categoryId: categories[0].id }
    ));
  }, [categories]);

  const setInfo = useCallback((message: string, type: ManagerNoticeType = 'info') => {
    setNotice({ type, message });
  }, []);
  const notifyFeedsChanged = useCallback((options: { reloadEntries?: boolean } = {}) => {
    pendingSyncOptionsRef.current = {
      reloadEntries: pendingSyncOptionsRef.current.reloadEntries || Boolean(options.reloadEntries),
    };
    setHasPendingFeedChanges(true);
  }, []);

  const refreshAutoIcon = useCallback(async (feedId: number) => {
    const latest = loadFeeds().find(item => item.id === feedId);
    if (!latest) return;
    if (normalizeFeedIconSource(latest.iconSource, latest.icon) !== 'auto') return;

    const icon = await fetchAutoFeedIcon({
      title: latest.title,
      url: latest.url,
      siteUrl: latest.siteUrl || '',
    });
    const nextFeeds = updateFeed(feedId, { icon, iconSource: 'auto' });
    setFeeds(nextFeeds);
    notifyFeedsChanged();
  }, [notifyFeedsChanged]);

  const handleCreateIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setInfo(t('rssManager.notice.iconUploadImageOnly'), 'warning');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCreateForm(prev => ({ ...prev, customIconDataUrl: dataUrl, customIconUrl: '' }));
      setInfo(t('rssManager.notice.customIconReady'), 'info');
    } catch {
      setInfo(t('rssManager.notice.iconUploadFailed'), 'warning');
    } finally {
      event.target.value = '';
    }
  };

  const handleEditIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setInfo(t('rssManager.notice.iconUploadImageOnly'), 'warning');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setEditForm(prev => ({ ...prev, customIconDataUrl: dataUrl, customIconUrl: '' }));
      setInfo(t('rssManager.notice.customIconReady'), 'info');
    } catch {
      setInfo(t('rssManager.notice.iconUploadFailed'), 'warning');
    } finally {
      event.target.value = '';
    }
  };

  const validateFeedInput = (title: string, url: string) => {
    if (!title.trim() || !url.trim()) {
      setInfo(t('rssManager.notice.feedNameUrlRequired'), 'warning');
      return false;
    }
    try {
      new URL(url.trim());
    } catch {
      setInfo(t('rssManager.notice.enterValidUrl'), 'warning');
      return false;
    }
    return true;
  };

  const validateCustomIconUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.startsWith('data:image/')) return true;
    if (trimmed.length <= 2) return true; // keep legacy single-glyph custom icons editable
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleCreateFeed = () => {
    const title = createForm.title.trim();
    const url = createForm.url.trim();
    if (!validateFeedInput(title, url)) return;
    if (!validateCustomIconUrl(createForm.customIconUrl)) {
      setInfo(t('rssManager.notice.iconUrlInvalid'), 'warning');
      return;
    }
    const fallbackCategory = categories[0]?.id || defaultCategoryId;
    const iconPayload = buildIconPayload(title, createForm);

    const record = addFeed({
      title,
      url,
      siteUrl: deriveSiteUrl(url),
      categoryId: isValidCategoryId(categories, createForm.categoryId) ? createForm.categoryId : fallbackCategory,
      icon: iconPayload.icon,
      iconSource: iconPayload.iconSource,
    });
    setFeeds(loadFeeds());
    notifyFeedsChanged();
    setCreateForm(buildDefaultFormState(fallbackCategory));
    setInfo(t('rssManager.notice.addedFeed', { title: record.title }), 'success');
    if (iconPayload.iconSource === 'auto') {
      void refreshAutoIcon(record.id);
    }
  };

  const startEditFeed = useCallback((feed: FeedRecord) => {
    setEditingFeedId(feed.id);
    setEditForm(toDraftFromFeed(feed, categories[0]?.id || defaultCategoryId));
  }, [categories, defaultCategoryId]);

  const handleSaveEdit = () => {
    if (editingFeedId == null) return;
    const title = editForm.title.trim();
    const url = editForm.url.trim();
    if (!validateFeedInput(title, url)) return;
    if (!validateCustomIconUrl(editForm.customIconUrl)) {
      setInfo(t('rssManager.notice.iconUrlInvalid'), 'warning');
      return;
    }
    const fallbackCategory = categories[0]?.id || defaultCategoryId;
    const iconPayload = buildIconPayload(title, editForm);

    const nextFeeds = updateFeed(editingFeedId, {
      title,
      url,
      siteUrl: deriveSiteUrl(url),
      categoryId: isValidCategoryId(categories, editForm.categoryId) ? editForm.categoryId : fallbackCategory,
      icon: iconPayload.icon,
      iconSource: iconPayload.iconSource,
    });
    setFeeds(nextFeeds);
    notifyFeedsChanged();
    setEditingFeedId(null);
    setInfo(t('rssManager.notice.updatedFeed', { title }), 'success');
    if (iconPayload.iconSource === 'auto') {
      void refreshAutoIcon(editingFeedId);
    }
  };

  const handleRestoreAutoIcon = useCallback((feed: FeedRecord) => {
    const fallback = getFeedIconFallback(feed.title);
    const nextFeeds = updateFeed(feed.id, {
      iconSource: 'auto',
      icon: fallback,
    });
    setFeeds(nextFeeds);
    notifyFeedsChanged();
    setInfo(t('rssManager.notice.autoIconRestored', { title: feed.title }), 'info');
    void refreshAutoIcon(feed.id);
  }, [notifyFeedsChanged, refreshAutoIcon, setInfo, t]);

  const handleDeleteFeed = useCallback((feed: FeedRecord) => {
    const next = removeFeed(feed.id);
    removeEntriesByFeedIds([feed.id]);
    setFeeds(next);
    notifyFeedsChanged({ reloadEntries: true });
    setSelectedFeedIds(prev => prev.filter(id => id !== feed.id));
    if (editingFeedId === feed.id) {
      setEditingFeedId(null);
    }
    setInfo(t('rssManager.notice.deletedFeed', { title: feed.title }), 'info');
  }, [editingFeedId, notifyFeedsChanged, setInfo, t]);

  const handleDeleteSelected = () => {
    if (!selectedFeedIds.length) {
      setInfo(t('rssManager.notice.selectAtLeastOne'), 'warning');
      return;
    }
    const keep = feeds.filter(feed => !selectedSet.has(feed.id));
    replaceFeeds(keep);
    removeEntriesByFeedIds(selectedFeedIds);
    setFeeds(keep);
    notifyFeedsChanged({ reloadEntries: true });
    setSelectedFeedIds([]);
    setEditingFeedId(null);
    setInfo(t('rssManager.notice.deletedSelected', { count: selectedCount }), 'success');
  };

  const handleToggleSelect = useCallback((feedId: number) => {
    setSelectedFeedIds(prev => (
      prev.includes(feedId) ? prev.filter(id => id !== feedId) : [...prev, feedId]
    ));
  }, []);

  const handleSelectAll = () => {
    if (selectedFeedIds.length === feeds.length) {
      setSelectedFeedIds([]);
      return;
    }
    setSelectedFeedIds(feeds.map(feed => feed.id));
  };

  const handleExportFeeds = () => {
    const payload = feeds.map(feed => ({
      title: feed.title,
      url: feed.url,
      siteUrl: feed.siteUrl || '',
      categoryId: feed.categoryId,
      icon: feed.icon || '',
      iconSource: normalizeFeedIconSource(feed.iconSource, feed.icon),
    }));
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `rssive-feeds-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    setInfo(t('rssManager.notice.exported', { count: payload.length }), 'success');
  };

  const applyImportedFeeds = (raw: unknown) => {
    if (!Array.isArray(raw)) {
      setInfo(t('rssManager.notice.importArrayRequired'), 'warning');
      return;
    }

    const existingFeeds = loadFeeds();
    const byUrl = new Map(existingFeeds.map(feed => [feed.url.trim().toLowerCase(), feed]));
    const nextFeeds = [...existingFeeds];
    const byIdIndex = new Map(nextFeeds.map((feed, index) => [feed.id, index]));
    let nextId = nextFeeds.length ? Math.max(...nextFeeds.map(feed => feed.id)) + 1 : 1;
    let added = 0;
    let updated = 0;
    let skipped = 0;

    raw.forEach(item => {
      if (!item || typeof item !== 'object') {
        skipped += 1;
        return;
      }
      const source = item as Record<string, unknown>;
      const title = String(source.title || source.name || '').trim();
      const url = String(source.url || source.feedUrl || '').trim();
      if (!title || !url) {
        skipped += 1;
        return;
      }
      try {
        new URL(url);
      } catch {
        skipped += 1;
        return;
      }
      const fallbackCategory = categories[0]?.id || defaultCategoryId;
      const categoryCandidate = String(source.categoryId || source.category || fallbackCategory);
      const categoryId = isValidCategoryId(categories, categoryCandidate) ? categoryCandidate : fallbackCategory;
      const importedIcon = String(source.icon || '').trim();
      const importedIconSource = normalizeFeedIconSource(
        String(source.iconSource || ''),
        importedIcon
      );
      const iconSource: FeedIconSource = importedIcon ? importedIconSource : 'auto';
      const icon = importedIcon || getFeedIconFallback(title);
      const key = url.toLowerCase();
      const existing = byUrl.get(key);
      if (existing) {
        const patch = {
          ...existing,
          title,
          url,
          siteUrl: deriveSiteUrl(url),
          categoryId,
          icon,
          iconSource,
          updatedAt: new Date().toISOString(),
        };
        const index = byIdIndex.get(existing.id);
        if (index != null) {
          nextFeeds[index] = patch;
          byUrl.set(key, patch);
          updated += 1;
        } else {
          skipped += 1;
        }
        return;
      }

      const createdAt = new Date().toISOString();
      const created: FeedRecord = {
        id: nextId,
        title,
        url,
        siteUrl: deriveSiteUrl(url),
        categoryId,
        icon,
        iconSource,
        createdAt,
        updatedAt: createdAt,
        etag: null,
        lastModified: null,
        lastStatus: null,
        lastFetchedAt: null,
        syncError: null,
        retryCount: 0,
        nextPollAt: null,
      };
      nextId += 1;
      byIdIndex.set(created.id, nextFeeds.length);
      nextFeeds.push(created);
      byUrl.set(key, created);
      added += 1;
    });

    if (!added && !updated) {
      setInfo(t('rssManager.notice.noFeedsImported', { count: skipped }), 'warning');
      return;
    }

    const saved = replaceFeeds(nextFeeds);
    setFeeds(saved);
    notifyFeedsChanged();
    setInfo(t('rssManager.notice.importComplete', { added, updated, skipped }), 'success');
    saved.forEach(feed => {
      if (normalizeFeedIconSource(feed.iconSource, feed.icon) === 'auto') {
        void refreshAutoIcon(feed.id);
      }
    });
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyImportedFeeds(parsed);
    } catch {
      setInfo(t('rssManager.notice.importReadFailed'), 'warning');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      setInfo(t('rssManager.notice.categoryNameRequired'), 'warning');
      return;
    }
    try {
      const created = addFeedCategory(name);
      const nextCategories = loadFeedCategories();
      setCategories(nextCategories);
      setNewCategoryName('');
      setCreateForm(prev => ({ ...prev, categoryId: created.id }));
      notifyFeedsChanged();
      setInfo(t('rssManager.notice.categoryAdded', { name: created.name }), 'success');
    } catch (error) {
      setInfo(error instanceof Error ? error.message : t('rssManager.notice.addCategoryFailed'), 'warning');
    }
  };

  const startEditCategory = (category: FeedCategoryRecord) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const handleSaveCategory = () => {
    if (!editingCategoryId) return;
    try {
      const updatedCategories = updateFeedCategory(editingCategoryId, editingCategoryName);
      setCategories(updatedCategories);
      setEditingCategoryId(null);
      setEditingCategoryName('');
      notifyFeedsChanged();
      setInfo(t('rssManager.notice.categoryUpdated'), 'success');
    } catch (error) {
      setInfo(error instanceof Error ? error.message : t('rssManager.notice.updateCategoryFailed'), 'warning');
    }
  };

  const handleDeleteCategory = (categoryId: ManageCategoryId) => {
    if (categories.length <= 1) {
      setInfo(t('rssManager.notice.keepOneCategory'), 'warning');
      return;
    }
    const fallbackCategory = categories.find(category => category.id !== categoryId)?.id;
    if (!fallbackCategory) {
      setInfo(t('rssManager.notice.noFallbackCategory'), 'warning');
      return;
    }

    const now = new Date().toISOString();
    const reassignedFeeds = feeds.map(feed => (
      feed.categoryId === categoryId
        ? { ...feed, categoryId: fallbackCategory, updatedAt: now }
        : feed
    ));
    const savedFeeds = replaceFeeds(reassignedFeeds);
    removeFeedCategory(categoryId);
    const nextCategories = loadFeedCategories();

    setFeeds(savedFeeds);
    setCategories(nextCategories);
    setSelectedFeedIds(prev => prev.filter(id => savedFeeds.some(feed => feed.id === id)));
    if (editingCategoryId === categoryId) {
      setEditingCategoryId(null);
      setEditingCategoryName('');
    }
    if (editingFeedId != null) {
      const editingFeed = savedFeeds.find(feed => feed.id === editingFeedId);
      if (editingFeed) {
        setEditForm(toDraftFromFeed(editingFeed, nextCategories[0]?.id || fallbackCategory));
      }
    }
    notifyFeedsChanged();
    setInfo(t('rssManager.notice.categoryDeleted'), 'info');
  };

  const handleDragStart = useCallback((feedId: number) => {
    setDraggingFeedId(feedId);
  }, []);

  const handleDropOnFeed = useCallback((targetFeedId: number) => {
    if (draggingFeedId == null || draggingFeedId === targetFeedId) return;
    const orderedIds = feeds.map(feed => feed.id).filter(id => id !== draggingFeedId);
    const targetIndex = orderedIds.indexOf(targetFeedId);
    if (targetIndex < 0) return;
    orderedIds.splice(targetIndex, 0, draggingFeedId);
    const next = reorderFeeds(orderedIds);
    setFeeds(next);
    notifyFeedsChanged();
    setDraggingFeedId(null);
    setInfo(t('rssManager.notice.feedOrderUpdated'), 'info');
  }, [draggingFeedId, feeds, notifyFeedsChanged, setInfo, t]);
  const handleDragEnd = useCallback(() => {
    setDraggingFeedId(null);
  }, []);

  const noticeClassName = notice
    ? notice.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200'
      : notice.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-700/60 dark:bg-indigo-900/20 dark:text-indigo-200'
    : '';

  if (!shouldRender || typeof document === 'undefined') return null;

  const content = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-180 ${
        isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={{ zIndex: 2147483647 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('rssManager.dialogLabel')}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" aria-hidden="true" />
      <div className={`relative flex h-[min(820px,92vh)] w-[min(1040px,94vw)] flex-col overflow-hidden rounded-[26px] border border-stone-200/90 bg-[#fbfbf9] shadow-[0_35px_90px_rgba(0,0,0,0.22)] transition-transform duration-180 dark:border-stone-800 dark:bg-stone-950 ${
        isVisible ? 'translate-y-0 scale-100' : 'translate-y-1 scale-[0.995]'
      }`}>
        <header className="shrink-0 border-b border-stone-200/80 bg-white/85 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 dark:border-stone-800 dark:bg-stone-900/80">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
                {t('rssManager.kicker')}
              </div>
              <div className="text-lg font-serif font-semibold tracking-tight">{t('rssManager.title')}</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Upload size={14} />
                {t('rssManager.batchImport')}
              </button>
              <button
                type="button"
                onClick={handleExportFeeds}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Download size={14} />
                {t('rssManager.batchExport')}
              </button>
              <button
                type="button"
                onClick={closeManager}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-500 transition-colors hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                aria-label={t('rssManager.closeAria')}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 py-5 sm:px-6 lg:px-8">

        {notice ? (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${noticeClassName}`}>
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="space-y-5">
            <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/70">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
                {t('rssManager.addFeed')}
              </div>
              <div className="space-y-3">
                <input
                  value={createForm.title}
                  onChange={event => setCreateForm(prev => ({ ...prev, title: event.target.value }))}
                  placeholder={t('rssManager.feedNamePlaceholder')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-indigo-500"
                />
                <input
                  value={createForm.url}
                  onChange={event => setCreateForm(prev => ({ ...prev, url: event.target.value }))}
                  placeholder={t('rssManager.feedUrlPlaceholder')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-indigo-500"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <CategorySelect
                    value={createForm.categoryId}
                    options={categories}
                    onChange={(next) => setCreateForm(prev => ({ ...prev, categoryId: next }))}
                    placeholder={t('rssManager.selectCategory')}
                  />
                  <div className="space-y-2">
                    <input
                      value={createForm.customIconUrl}
                      onChange={event =>
                        setCreateForm(prev => ({ ...prev, customIconUrl: event.target.value, customIconDataUrl: '' }))
                      }
                      placeholder={t('rssManager.customIconUrlPlaceholder')}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        ref={createIconInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCreateIconUpload}
                      />
                      <button
                        type="button"
                        onClick={() => createIconInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        <Upload size={12} />
                        {t('rssManager.uploadCustomIcon')}
                      </button>
                      {(createForm.customIconUrl || createForm.customIconDataUrl) ? (
                        <button
                          type="button"
                          onClick={() => setCreateForm(prev => ({ ...prev, customIconUrl: '', customIconDataUrl: '' }))}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                          <X size={12} />
                          {t('rssManager.clearCustomIcon')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateFeed}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
                >
                  <Plus size={14} />
                  {t('rssManager.addSubscription')}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/70">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
                {t('rssManager.manageCategories')}
              </div>
              <div className="space-y-2">
                {categories.map(category => {
                  const isEditingCategory = editingCategoryId === category.id;
                  return (
                    <div
                      key={category.id}
                      className="rounded-lg border border-stone-200/80 bg-stone-50/80 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/70"
                    >
                      {isEditingCategory ? (
                        <div className="space-y-2">
                          <input
                            value={editingCategoryName}
                            onChange={(event) => setEditingCategoryName(event.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSaveCategory}
                              className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
                            >
                              {t('common.save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(null);
                                setEditingCategoryName('');
                              }}
                              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                              {category.name}
                            </div>
                            <div className="text-[11px] text-stone-500 dark:text-stone-400">
                              {t('rssManager.feedCount', { count: categoryUsageMap.get(category.id) || 0 })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditCategory(category)}
                              className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                              title={t('rssManager.editCategoryAria', { name: category.name })}
                              aria-label={t('rssManager.editCategoryAria', { name: category.name })}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category.id)}
                              className="rounded-md p-1.5 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
                              title={t('rssManager.deleteCategoryAria', { name: category.name })}
                              aria-label={t('rssManager.deleteCategoryAria', { name: category.name })}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder={t('rssManager.newCategoryPlaceholder')}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Plus size={12} />
                  {t('common.add')}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/70">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
                {t('rssManager.bulkActions')}
              </div>
              <div className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
                <div>{t('rssManager.totalFeeds', { count: feeds.length })}</div>
                <div>{t('rssManager.selectedFeeds', { count: selectedCount })}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {selectedFeedIds.length === feeds.length ? t('rssManager.clearSelect') : t('rssManager.selectAll')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:bg-rose-900/30"
                >
                  <Trash2 size={12} />
                  {t('rssManager.deleteSelected')}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/70">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
              {t('rssManager.subscriptions')}
            </div>
            <ul className="space-y-2">
              {feeds.map(feed => {
                const isEditing = editingFeedId === feed.id;
                const isSelected = selectedSet.has(feed.id);
                if (!isEditing) {
                  return (
                    <FeedDisplayRow
                      key={feed.id}
                      feed={feed}
                      isSelected={isSelected}
                      isDragging={draggingFeedId === feed.id}
                      categoryName={categoryNameById.get(feed.categoryId) || feed.categoryId}
                      t={t}
                      onToggleSelect={handleToggleSelect}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDropOnFeed={handleDropOnFeed}
                      onRestoreAutoIcon={handleRestoreAutoIcon}
                      onStartEditFeed={startEditFeed}
                      onDeleteFeed={handleDeleteFeed}
                    />
                  );
                }
                const rowClass = draggingFeedId === feed.id
                  ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-900/20'
                  : 'border-stone-200/80 bg-white/90 dark:border-stone-700 dark:bg-stone-900/80';
                return (
                  <li
                    key={feed.id}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => handleDropOnFeed(feed.id)}
                    className={`rounded-xl border px-3 py-3 transition ${rowClass}`}
                  >
                    <div className="space-y-3">
                        <input
                          value={editForm.title}
                          onChange={event => setEditForm(prev => ({ ...prev, title: event.target.value }))}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-950/80 dark:text-stone-200 dark:focus:border-indigo-500"
                        />
                        <input
                          value={editForm.url}
                          onChange={event => setEditForm(prev => ({ ...prev, url: event.target.value }))}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-950/80 dark:text-stone-200 dark:focus:border-indigo-500"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <CategorySelect
                            value={editForm.categoryId}
                            options={categories}
                            onChange={(next) => setEditForm(prev => ({ ...prev, categoryId: next }))}
                            placeholder={t('rssManager.selectCategory')}
                          />
                          <div className="space-y-2">
                            <input
                              value={editForm.customIconUrl}
                              onChange={event =>
                                setEditForm(prev => ({ ...prev, customIconUrl: event.target.value, customIconDataUrl: '' }))
                              }
                              placeholder={t('rssManager.customIconUrlPlaceholder')}
                              className="w-full rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-950/80 dark:text-stone-200 dark:focus:border-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                ref={editIconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleEditIconUpload}
                              />
                              <button
                                type="button"
                                onClick={() => editIconInputRef.current?.click()}
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                              >
                                <Upload size={12} />
                                {t('rssManager.uploadCustomIcon')}
                              </button>
                              {(editForm.customIconUrl || editForm.customIconDataUrl) ? (
                                <button
                                  type="button"
                                  onClick={() => setEditForm(prev => ({ ...prev, customIconUrl: '', customIconDataUrl: '' }))}
                                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                                >
                                  <X size={12} />
                                  {t('rssManager.clearCustomIcon')}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
                          >
                            {t('common.save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFeedId(null)}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                          >
                            <X size={12} />
                            {t('common.cancel')}
                          </button>
                        </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          </div>
        </div>
      </div>
    </div>
    </div>
  );

  return createPortal(content, document.body);
}
