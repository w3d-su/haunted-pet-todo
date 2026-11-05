"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/en";
import {
  htmlLang,
  initialLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "@/lib/i18n/locale";

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale requires LocaleProvider");
  return value;
}

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyDocumentLocale(locale: Locale): void {
  const copy = dictionaryFor(locale);
  const root = document.documentElement;
  root.lang = htmlLang(locale);
  root.dataset.locale = locale;
  document.title = copy.meta.title;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", copy.meta.description);
}

function revealDocument(): void {
  document.documentElement.style.visibility = "";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const fromDom = document.documentElement.dataset.locale;
    const next = isLocale(fromDom) ? fromDom : initialLocale(readStoredLocale(), navigator.language);
    setLocaleState(next);
    applyDocumentLocale(next);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    revealDocument();
  }, [ready, locale]);

  useEffect(() => {
    if (!ready) return;
    const title = dictionaryFor(locale).meta.title;
    const keepTitle = () => {
      if (document.title !== title) document.title = title;
    };
    keepTitle();
    const observer = new MutationObserver(keepTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, ready]);

  useEffect(() => {
    if (!ready || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (cancelled) return;
        registration?.active?.postMessage({ type: "locale", locale });
      })
      .catch(() => {
        // Push is optional. The page still switches language.
      });
    return () => {
      cancelled = true;
    };
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
    applyDocumentLocale(next);
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, setLocale, t: dictionaryFor(locale) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
