import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getInterfaceLanguagePreference,
  setInterfaceLanguagePreference,
  type InterfaceLanguagePreference,
} from '../../shared/state/preferences';
import { translate } from './translate';

type TranslateParams = Record<string, string | number | null | undefined>;

type I18nContextValue = {
  language: InterfaceLanguagePreference;
  setLanguage: (language: InterfaceLanguagePreference) => void;
  t: (key: string, params?: TranslateParams) => string;
};

type I18nActionsContextValue = {
  setLanguage: (language: InterfaceLanguagePreference) => void;
};

const I18nActionsContext = createContext<I18nActionsContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
};

type I18nStore = {
  language: InterfaceLanguagePreference;
};

let i18nStore: I18nStore = {
  language: getInterfaceLanguagePreference(),
};

const languageListeners = new Set<() => void>();

const emitLanguageChange = () => {
  languageListeners.forEach(listener => listener());
};

const getLanguageSnapshot = () => i18nStore.language;

const subscribeLanguage = (listener: () => void) => {
  languageListeners.add(listener);
  return () => {
    languageListeners.delete(listener);
  };
};

const setLanguageStore = (nextLanguage: InterfaceLanguagePreference) => {
  if (i18nStore.language === nextLanguage) {
    return;
  }
  i18nStore = {
    ...i18nStore,
    language: nextLanguage,
  };
  emitLanguageChange();
};

export function I18nProvider({ children }: I18nProviderProps) {
  const setLanguage = useCallback((nextLanguage: InterfaceLanguagePreference) => {
    setLanguageStore(nextLanguage);
    setInterfaceLanguagePreference(nextLanguage);
  }, []);

  const value = useMemo<I18nActionsContextValue>(() => ({
    setLanguage,
  }), [setLanguage]);

  return <I18nActionsContext.Provider value={value}>{children}</I18nActionsContext.Provider>;
}

export function useI18nRead() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getLanguageSnapshot);
  const t = useCallback((key: string, params?: TranslateParams) => (
    translate(language, key, params)
  ), [language]);
  return useMemo(() => ({ language, t }), [language, t]);
}

export function useI18nActions() {
  const actions = useContext(I18nActionsContext);
  if (!actions) {
    throw new Error('useI18nActions must be used within I18nProvider');
  }
  return actions;
}

export function useI18n() {
  const actions = useI18nActions();
  const { language, t } = useI18nRead();
  return useMemo<I18nContextValue>(() => ({
    language,
    t,
    setLanguage: actions.setLanguage,
  }), [actions.setLanguage, language, t]);
}
