'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LANGUAGES,
  translate,
  type Language,
  type TranslationKey,
} from './dictionary';

export const LANGUAGE_STORAGE_KEY = 'mammoqa.language';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Translate a key, substituting `{placeholder}` values. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as string[]).includes(value);
}

/**
 * Holds the active UI language and exposes `t()` to every client component.
 *
 * The stored choice is applied *after* mount so the server-rendered markup
 * (English) and the first client render always match — no hydration mismatch.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) */
    }
    if (isLanguage(stored)) {
      setLanguageState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* the choice simply will not persist */
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

/** Access the active language and the translation helper. */
export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used inside <LanguageProvider>.');
  }
  return context;
}
