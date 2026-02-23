import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BrainCircuit,
  ChevronDown,
  Feather,
  Mic,
  Monitor,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
  Type,
  X,
} from 'lucide-react';
import {
  applyArticleFontPreference,
  applyThemeColorPreference,
  applyThemePreference,
  applyUiFontPreference,
  INTERFACE_LANGUAGE_OPTIONS,
  getArticleFontCustomPreference,
  getArticleFontPreference,
  getAiEnabledPreference,
  getTtsAppIdPreference,
  getAiApiBasePreference,
  getAiApiKeyPreference,
  getAiModelPreference,
  getSummaryLanguagePreference,
  getAiSummaryPreference,
  getAiTranslationPreference,
  getFontSizePreference,
  getThemePreference,
  getThemeColorPreference,
  getInterfaceLanguagePreference,
  getUiFontCustomPreference,
  getUiFontPreference,
  getTranslationOutputPreference,
  getTranslationTargetPreference,
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
  setArticleFontPreference,
  setArticleFontCustomPreference,
  setTtsAppIdPreference,
  setAiEnabledPreference,
  setAiApiBasePreference,
  setAiApiKeyPreference,
  setAiModelPreference,
  setSummaryLanguagePreference,
  setAiSummaryPreference,
  setAiTranslationPreference,
  setFontSizePreference,
  getRssRefreshIntervalPreference,
  setThemePreference,
  setThemeColorPreference,
  setInterfaceLanguagePreference,
  setRssRefreshIntervalPreference,
  setTranslationOutputPreference,
  setTranslationTargetPreference,
  setUiFontCustomPreference,
  setUiFontPreference,
  setTtsApiBasePreference,
  setTtsApiKeyPreference,
  setTtsApiSecretPreference,
  setTtsAudioFormatPreference,
  setTtsIncludeAuthorPreference,
  setTtsIncludeSourcePreference,
  setTtsModelPreference,
  setTtsProjectIdPreference,
  setTtsProviderPreference,
  setTtsRegionPreference,
  setTtsVoicePreference,
  RSS_REFRESH_INTERVAL_OPTIONS,
  DEVELOPER_LOG_LEVEL_OPTIONS,
  SUMMARY_LANGUAGE_OPTIONS,
  THEME_COLOR_OPTIONS,
  TTS_AUDIO_FORMAT_OPTIONS,
  TTS_PROVIDER_OPTIONS,
  TRANSLATION_OUTPUT_OPTIONS,
  TRANSLATION_TARGET_OPTIONS,
  type ArticleFontPreference,
  type FontSizePreference,
  type InterfaceLanguagePreference,
  type RssRefreshIntervalPreference,
  type DeveloperLogLevelPreference,
  type ThemePreference,
  type ThemeColorPreference,
  type TtsAudioFormatPreference,
  type TtsProviderPreference,
  type UiFontPreference,
  type SummaryLanguagePreference,
  type TranslationOutputPreference,
  type TranslationTargetPreference,
  getDeveloperLogEnabledPreference,
  getDeveloperLogLevelPreference,
  setDeveloperLogEnabledPreference,
  setDeveloperLogLevelPreference,
} from '../shared/state/preferences';
import { getTtsProviderCapability, probeQwenTtsConnection } from '../modules/tts';
import { isAiTaskError, probeAiConnection } from '../modules/ai';
import { useI18nActions, useI18nRead } from '../modules/i18n/context';
import {
  createDeveloperLogExport,
  DEVELOPER_LOG_RETENTION_LIMIT,
  downloadDeveloperLogExport,
  writeDeveloperLog,
} from '../shared/services/logger';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

const Switch = React.memo(function Switch({ checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border p-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent-border)] ${
        checked
          ? 'border-stone-900 bg-stone-900 dark:border-stone-100 dark:bg-stone-100'
          : 'border-stone-300 bg-stone-200 dark:border-stone-700 dark:bg-stone-800'
      } ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow transition duration-200 ease-out ${
          checked
            ? 'translate-x-5 bg-white dark:bg-stone-900'
            : 'translate-x-0 bg-white dark:bg-stone-200'
        }`}
      />
    </button>
  );
});

type SettingRowProps = {
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  description?: string;
  children: ReactNode;
  isLast?: boolean;
};

const SettingRow = React.memo(function SettingRow({
  icon: Icon,
  label,
  description,
  children,
  isLast = false,
}: SettingRowProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-4 ${
        isLast ? '' : 'border-b border-stone-200/80 dark:border-stone-800'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
            <Icon size={15} />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{label}</div>
          {description ? (
            <div className="mt-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
});

type SettingCardProps = {
  kicker: string;
  title: string;
  description?: string;
  children: ReactNode;
};

const SettingCard = React.memo(function SettingCard({ kicker, title, description, children }: SettingCardProps) {
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white/90 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
      <header className="border-b border-stone-200/80 px-5 py-4 dark:border-stone-800">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
          {kicker}
        </div>
        <div className="mt-1 text-lg font-serif font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
        ) : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
});

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[color:var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[color:var(--color-accent-border)] dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-[color:var(--color-accent)]';

const selectClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-[color:var(--color-accent)] focus:bg-white focus:ring-2 focus:ring-[color:var(--color-accent-border)] dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-200 dark:focus:border-[color:var(--color-accent)]';

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

type DropdownSelectProps<T extends string> = {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

const DropdownSelectInner = <T extends string,>({
  value,
  options,
  onChange,
  className,
}: DropdownSelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find(option => option.value === value) || options[0];

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
        <span className="truncate">{selected?.label || ''}</span>
        <ChevronDown
          size={14}
          className={`ml-2 shrink-0 text-stone-400 transition-transform dark:text-stone-500 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-xl border border-stone-200/90 bg-white/95 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
          <ul role="listbox" className="max-h-56 overflow-y-auto custom-scrollbar">
            {options.map((option, index) => {
              const isSelected = option.value === selected?.value;
              const isFirst = index === 0;
              const isLast = index === options.length - 1;
              return (
                <li
                  key={option.value}
                  className={`${isFirst ? 'rounded-t-[11px]' : ''} ${
                    isLast ? 'rounded-b-[11px]' : ''
                  } overflow-hidden ${isLast ? '' : 'border-b border-stone-100/80 dark:border-stone-800/80'}`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] dark:bg-[var(--color-accent-soft-dark)] dark:text-stone-100'
                        : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800/90'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const DropdownSelect = React.memo(DropdownSelectInner) as typeof DropdownSelectInner;

type SettingsSection = 'appearance' | 'ai' | 'tts' | 'about';

const SETTINGS_SECTIONS: {
  id: SettingsSection;
  labelKey: string;
  descriptionKey: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'appearance', labelKey: 'settings.section.appearance.label', descriptionKey: 'settings.section.appearance.description', icon: Monitor },
  { id: 'ai', labelKey: 'settings.section.ai.label', descriptionKey: 'settings.section.ai.description', icon: Sparkles },
  { id: 'tts', labelKey: 'settings.section.tts.label', descriptionKey: 'settings.section.tts.description', icon: Mic },
  { id: 'about', labelKey: 'settings.section.about.label', descriptionKey: 'settings.section.about.description', icon: Feather },
];

const UI_FONT_OPTIONS: UiFontPreference[] = ['sans', 'serif', 'custom'];
const ARTICLE_FONT_OPTIONS: ArticleFontPreference[] = ['sans', 'serif', 'custom'];
const FONT_SIZE_OPTIONS: FontSizePreference[] = ['small', 'medium', 'large'];
const EMPTY_SELECT_OPTIONS: SelectOption<string>[] = [];

const themeOptions: {
  id: ThemePreference;
  labelKey: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'light', labelKey: 'settings.theme.light', icon: Sun },
  { id: 'dark', labelKey: 'settings.theme.dark', icon: Moon },
];

const TTS_PROVIDER_LABEL_KEYS: Record<TtsProviderPreference, string> = {
  openai: 'settings.ttsProvider.option.openai',
  elevenlabs: 'settings.ttsProvider.option.elevenlabs',
  qwen: 'settings.ttsProvider.option.qwen',
  azure: 'settings.ttsProvider.option.azure',
  google: 'settings.ttsProvider.option.google',
  aws: 'settings.ttsProvider.option.aws',
  ibm: 'settings.ttsProvider.option.ibm',
  baidu: 'settings.ttsProvider.option.baidu',
  xunfei: 'settings.ttsProvider.option.xunfei',
  aliyun: 'settings.ttsProvider.option.aliyun',
  tencent: 'settings.ttsProvider.option.tencent',
  huawei: 'settings.ttsProvider.option.huawei',
  volcengine: 'settings.ttsProvider.option.volcengine',
  custom: 'settings.ttsProvider.option.custom',
};

const TTS_PROVIDER_HINT_KEYS: Record<TtsProviderPreference, string> = {
  openai: 'settings.ttsProvider.hint.openai',
  elevenlabs: 'settings.ttsProvider.hint.elevenlabs',
  qwen: 'settings.ttsProvider.hint.qwen',
  azure: 'settings.ttsProvider.hint.azure',
  google: 'settings.ttsProvider.hint.google',
  aws: 'settings.ttsProvider.hint.aws',
  ibm: 'settings.ttsProvider.hint.ibm',
  baidu: 'settings.ttsProvider.hint.baidu',
  xunfei: 'settings.ttsProvider.hint.xunfei',
  aliyun: 'settings.ttsProvider.hint.aliyun',
  tencent: 'settings.ttsProvider.hint.tencent',
  huawei: 'settings.ttsProvider.hint.huawei',
  volcengine: 'settings.ttsProvider.hint.volcengine',
  custom: 'settings.ttsProvider.hint.custom',
};

const TTS_AUDIO_FORMAT_LABEL_KEYS: Record<TtsAudioFormatPreference, string> = {
  mp3: 'settings.ttsAudioFormat.mp3',
  wav: 'settings.ttsAudioFormat.wav',
  opus: 'settings.ttsAudioFormat.opus',
};

type SettingsPageProps = {
  onPreferencesChange?: () => void;
  onRequestClose?: () => void;
  isOpen?: boolean;
};

const formatAppVersionForDisplay = (version: string): string => {
  const prereleaseMatch = version.match(/^(\d+\.\d+\.\d+)-(alpha|beta|rc)(?:[.-]?(\d+))?$/i);
  if (!prereleaseMatch) return version;
  const [, baseVersion, stage, stageNumber] = prereleaseMatch;
  const stageLabel = `${stage.slice(0, 1).toUpperCase()}${stage.slice(1).toLowerCase()}`;
  return stageNumber ? `${baseVersion} ${stageLabel} ${stageNumber}` : `${baseVersion} ${stageLabel}`;
};

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0-beta';
const APP_VERSION_DISPLAY = formatAppVersionForDisplay(APP_VERSION);

const useDebouncedValue = <T,>(value: T, delayMs = 240): T => {
  const initialValueRef = useRef(value);
  const [debounced, setDebounced] = useState(initialValueRef.current);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debounced;
};

type SettingsSidebarNavProps = {
  activeSection: SettingsSection;
  onSectionChange: (next: SettingsSection) => void;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
};

const SettingsSidebarNav = React.memo(function SettingsSidebarNav({
  activeSection,
  onSectionChange,
  t,
}: SettingsSidebarNavProps) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-stone-200/80 bg-[#f7f7f5] dark:border-stone-800 dark:bg-stone-900/70">
      <div className="flex h-20 items-center border-b border-stone-200/80 px-5 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-stone-900 to-stone-700 text-white shadow-lg dark:from-stone-100 dark:to-stone-300 dark:text-stone-900">
            <Feather size={18} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
              {t('settings.brand')}
            </div>
            <div className="text-lg font-serif font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {t('settings.title')}
            </div>
          </div>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {SETTINGS_SECTIONS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={`mb-2 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                isActive
                  ? 'border-stone-200 bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/70 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700'
                  : 'border-transparent text-stone-500 hover:border-stone-200/80 hover:bg-white/70 hover:text-stone-900 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:bg-stone-800/80 dark:hover:text-stone-200'
              }`}
              aria-pressed={isActive}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200/80 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                <Icon size={15} className={isActive ? 'accent-text' : ''} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{t(item.labelKey)}</div>
                <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{t(item.descriptionKey)}</div>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
});

type SettingsPanelHeaderProps = {
  activeSectionMeta: {
    labelKey: string;
    descriptionKey: string;
  };
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
};

const SettingsPanelHeader = React.memo(function SettingsPanelHeader({
  activeSectionMeta,
  onClose,
  t,
}: SettingsPanelHeaderProps) {
  return (
    <header className="flex h-20 items-center justify-between border-b border-stone-200/80 bg-white/85 px-7 backdrop-blur dark:border-stone-800 dark:bg-stone-950/85">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
          {t(activeSectionMeta.descriptionKey)}
        </div>
        <div className="mt-1 truncate text-[20px] font-serif font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {t(activeSectionMeta.labelKey)}
        </div>
      </div>
      <div className="ml-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-500 transition-colors hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          aria-label={t('settings.closeAria')}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
});


type SettingsSectionContentProps = {
  activeSection: SettingsSection;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  state: Record<string, any>;
};

const AboutSectionContent = React.memo(function AboutSectionContent({
  t,
  state,
}: {
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  state: Record<string, any>;
}) {
  const {
    developerLogEnabled,
    setDeveloperLogEnabled,
    developerLogLevel,
    setDeveloperLogLevel,
    developerLogLevelOptions,
    handleExportDeveloperLogs,
    isExportingDeveloperLogs,
    developerLogExportStatus,
    developerLogExportMessage,
  } = state;

  return (
    <div className="space-y-6 animate-slide-in-up">
      <SettingCard kicker={t('settings.about.kicker')} title={t('settings.about.title')}>
        <div className="rounded-xl border border-stone-200/80 bg-white px-4 py-4 dark:border-stone-700 dark:bg-stone-900/70">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">{t('common.version')}</div>
          <div className="mt-2 text-2xl font-serif font-semibold text-stone-900 dark:text-stone-100">{APP_VERSION_DISPLAY}</div>
          <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {t('settings.about.syncedVersion')}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-white px-4 py-4 text-xs leading-6 text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
          {t('settings.about.description')}
        </div>
      </SettingCard>

      <SettingCard
        kicker={t('settings.developerLogs.kicker')}
        title={t('settings.developerLogs.title')}
        description={t('settings.developerLogs.description')}
      >
        <div className="rounded-xl border border-stone-200/80 bg-white px-4 dark:border-stone-700 dark:bg-stone-900/70">
          <SettingRow
            icon={Terminal}
            label={t('settings.developerLogs.enabled.label')}
            description={t('settings.developerLogs.enabled.description')}
          >
            <Switch checked={developerLogEnabled} onChange={setDeveloperLogEnabled} />
          </SettingRow>
          <SettingRow
            icon={Terminal}
            label={t('settings.developerLogs.level.label')}
            description={t('settings.developerLogs.level.description')}
            isLast={true}
          >
            <DropdownSelect
              className={`${selectClass} min-w-[140px]`}
              value={developerLogLevel}
              options={developerLogLevelOptions}
              onChange={(value) => setDeveloperLogLevel(value as DeveloperLogLevelPreference)}
            />
          </SettingRow>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/70">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportDeveloperLogs}
              disabled={isExportingDeveloperLogs}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isExportingDeveloperLogs
                  ? 'cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500'
                  : 'border border-[color:var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] hover:bg-[var(--color-accent-soft)]/80 dark:bg-[var(--color-accent-soft-dark)] dark:text-stone-100'
              }`}
            >
              {isExportingDeveloperLogs ? t('settings.developerLogs.exporting') : t('settings.developerLogs.export')}
            </button>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {t('settings.developerLogs.exportHint')}
            </span>
          </div>
          {developerLogExportStatus !== 'idle' || developerLogExportMessage ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                developerLogExportStatus === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                  : developerLogExportStatus === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200'
                    : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-300'
              }`}
            >
              {developerLogExportMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400">
          {t('settings.developerLogs.retention', { count: DEVELOPER_LOG_RETENTION_LIMIT })}
        </div>
      </SettingCard>
    </div>
  );
});

const AiSectionContent = React.memo(function AiSectionContent({
  t,
  state,
}: {
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  state: Record<string, any>;
}) {
  const {
    aiEnabled,
    setAiEnabled,
    aiSummaryEnabled,
    setAiSummaryEnabled,
    aiTranslationEnabled,
    setAiTranslationEnabled,
    aiApiBase,
    setAiApiBase,
    aiApiKey,
    setAiApiKey,
    aiModel,
    setAiModel,
    summaryLanguage,
    setSummaryLanguage,
    summaryLanguageOptions,
    translationTarget,
    setTranslationTarget,
    translationTargetOptions,
    translationOutput,
    setTranslationOutput,
    translationOutputOptions,
    handleTestAiConnection,
    isTestingAiConnection,
    aiConnectionTestStatus,
    aiConnectionTestMessage,
  } = state;

  return (
    <div className="space-y-6 animate-slide-in-up">
      <SettingCard
        kicker={t('settings.aiControls.kicker')}
        title={t('settings.aiControls.title')}
        description={t('settings.aiControls.description')}
      >
        <SettingRow
          icon={Sparkles}
          label={t('settings.aiMaster.label')}
          description={t('settings.aiMaster.description')}
        >
          <Switch checked={aiEnabled} onChange={setAiEnabled} />
        </SettingRow>
        <SettingRow
          icon={BrainCircuit}
          label={t('settings.aiSummary.label')}
          description={t('settings.aiSummary.description')}
        >
          <Switch
            checked={aiSummaryEnabled}
            onChange={setAiSummaryEnabled}
            disabled={!aiEnabled}
          />
        </SettingRow>
        <SettingRow
          icon={Sparkles}
          label={t('settings.aiTranslation.label')}
          description={t('settings.aiTranslation.description')}
          isLast={true}
        >
          <Switch
            checked={aiTranslationEnabled}
            onChange={setAiTranslationEnabled}
            disabled={!aiEnabled}
          />
        </SettingRow>
        {!aiEnabled ? (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">
            {t('settings.aiDisabledHint')}
          </p>
        ) : null}
      </SettingCard>

      <SettingCard
        kicker={t('settings.aiProvider.kicker')}
        title={t('settings.aiProvider.title')}
        description={t('settings.aiProvider.description')}
      >
        <div className="mt-4 grid gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.aiApiBase')}</div>
            <input
              className={inputClass}
              placeholder={t('settings.aiApiBasePlaceholder')}
              value={aiApiBase}
              onChange={(event) => setAiApiBase(event.target.value)}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.aiApiKey')}</div>
            <input
              type="password"
              className={inputClass}
              placeholder={t('settings.aiApiKeyPlaceholder')}
              value={aiApiKey}
              onChange={(event) => setAiApiKey(event.target.value)}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.aiModel')}</div>
            <input
              className={inputClass}
              placeholder={t('settings.aiModelPlaceholder')}
              value={aiModel}
              onChange={(event) => setAiModel(event.target.value)}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.summaryLanguage')}</div>
            <DropdownSelect
              className={selectClass}
              value={summaryLanguage}
              options={summaryLanguageOptions}
              onChange={setSummaryLanguage}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          {t('settings.aiCredentialHint')}
        </p>

        <div className="mt-4 rounded-xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/70">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTestAiConnection}
              disabled={isTestingAiConnection}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isTestingAiConnection
                  ? 'cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500'
                  : 'border border-[color:var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] hover:bg-[var(--color-accent-soft)]/80 dark:bg-[var(--color-accent-soft-dark)] dark:text-stone-100'
              }`}
            >
              {isTestingAiConnection ? t('settings.aiConnectionTesting') : t('settings.aiConnectionTest')}
            </button>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {t('settings.aiConnectionHint')}
            </span>
          </div>
          {aiConnectionTestStatus !== 'idle' || aiConnectionTestMessage ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                aiConnectionTestStatus === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                  : aiConnectionTestStatus === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200'
                    : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-300'
              }`}
            >
              {aiConnectionTestMessage}
            </div>
          ) : null}
        </div>
      </SettingCard>

      <SettingCard
        kicker={t('settings.translation.kicker')}
        title={t('settings.translation.title')}
        description={t('settings.translation.description')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.translationTarget')}</div>
            <DropdownSelect
              className={selectClass}
              value={translationTarget}
              options={translationTargetOptions}
              onChange={setTranslationTarget}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.translationOutput')}</div>
            <DropdownSelect
              className={selectClass}
              value={translationOutput}
              options={translationOutputOptions}
              onChange={setTranslationOutput}
            />
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400">
          <div className="mb-1 flex items-center gap-2 font-semibold text-stone-700 dark:text-stone-200">
            <Sparkles size={14} className="accent-text" />
            {t('settings.translationDefaults')}
          </div>
          {t('settings.translationDefaultsHint')}
        </div>
      </SettingCard>
    </div>
  );
});

const SettingsSectionContent = React.memo(function SettingsSectionContent({
  activeSection,
  t,
  state,
}: SettingsSectionContentProps) {
  if (activeSection === 'ai') {
    return <AiSectionContent t={t} state={state} />;
  }
  if (activeSection === 'about') {
    return <AboutSectionContent t={t} state={state} />;
  }
  return (
    <>
            {activeSection === 'appearance' ? (() => {
              const {
                theme,
                setTheme,
                themeColor,
                setThemeColor,
                uiFontFamily,
                setUiFontFamily,
                uiCustomFontStack,
                setUiCustomFontStack,
                articleFontFamily,
                setArticleFontFamily,
                articleCustomFontStack,
                setArticleCustomFontStack,
                interfaceLanguage,
                setInterfaceLanguage,
                interfaceLanguageOptions,
                fontSize,
                setFontSize,
                fontSizeOptions,
                refreshIntervalMinutes,
                setRefreshIntervalMinutes,
                refreshIntervalOptions,
                previewTitleSizeClass,
                previewBodySizeClass,
                uiPreviewFontClass,
                articlePreviewFontClass,
                activeThemeColor,
                uiFontOptions,
                articleFontOptions,
              } = state;
              return (
              <div className="space-y-6 animate-slide-in-up">
                <SettingCard
                  kicker={t('settings.appearance.kicker')}
                  title={t('settings.appearance.title')}
                  description={t('settings.appearance.description')}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = option.id === theme;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTheme(option.id)}
                          className={`rounded-xl border px-4 py-3 text-left transition ${
                            isActive
                              ? 'border-[color:var(--color-accent-border)] bg-[var(--color-accent-soft)] text-stone-900 ring-1 ring-[color:var(--color-accent-border)] dark:bg-[var(--color-accent-soft-dark)] dark:text-stone-100'
                              : 'border-stone-200 bg-stone-50/70 text-stone-600 hover:bg-white hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-300 dark:hover:bg-stone-800'
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                            <Icon size={15} className={isActive ? 'accent-text' : 'text-stone-400'} />
                            {t(option.labelKey)}
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-400">
                            {option.id === 'dark' ? t('settings.theme.darkHint') : t('settings.theme.lightHint')}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-xl border border-stone-200/80 bg-white px-4 dark:border-stone-700 dark:bg-stone-900/70">
                    <SettingRow
                      icon={Sparkles}
                      label={t('settings.themeColor.label')}
                      description={t('settings.themeColor.description')}
                    >
                      <div className="flex flex-wrap justify-end gap-2">
                        {THEME_COLOR_OPTIONS.map((option) => {
                          const isActive = option.value === themeColor;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setThemeColor(option.value)}
                              className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                isActive
                                  ? 'border-stone-300 bg-stone-100 text-stone-900 ring-1 ring-stone-300/70 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600'
                                  : 'border-stone-200 bg-white text-stone-500 hover:text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:text-stone-100'
                              }`}
                              aria-pressed={isActive}
                              aria-label={t('settings.themeColor.aria', { color: option.label })}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: option.swatch }}
                                aria-hidden="true"
                              />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </SettingRow>
                    <SettingRow
                      icon={Type}
                      label={t('settings.interfaceFont.label')}
                      description={t('settings.interfaceFont.description')}
                    >
                      <div className="flex rounded-lg bg-stone-100 p-1 text-xs dark:bg-stone-800">
                        {uiFontOptions.map((font: UiFontPreference) => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => setUiFontFamily(font)}
                            className={`rounded-md px-3 py-1.5 font-semibold transition ${
                              uiFontFamily === font
                                ? 'bg-white text-stone-900 shadow dark:bg-stone-700 dark:text-stone-100'
                                : 'text-stone-500 hover:text-stone-800 dark:text-stone-300 dark:hover:text-stone-100'
                            } ${font === 'serif' ? 'font-serif' : font === 'sans' ? 'font-sans' : ''}`}
                          >
                            {font === 'serif' ? t('toolbar.fontSerif') : font === 'sans' ? t('toolbar.fontSans') : t('toolbar.fontCustom')}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                    {uiFontFamily === 'custom' ? (
                      <div className="pb-4 pl-11">
                        <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                          {t('settings.uiFontStack')}
                        </div>
                        <input
                          type="text"
                          value={uiCustomFontStack}
                          onChange={event => setUiCustomFontStack(event.target.value)}
                          placeholder={t('settings.uiFontPlaceholder')}
                          className={inputClass}
                        />
                        <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                          {t('settings.uiFontHint')}
                        </div>
                      </div>
                    ) : null}
                    <SettingRow
                      icon={Type}
                      label={t('settings.articleFont.label')}
                      description={t('settings.articleFont.description')}
                    >
                      <div className="flex rounded-lg bg-stone-100 p-1 text-xs dark:bg-stone-800">
                        {articleFontOptions.map((font: ArticleFontPreference) => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => setArticleFontFamily(font)}
                            className={`rounded-md px-3 py-1.5 font-semibold transition ${
                              articleFontFamily === font
                                ? 'bg-white text-stone-900 shadow dark:bg-stone-700 dark:text-stone-100'
                                : 'text-stone-500 hover:text-stone-800 dark:text-stone-300 dark:hover:text-stone-100'
                            } ${font === 'serif' ? 'font-serif' : font === 'sans' ? 'font-sans' : ''}`}
                          >
                            {font === 'serif' ? t('toolbar.fontSerif') : font === 'sans' ? t('toolbar.fontSans') : t('toolbar.fontCustom')}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                    {articleFontFamily === 'custom' ? (
                      <div className="pb-4 pl-11">
                        <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                          {t('settings.articleFontStack')}
                        </div>
                        <input
                          type="text"
                          value={articleCustomFontStack}
                          onChange={event => setArticleCustomFontStack(event.target.value)}
                          placeholder={t('settings.articleFontPlaceholder')}
                          className={inputClass}
                        />
                        <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                          {t('settings.articleFontHint')}
                        </div>
                      </div>
                    ) : null}
                    <SettingRow
                      icon={Monitor}
                      label={t('settings.interfaceLanguage.label')}
                      description={t('settings.interfaceLanguage.description')}
                    >
                      <DropdownSelect
                        className={selectClass}
                        value={interfaceLanguage}
                        options={interfaceLanguageOptions}
                        onChange={(value) => setInterfaceLanguage(value as InterfaceLanguagePreference)}
                      />
                    </SettingRow>
                    <SettingRow
                      icon={Type}
                      label={t('settings.readingSize.label')}
                      description={t('settings.readingSize.description')}
                    >
                      <div className="flex rounded-lg bg-stone-100 p-1 text-xs dark:bg-stone-800">
                        {fontSizeOptions.map((size: FontSizePreference) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setFontSize(size)}
                            className={`rounded-md px-3 py-1.5 font-semibold transition ${
                              fontSize === size
                                ? 'bg-white text-stone-900 shadow dark:bg-stone-700 dark:text-stone-100'
                                : 'text-stone-500 hover:text-stone-800 dark:text-stone-300 dark:hover:text-stone-100'
                            }`}
                          >
                            A{size === 'large' ? '+' : size === 'small' ? '-' : ''}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                    <SettingRow
                      icon={RefreshCw}
                      label={t('settings.refreshInterval.label')}
                      description={t('settings.refreshInterval.description')}
                      isLast={true}
                    >
                      <DropdownSelect
                        className={`${selectClass} min-w-[96px]`}
                        value={String(refreshIntervalMinutes)}
                        options={refreshIntervalOptions}
                        onChange={(value) => setRefreshIntervalMinutes(Number(value) as RssRefreshIntervalPreference)}
                      />
                    </SettingRow>
                  </div>
                </SettingCard>

                <SettingCard kicker={t('settings.preview.kicker')} title={t('settings.preview.title')}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`rounded-xl border border-dashed border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900/70 ${uiPreviewFontClass}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                          {t('settings.preview.interface')}
                        </div>
                        <span className="accent-bg rounded-full px-2.5 py-1 text-[11px] font-semibold text-white">
                          {activeThemeColor.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {t('settings.preview.interfaceLine')}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 dark:border-stone-700 dark:bg-stone-800">
                            {t('nav.timeline')}
                          </span>
                          <span className="accent-bg-soft accent-text rounded-md border border-stone-200 px-2.5 py-1 dark:border-stone-700">
                            {t('settings.preview.selected')}
                          </span>
                          <span className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 dark:border-stone-700 dark:bg-stone-800">
                            {t('settings.preview.button')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-dashed border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900/70">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                        {t('settings.preview.reader')}
                      </div>
                      <div className={`${previewTitleSizeClass} font-semibold tracking-tight text-stone-900 dark:text-stone-100 ${articlePreviewFontClass}`}>
                        {t('settings.preview.readerTitle')}
                      </div>
                      <p className={`mt-3 text-stone-600 dark:text-stone-300 ${previewBodySizeClass} ${articlePreviewFontClass}`}>
                        {t('settings.preview.readerBody')}
                      </p>
                    </div>
                  </div>
                </SettingCard>
              </div>
              );
            })() : null}

            {activeSection === 'tts' ? (() => {
              const {
                ttsIncludeAuthor,
                setTtsIncludeAuthor,
                ttsIncludeSource,
                setTtsIncludeSource,
                ttsProvider,
                setTtsProvider,
                ttsAudioFormat,
                setTtsAudioFormat,
                ttsProviderOptions,
                ttsAudioFormatOptions,
                showApiBaseField,
                providerFieldMeta,
                ttsApiBase,
                setTtsApiBase,
                ttsApiKey,
                setTtsApiKey,
                providerRequired,
                ttsApiSecret,
                setTtsApiSecret,
                showRegionField,
                showProjectIdField,
                showAppIdField,
                ttsRegion,
                setTtsRegion,
                ttsProjectId,
                setTtsProjectId,
                ttsAppId,
                setTtsAppId,
                showModelField,
                showVoiceField,
                ttsModel,
                setTtsModel,
                ttsVoice,
                setTtsVoice,
                isGatewayRequiredProvider,
                handleTestTtsProxy,
                canTestQwenProxy,
                isTestingTtsProxy,
                ttsProxyTestStatus,
                ttsProxyTestMessage,
                selectedTtsProvider,
                ttsProviderCapability,
              } = state;
              return (
              <div className="space-y-6 animate-slide-in-up">
                <SettingCard
                  kicker={t('settings.tts.kicker')}
                  title={t('settings.tts.title')}
                  description={t('settings.tts.description')}
                >
                  <div className="rounded-xl border border-stone-200/80 bg-white px-4 dark:border-stone-700 dark:bg-stone-900/70">
                    <SettingRow
                      icon={Mic}
                      label={t('settings.ttsIncludeAuthor.label')}
                      description={t('settings.ttsIncludeAuthor.description')}
                    >
                      <Switch checked={ttsIncludeAuthor} onChange={setTtsIncludeAuthor} />
                    </SettingRow>
                    <SettingRow
                      icon={Mic}
                      label={t('settings.ttsIncludeSource.label')}
                      description={t('settings.ttsIncludeSource.description')}
                      isLast={true}
                    >
                      <Switch checked={ttsIncludeSource} onChange={setTtsIncludeSource} />
                    </SettingRow>
                  </div>
                </SettingCard>

                <SettingCard
                  kicker={t('settings.ttsProvider.kicker')}
                  title={t('settings.ttsProvider.title')}
                  description={t('settings.ttsProvider.description')}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.ttsProvider.label')}</div>
                      <DropdownSelect
                        className={selectClass}
                        value={ttsProvider}
                        options={ttsProviderOptions}
                        onChange={setTtsProvider}
                      />
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('settings.ttsAudioFormat.label')}</div>
                      <DropdownSelect
                        className={selectClass}
                        value={ttsAudioFormat}
                        options={ttsAudioFormatOptions}
                        onChange={setTtsAudioFormat}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    {showApiBaseField ? (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                          {t('settings.ttsField.apiBase.label')}
                        </div>
                        <input
                          className={inputClass}
                          placeholder={providerFieldMeta.apiBase.placeholder || t('settings.ttsField.apiBase.placeholder')}
                          value={ttsApiBase}
                          onChange={(event) => setTtsApiBase(event.target.value)}
                        />
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                        {t('settings.ttsField.apiKey.label')}
                      </div>
                      <input
                        type="password"
                        className={inputClass}
                        placeholder={providerFieldMeta.apiKey.placeholder || t('settings.ttsField.apiKey.placeholder')}
                        value={ttsApiKey}
                        onChange={(event) => setTtsApiKey(event.target.value)}
                      />
                    </div>
                    {providerRequired.apiSecret ? (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                          {t('settings.ttsField.apiSecret.label')}
                        </div>
                        <input
                          type="password"
                          className={inputClass}
                          placeholder={providerFieldMeta.apiSecret.placeholder || t('settings.ttsField.apiSecret.placeholder')}
                          value={ttsApiSecret}
                          onChange={(event) => setTtsApiSecret(event.target.value)}
                        />
                      </div>
                    ) : null}
                    {(showRegionField || showProjectIdField || showAppIdField) ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {showRegionField ? (
                          <div>
                            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                              {t('settings.ttsField.region.label')}
                            </div>
                            <input
                              className={inputClass}
                              placeholder={providerFieldMeta.region.placeholder || t('settings.ttsField.region.placeholder')}
                              value={ttsRegion}
                              onChange={(event) => setTtsRegion(event.target.value)}
                            />
                          </div>
                        ) : null}
                        {showProjectIdField ? (
                          <div>
                            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                              {t('settings.ttsField.projectId.label')}
                            </div>
                            <input
                              className={inputClass}
                              placeholder={providerFieldMeta.projectId.placeholder || t('settings.ttsField.projectId.placeholder')}
                              value={ttsProjectId}
                              onChange={(event) => setTtsProjectId(event.target.value)}
                            />
                          </div>
                        ) : null}
                        {showAppIdField ? (
                          <div>
                            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                              {t('settings.ttsField.appId.label')}
                            </div>
                            <input
                              className={inputClass}
                              placeholder={providerFieldMeta.appId.placeholder || t('settings.ttsField.appId.placeholder')}
                              value={ttsAppId}
                              onChange={(event) => setTtsAppId(event.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {(showModelField || showVoiceField) ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {showModelField ? (
                          <div>
                            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                              {t('settings.ttsField.model.label')}
                            </div>
                            <input
                              className={inputClass}
                              placeholder={providerFieldMeta.model.placeholder || t('settings.ttsField.model.placeholder')}
                              value={ttsModel}
                              onChange={(event) => setTtsModel(event.target.value)}
                            />
                          </div>
                        ) : null}
                        {showVoiceField ? (
                          <div>
                            <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                              {t('settings.ttsField.voice.label')}
                            </div>
                            <input
                              className={inputClass}
                              placeholder={providerFieldMeta.voice.placeholder || t('settings.ttsField.voice.placeholder')}
                              value={ttsVoice}
                              onChange={(event) => setTtsVoice(event.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {isGatewayRequiredProvider ? (
                    <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
                      {t('settings.ttsGatewayWarning')}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/70">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleTestTtsProxy}
                        disabled={!canTestQwenProxy || isTestingTtsProxy}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          !canTestQwenProxy
                            ? 'cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500'
                            : 'border border-[color:var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] hover:bg-[var(--color-accent-soft)]/80 dark:bg-[var(--color-accent-soft-dark)] dark:text-stone-100'
                        }`}
                      >
                        {isTestingTtsProxy ? t('settings.ttsProxyTesting') : t('settings.ttsProxyTest')}
                      </button>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        {canTestQwenProxy
                          ? t('settings.ttsProxyHintReady')
                          : t('settings.ttsProxyHintUnavailable')}
                      </span>
                    </div>
                    {ttsProxyTestStatus !== 'idle' || ttsProxyTestMessage ? (
                      <div
                        className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                          ttsProxyTestStatus === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                            : ttsProxyTestStatus === 'error'
                              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200'
                              : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-300'
                        }`}
                      >
                        {ttsProxyTestMessage}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400">
                    <div className="mb-1 flex items-center gap-2 font-semibold text-stone-700 dark:text-stone-200">
                      <Sparkles size={14} className="accent-text" />
                      {t('settings.ttsCapabilityTitle', { provider: selectedTtsProvider.label })}
                    </div>
                    <div>{selectedTtsProvider.hint}</div>
                    <a
                      href={ttsProviderCapability.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="accent-text mt-1 inline-flex underline underline-offset-2"
                    >
                      {t('settings.ttsDocs')}
                    </a>
                    <div className="mt-1">
                      {isGatewayRequiredProvider
                        ? t('settings.ttsBrowserBlocked')
                        : t('settings.ttsBrowserReady')}
                    </div>
                  </div>
                </SettingCard>
              </div>
              );
            })() : null}

    </>
  );
});
export function SettingsPage({ onPreferencesChange, onRequestClose, isOpen = true }: SettingsPageProps) {
  const { t } = useI18nRead();
  const { setLanguage } = useI18nActions();
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  const [themeColor, setThemeColor] = useState<ThemeColorPreference>(() => getThemeColorPreference());
  const [uiFontFamily, setUiFontFamily] = useState<UiFontPreference>(() => getUiFontPreference());
  const [uiCustomFontStack, setUiCustomFontStack] = useState(() => getUiFontCustomPreference());
  const [articleFontFamily, setArticleFontFamily] = useState<ArticleFontPreference>(() => getArticleFontPreference());
  const [articleCustomFontStack, setArticleCustomFontStack] = useState(() => getArticleFontCustomPreference());
  const [fontSize, setFontSize] = useState<FontSizePreference>(() => getFontSizePreference());
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState<RssRefreshIntervalPreference>(() => getRssRefreshIntervalPreference());
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguagePreference>(() => getInterfaceLanguagePreference());
  const [aiEnabled, setAiEnabled] = useState(() => getAiEnabledPreference());
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(() => getAiSummaryPreference());
  const [aiTranslationEnabled, setAiTranslationEnabled] = useState(() => getAiTranslationPreference());
  const [aiApiBase, setAiApiBase] = useState(() => getAiApiBasePreference());
  const [aiApiKey, setAiApiKey] = useState(() => getAiApiKeyPreference());
  const [aiModel, setAiModel] = useState(() => getAiModelPreference());
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionTestStatus, setAiConnectionTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState('');
  const [summaryLanguage, setSummaryLanguage] = useState<SummaryLanguagePreference>(() => getSummaryLanguagePreference());
  const [translationTarget, setTranslationTarget] = useState<TranslationTargetPreference>(() => getTranslationTargetPreference());
  const [translationOutput, setTranslationOutput] = useState<TranslationOutputPreference>(() => getTranslationOutputPreference());
  const [ttsIncludeAuthor, setTtsIncludeAuthor] = useState(() => getTtsIncludeAuthorPreference());
  const [ttsIncludeSource, setTtsIncludeSource] = useState(() => getTtsIncludeSourcePreference());
  const [ttsProvider, setTtsProvider] = useState<TtsProviderPreference>(() => getTtsProviderPreference());
  const [ttsApiBase, setTtsApiBase] = useState(() => getTtsApiBasePreference());
  const [ttsApiKey, setTtsApiKey] = useState(() => getTtsApiKeyPreference());
  const [ttsApiSecret, setTtsApiSecret] = useState(() => getTtsApiSecretPreference());
  const [ttsRegion, setTtsRegion] = useState(() => getTtsRegionPreference());
  const [ttsProjectId, setTtsProjectId] = useState(() => getTtsProjectIdPreference());
  const [ttsAppId, setTtsAppId] = useState(() => getTtsAppIdPreference());
  const [ttsModel, setTtsModel] = useState(() => getTtsModelPreference());
  const [ttsVoice, setTtsVoice] = useState(() => getTtsVoicePreference());
  const [ttsAudioFormat, setTtsAudioFormat] = useState<TtsAudioFormatPreference>(() => getTtsAudioFormatPreference());
  const [isTestingTtsProxy, setIsTestingTtsProxy] = useState(false);
  const [ttsProxyTestStatus, setTtsProxyTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [ttsProxyTestMessage, setTtsProxyTestMessage] = useState('');
  const [developerLogEnabled, setDeveloperLogEnabled] = useState(() => getDeveloperLogEnabledPreference());
  const [developerLogLevel, setDeveloperLogLevel] = useState<DeveloperLogLevelPreference>(() => getDeveloperLogLevelPreference());
  const [isExportingDeveloperLogs, setIsExportingDeveloperLogs] = useState(false);
  const [developerLogExportStatus, setDeveloperLogExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [developerLogExportMessage, setDeveloperLogExportMessage] = useState('');
  const debouncedUiCustomFontStack = useDebouncedValue(uiCustomFontStack);
  const debouncedArticleCustomFontStack = useDebouncedValue(articleCustomFontStack);
  const debouncedAiApiBase = useDebouncedValue(aiApiBase);
  const debouncedAiApiKey = useDebouncedValue(aiApiKey);
  const debouncedAiModel = useDebouncedValue(aiModel);
  const debouncedTtsApiBase = useDebouncedValue(ttsApiBase);
  const debouncedTtsApiKey = useDebouncedValue(ttsApiKey);
  const debouncedTtsApiSecret = useDebouncedValue(ttsApiSecret);
  const debouncedTtsRegion = useDebouncedValue(ttsRegion);
  const debouncedTtsProjectId = useDebouncedValue(ttsProjectId);
  const debouncedTtsAppId = useDebouncedValue(ttsAppId);
  const debouncedTtsModel = useDebouncedValue(ttsModel);
  const debouncedTtsVoice = useDebouncedValue(ttsVoice);
  const effectiveUiCustomFontStack = uiFontFamily === 'custom'
    ? debouncedUiCustomFontStack
    : uiCustomFontStack;
  const effectiveArticleCustomFontStack = articleFontFamily === 'custom'
    ? debouncedArticleCustomFontStack
    : articleCustomFontStack;
  const canPersistRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  const notifyPreferencesFrameRef = useRef<number | null>(null);
  const canPersist = useCallback(() => isOpenRef.current && canPersistRef.current, []);
  const markSaved = useCallback(() => {
    if (!canPersist()) return;
    if (notifyPreferencesFrameRef.current != null || typeof window === 'undefined') {
      return;
    }
    notifyPreferencesFrameRef.current = window.requestAnimationFrame(() => {
      notifyPreferencesFrameRef.current = null;
      if (!canPersist()) return;
      onPreferencesChange?.();
    });
  }, [canPersist, onPreferencesChange]);

  useEffect(() => {
    return () => {
      if (notifyPreferencesFrameRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(notifyPreferencesFrameRef.current);
        notifyPreferencesFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

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
    if (!isOpen) {
      canPersistRef.current = false;
      return;
    }
    canPersistRef.current = false;
    let rafId = 0;
    if (typeof window !== 'undefined') {
      rafId = window.requestAnimationFrame(() => {
        canPersistRef.current = true;
      });
    } else {
      canPersistRef.current = true;
    }
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('appearance');
    setAiConnectionTestStatus('idle');
    setAiConnectionTestMessage('');
    setTtsProxyTestStatus('idle');
    setTtsProxyTestMessage('');
    setDeveloperLogExportStatus('idle');
    setDeveloperLogExportMessage('');
  }, [isOpen]);

  useEffect(() => {
    if (!canPersist()) return;
    setThemePreference(theme);
    applyThemePreference(theme);
    markSaved();
  }, [theme, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setThemeColorPreference(themeColor);
    applyThemeColorPreference(themeColor);
    markSaved();
  }, [themeColor, canPersist, markSaved]);

  useEffect(() => {
    applyUiFontPreference(uiFontFamily, effectiveUiCustomFontStack);
  }, [uiFontFamily, effectiveUiCustomFontStack]);

  useEffect(() => {
    if (!canPersist()) return;
    setUiFontPreference(uiFontFamily);
    markSaved();
  }, [uiFontFamily, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setUiFontCustomPreference(debouncedUiCustomFontStack);
    markSaved();
  }, [debouncedUiCustomFontStack, canPersist, markSaved]);

  useEffect(() => {
    applyArticleFontPreference(articleFontFamily, effectiveArticleCustomFontStack);
  }, [articleFontFamily, effectiveArticleCustomFontStack]);

  useEffect(() => {
    if (!canPersist()) return;
    setArticleFontPreference(articleFontFamily);
    markSaved();
  }, [articleFontFamily, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setArticleFontCustomPreference(debouncedArticleCustomFontStack);
    markSaved();
  }, [debouncedArticleCustomFontStack, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setFontSizePreference(fontSize);
    markSaved();
  }, [fontSize, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setRssRefreshIntervalPreference(refreshIntervalMinutes);
    markSaved();
  }, [refreshIntervalMinutes, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setDeveloperLogEnabledPreference(developerLogEnabled);
    markSaved();
  }, [developerLogEnabled, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setDeveloperLogLevelPreference(developerLogLevel);
    markSaved();
  }, [developerLogLevel, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setInterfaceLanguagePreference(interfaceLanguage);
    setLanguage(interfaceLanguage);
    markSaved();
  }, [interfaceLanguage, setLanguage, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiEnabledPreference(aiEnabled);
    markSaved();
  }, [aiEnabled, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiSummaryPreference(aiSummaryEnabled);
    markSaved();
  }, [aiSummaryEnabled, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiTranslationPreference(aiTranslationEnabled);
    markSaved();
  }, [aiTranslationEnabled, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiApiBasePreference(debouncedAiApiBase);
    markSaved();
  }, [debouncedAiApiBase, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiApiKeyPreference(debouncedAiApiKey);
    markSaved();
  }, [debouncedAiApiKey, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setAiModelPreference(debouncedAiModel);
    markSaved();
  }, [debouncedAiModel, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setSummaryLanguagePreference(summaryLanguage);
    markSaved();
  }, [summaryLanguage, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTranslationTargetPreference(translationTarget);
    markSaved();
  }, [translationTarget, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTranslationOutputPreference(translationOutput);
    markSaved();
  }, [translationOutput, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsIncludeAuthorPreference(ttsIncludeAuthor);
    markSaved();
  }, [ttsIncludeAuthor, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsIncludeSourcePreference(ttsIncludeSource);
    markSaved();
  }, [ttsIncludeSource, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsProviderPreference(ttsProvider);
    markSaved();
  }, [ttsProvider, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsApiBasePreference(debouncedTtsApiBase);
    markSaved();
  }, [debouncedTtsApiBase, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsApiKeyPreference(debouncedTtsApiKey);
    markSaved();
  }, [debouncedTtsApiKey, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsApiSecretPreference(debouncedTtsApiSecret);
    markSaved();
  }, [debouncedTtsApiSecret, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsRegionPreference(debouncedTtsRegion);
    markSaved();
  }, [debouncedTtsRegion, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsProjectIdPreference(debouncedTtsProjectId);
    markSaved();
  }, [debouncedTtsProjectId, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsAppIdPreference(debouncedTtsAppId);
    markSaved();
  }, [debouncedTtsAppId, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsModelPreference(debouncedTtsModel);
    markSaved();
  }, [debouncedTtsModel, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsVoicePreference(debouncedTtsVoice);
    markSaved();
  }, [debouncedTtsVoice, canPersist, markSaved]);

  useEffect(() => {
    if (!canPersist()) return;
    setTtsAudioFormatPreference(ttsAudioFormat);
    markSaved();
  }, [ttsAudioFormat, canPersist, markSaved]);

  const previewTitleSizeClass =
    fontSize === 'small' ? 'text-xl' : fontSize === 'large' ? 'text-3xl' : 'text-2xl';
  const previewBodySizeClass =
    fontSize === 'small' ? 'text-xs leading-6' : fontSize === 'large' ? 'text-base leading-8' : 'text-sm leading-7';
  const uiPreviewFontClass = uiFontFamily === 'custom'
    ? 'font-ui-custom'
    : uiFontFamily === 'serif'
      ? 'font-serif'
      : 'font-sans';
  const articlePreviewFontClass = articleFontFamily === 'custom'
    ? 'font-article-custom'
    : articleFontFamily === 'serif'
      ? 'font-serif'
      : 'font-sans';
  const activeThemeColor =
    THEME_COLOR_OPTIONS.find(option => option.value === themeColor) ?? THEME_COLOR_OPTIONS[0];
  const getLanguageOptionLabel = useCallback((value: string) => {
    if (value === 'zh-CN') return t('language.chineseSimplifiedNative');
    if (value === 'zh') return t('language.chineseSimplified');
    if (value === 'en') return t('language.english');
    if (value === 'ja') return t('language.japanese');
    if (value === 'ko') return t('language.korean');
    if (value === 'fr') return t('language.french');
    if (value === 'de') return t('language.german');
    return t('language.spanish');
  }, [t]);
  const interfaceLanguageOptions = useMemo(() => {
    if (activeSection !== 'appearance') return EMPTY_SELECT_OPTIONS;
    return INTERFACE_LANGUAGE_OPTIONS.map(option => ({
      value: option.value,
      label: getLanguageOptionLabel(option.value),
    }));
  }, [activeSection, getLanguageOptionLabel]);
  const summaryLanguageOptions = useMemo(() => {
    if (activeSection !== 'ai') return EMPTY_SELECT_OPTIONS;
    return SUMMARY_LANGUAGE_OPTIONS.map(option => ({
      value: option.value,
      label: getLanguageOptionLabel(option.value),
    }));
  }, [activeSection, getLanguageOptionLabel]);
  const translationTargetOptions = useMemo(() => {
    if (activeSection !== 'ai') return EMPTY_SELECT_OPTIONS;
    return TRANSLATION_TARGET_OPTIONS.map(option => ({
      value: option.value,
      label: getLanguageOptionLabel(option.value),
    }));
  }, [activeSection, getLanguageOptionLabel]);
  const translationOutputOptions = useMemo(() => {
    if (activeSection !== 'ai') return EMPTY_SELECT_OPTIONS;
    return TRANSLATION_OUTPUT_OPTIONS.map(option => ({
      value: option.value,
      label: option.value === 'full'
        ? t('translation.output.full')
        : option.value === 'brief'
          ? t('translation.output.brief')
          : t('translation.output.bullet'),
    }));
  }, [activeSection, t]);
  const refreshIntervalOptions = useMemo(() => {
    if (activeSection !== 'appearance') return EMPTY_SELECT_OPTIONS;
    return RSS_REFRESH_INTERVAL_OPTIONS.map(option => ({
      value: String(option.value),
      label: option.label,
    }));
  }, [activeSection]);
  const ttsProviderOptions = useMemo(
    () => (activeSection === 'tts'
      ? TTS_PROVIDER_OPTIONS.map(option => ({
        ...option,
        label: t(TTS_PROVIDER_LABEL_KEYS[option.value]),
        hint: t(TTS_PROVIDER_HINT_KEYS[option.value]),
      }))
      : TTS_PROVIDER_OPTIONS),
    [activeSection, t],
  );
  const ttsAudioFormatOptions = useMemo(
    () => (activeSection === 'tts'
      ? TTS_AUDIO_FORMAT_OPTIONS.map(option => ({
        ...option,
        label: t(TTS_AUDIO_FORMAT_LABEL_KEYS[option.value]),
      }))
      : TTS_AUDIO_FORMAT_OPTIONS),
    [activeSection, t],
  );
  const developerLogLevelOptions = useMemo(
    () => (activeSection === 'about'
      ? DEVELOPER_LOG_LEVEL_OPTIONS.map(option => ({
        ...option,
        label: option.value === 'debug'
          ? t('settings.developerLogs.level.debug')
          : option.value === 'info'
            ? t('settings.developerLogs.level.info')
            : option.value === 'warn'
              ? t('settings.developerLogs.level.warn')
              : t('settings.developerLogs.level.error'),
      }))
      : DEVELOPER_LOG_LEVEL_OPTIONS),
    [activeSection, t],
  );
  const selectedTtsProvider =
    ttsProviderOptions.find(option => option.value === ttsProvider) ?? ttsProviderOptions[0];
  const ttsProviderCapability = useMemo(
    () => (activeSection === 'tts'
      ? getTtsProviderCapability(ttsProvider)
      : getTtsProviderCapability('openai')),
    [activeSection, ttsProvider],
  );
  const providerFieldMeta = ttsProviderCapability.fieldMeta;
  const providerRequired = ttsProviderCapability.required;
  const isGatewayRequiredProvider = ttsProviderCapability.supportMode === 'server-gateway';
  const showApiBaseField =
    providerRequired.apiBase || Boolean(ttsProviderCapability.defaultApiBase) || ttsProvider === 'azure';
  const showRegionField = providerRequired.region || ttsProvider === 'azure';
  const showProjectIdField = providerRequired.projectId || ttsProvider === 'google';
  const showAppIdField = providerRequired.appId;
  const showModelField = providerRequired.model;
  const showVoiceField = providerRequired.voice;
  const canTestQwenProxy = ttsProvider === 'qwen';

  const formatAiTestErrorMessage = useCallback((error: unknown) => {
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

  const handleTestAiConnection = useCallback(async () => {
    if (isTestingAiConnection) return;
    setIsTestingAiConnection(true);
    setAiConnectionTestStatus('idle');
    setAiConnectionTestMessage(t('settings.aiConnectionTestingMessage'));
    writeDeveloperLog({
      level: 'info',
      module: 'settings.ai',
      action: 'connection_test.started',
      result: 'info',
      context: {
        apiBase: aiApiBase,
        model: aiModel,
      },
    });
    try {
      const result = await probeAiConnection({
        config: {
          apiBase: aiApiBase,
          apiKey: aiApiKey,
          model: aiModel,
          timeoutMs: 20_000,
        },
      });
      setAiConnectionTestStatus('success');
      setAiConnectionTestMessage(t('settings.aiConnectionSuccess', {
        model: result.model,
        latency: result.latencyMs,
      }));
      writeDeveloperLog({
        level: 'info',
        module: 'settings.ai',
        action: 'connection_test.completed',
        result: 'success',
        context: {
          model: result.model,
          latencyMs: result.latencyMs,
        },
      });
    } catch (error) {
      setAiConnectionTestStatus('error');
      setAiConnectionTestMessage(formatAiTestErrorMessage(error));
      writeDeveloperLog({
        level: 'error',
        module: 'settings.ai',
        action: 'connection_test.completed',
        result: 'failure',
        errorCode: isAiTaskError(error) ? error.code : 'unknown',
        context: {
          message: error instanceof Error ? error.message : String(error),
          status: isAiTaskError(error) ? error.status : undefined,
        },
      });
    } finally {
      setIsTestingAiConnection(false);
    }
  }, [
    aiApiBase,
    aiApiKey,
    aiModel,
    formatAiTestErrorMessage,
    isTestingAiConnection,
    t,
  ]);

  const handleTestTtsProxy = useCallback(async () => {
    if (!canTestQwenProxy || isTestingTtsProxy) return;
    setIsTestingTtsProxy(true);
    setTtsProxyTestStatus('idle');
    setTtsProxyTestMessage(t('settings.ttsProxyTestingMessage'));
    writeDeveloperLog({
      level: 'info',
      module: 'settings.tts',
      action: 'proxy_test.started',
      result: 'info',
      context: {
        provider: ttsProvider,
        apiBase: ttsApiBase,
        model: ttsModel,
        voice: ttsVoice,
        format: ttsAudioFormat,
      },
    });
    const result = await probeQwenTtsConnection({
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
    });
    setTtsProxyTestStatus(result.ok ? 'success' : 'error');
    setTtsProxyTestMessage(result.message);
    writeDeveloperLog({
      level: result.ok ? 'info' : 'error',
      module: 'settings.tts',
      action: 'proxy_test.completed',
      result: result.ok ? 'success' : 'failure',
      errorCode: result.ok ? undefined : 'tts_proxy_test_failed',
      context: {
        provider: ttsProvider,
        message: result.message,
      },
    });
    setIsTestingTtsProxy(false);
  }, [
    canTestQwenProxy,
    isTestingTtsProxy,
    t,
    ttsProvider,
    ttsApiBase,
    ttsModel,
    ttsVoice,
    ttsAudioFormat,
    ttsApiKey,
    ttsApiSecret,
    ttsRegion,
    ttsProjectId,
    ttsAppId,
  ]);

  const handleExportDeveloperLogs = useCallback(() => {
    if (isExportingDeveloperLogs) return;
    setIsExportingDeveloperLogs(true);
    setDeveloperLogExportStatus('idle');
    setDeveloperLogExportMessage(t('settings.developerLogs.exporting'));
    try {
      const payload = createDeveloperLogExport();
      if (!payload.logs.length) {
        setDeveloperLogExportStatus('success');
        setDeveloperLogExportMessage(t('settings.developerLogs.exportEmpty'));
        writeDeveloperLog({
          level: 'info',
          module: 'settings.logs',
          action: 'export.completed',
          result: 'success',
          context: { count: 0 },
        });
        return;
      }
      const timestamp = payload.exportedAt.replace(/[:.]/g, '-');
      const fileName = `rssive-developer-logs-${timestamp}.json`;
      downloadDeveloperLogExport(payload, fileName);
      setDeveloperLogExportStatus('success');
      setDeveloperLogExportMessage(
        t('settings.developerLogs.exportSuccess', { count: payload.total }),
      );
      writeDeveloperLog({
        level: 'info',
        module: 'settings.logs',
        action: 'export.completed',
        result: 'success',
        context: {
          count: payload.total,
          fileName,
        },
      });
    } catch (error) {
      setDeveloperLogExportStatus('error');
      setDeveloperLogExportMessage(t('settings.developerLogs.exportFailed'));
      writeDeveloperLog({
        level: 'error',
        module: 'settings.logs',
        action: 'export.completed',
        result: 'failure',
        errorCode: 'export_failed',
        context: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setIsExportingDeveloperLogs(false);
    }
  }, [isExportingDeveloperLogs, t]);
  const handleClosePanel = useCallback(() => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, [onRequestClose]);

  const resetAiConnectionTestState = useCallback(() => {
    setAiConnectionTestStatus('idle');
    setAiConnectionTestMessage('');
  }, []);

  const resetTtsProxyTestState = useCallback(() => {
    setTtsProxyTestStatus('idle');
    setTtsProxyTestMessage('');
  }, []);

  const resetDeveloperLogExportState = useCallback(() => {
    setDeveloperLogExportStatus('idle');
    setDeveloperLogExportMessage('');
  }, []);

  const handleInterfaceLanguageChange = useCallback((nextLanguage: InterfaceLanguagePreference) => {
    setInterfaceLanguage(nextLanguage);
  }, []);

  const handleAiApiBaseChange = useCallback((nextValue: string) => {
    setAiApiBase(nextValue);
    resetAiConnectionTestState();
  }, [resetAiConnectionTestState]);

  const handleAiApiKeyChange = useCallback((nextValue: string) => {
    setAiApiKey(nextValue);
    resetAiConnectionTestState();
  }, [resetAiConnectionTestState]);

  const handleAiModelChange = useCallback((nextValue: string) => {
    setAiModel(nextValue);
    resetAiConnectionTestState();
  }, [resetAiConnectionTestState]);

  const handleTtsProviderChange = useCallback((nextProvider: TtsProviderPreference) => {
    setTtsProvider(nextProvider);
    resetTtsProxyTestState();
  }, [resetTtsProxyTestState]);

  const handleDeveloperLogEnabledChange = useCallback((nextEnabled: boolean) => {
    setDeveloperLogEnabled(nextEnabled);
    resetDeveloperLogExportState();
  }, [resetDeveloperLogExportState]);

  const handleDeveloperLogLevelChange = useCallback((nextLevel: DeveloperLogLevelPreference) => {
    setDeveloperLogLevel(nextLevel);
    resetDeveloperLogExportState();
  }, [resetDeveloperLogExportState]);

  const sectionState: Record<string, any> = activeSection === 'appearance'
    ? {
      theme,
      setTheme,
      themeColor,
      setThemeColor,
      uiFontFamily,
      setUiFontFamily,
      uiCustomFontStack,
      setUiCustomFontStack,
      articleFontFamily,
      setArticleFontFamily,
      articleCustomFontStack,
      setArticleCustomFontStack,
      interfaceLanguage,
      setInterfaceLanguage: handleInterfaceLanguageChange,
      interfaceLanguageOptions,
      fontSize,
      setFontSize,
      fontSizeOptions: FONT_SIZE_OPTIONS,
      refreshIntervalMinutes,
      setRefreshIntervalMinutes,
      refreshIntervalOptions,
      previewTitleSizeClass,
      previewBodySizeClass,
      uiPreviewFontClass,
      articlePreviewFontClass,
      activeThemeColor,
      uiFontOptions: UI_FONT_OPTIONS,
      articleFontOptions: ARTICLE_FONT_OPTIONS,
    }
    : activeSection === 'ai'
      ? {
        aiEnabled,
        setAiEnabled,
        aiSummaryEnabled,
        setAiSummaryEnabled,
        aiTranslationEnabled,
        setAiTranslationEnabled,
        aiApiBase,
        setAiApiBase: handleAiApiBaseChange,
        aiApiKey,
        setAiApiKey: handleAiApiKeyChange,
        aiModel,
        setAiModel: handleAiModelChange,
        summaryLanguage,
        setSummaryLanguage,
        summaryLanguageOptions,
        translationTarget,
        setTranslationTarget,
        translationTargetOptions,
        translationOutput,
        setTranslationOutput,
        translationOutputOptions,
        handleTestAiConnection,
        isTestingAiConnection,
        aiConnectionTestStatus,
        aiConnectionTestMessage,
      }
      : activeSection === 'tts'
        ? {
          ttsIncludeAuthor,
          setTtsIncludeAuthor,
          ttsIncludeSource,
          setTtsIncludeSource,
          ttsProvider,
          setTtsProvider: handleTtsProviderChange,
          ttsAudioFormat,
          setTtsAudioFormat,
          ttsProviderOptions,
          ttsAudioFormatOptions,
          showApiBaseField,
          providerFieldMeta,
          ttsApiBase,
          setTtsApiBase,
          ttsApiKey,
          setTtsApiKey,
          providerRequired,
          ttsApiSecret,
          setTtsApiSecret,
          showRegionField,
          showProjectIdField,
          showAppIdField,
          ttsRegion,
          setTtsRegion,
          ttsProjectId,
          setTtsProjectId,
          ttsAppId,
          setTtsAppId,
          showModelField,
          showVoiceField,
          ttsModel,
          setTtsModel,
          ttsVoice,
          setTtsVoice,
          isGatewayRequiredProvider,
          handleTestTtsProxy,
          canTestQwenProxy,
          isTestingTtsProxy,
          ttsProxyTestStatus,
          ttsProxyTestMessage,
          selectedTtsProvider,
          ttsProviderCapability,
        }
        : {
          developerLogEnabled,
          setDeveloperLogEnabled: handleDeveloperLogEnabledChange,
          developerLogLevel,
          setDeveloperLogLevel: handleDeveloperLogLevelChange,
          developerLogLevelOptions,
          handleExportDeveloperLogs,
          isExportingDeveloperLogs,
          developerLogExportStatus,
          developerLogExportMessage,
        };

  if (!shouldRender || typeof document === 'undefined') return null;

  const content = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-180 ${
        isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={{ zIndex: 2147483647 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.dialogLabel')}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-[var(--color-accent-soft)] blur-3xl" />
        <div className="absolute right-16 top-10 h-52 w-52 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className={`relative flex h-[min(820px,92vh)] w-[min(1040px,94vw)] overflow-hidden rounded-[26px] border border-stone-200/90 bg-[#fbfbf9] shadow-[0_35px_90px_rgba(0,0,0,0.22)] transition-transform duration-180 dark:border-stone-800 dark:bg-stone-950 ${
        isVisible ? 'translate-y-0 scale-100' : 'translate-y-1 scale-[0.995]'
      }`}>
        <SettingsSidebarNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          t={t}
        />

        <main className="relative flex min-w-0 flex-1 flex-col bg-[#fcfcfa] dark:bg-stone-950">
          <SettingsPanelHeader
            activeSectionMeta={activeSectionMeta}
            onClose={handleClosePanel}
            t={t}
          />

          <div className="custom-scrollbar flex-1 overflow-y-auto px-7 pt-6 pb-24">
            <SettingsSectionContent
              activeSection={activeSection}
              t={t}
              state={sectionState}
            />
          </div>

          <div className="pointer-events-none absolute bottom-4 right-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
            {t('settings.autoSave')}
          </div>
        </main>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}


