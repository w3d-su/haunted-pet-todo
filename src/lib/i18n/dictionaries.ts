import { en, type Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/locale";
import { zhTW } from "@/lib/i18n/zh-TW";

const dictionaries: Record<Locale, Dictionary> = {
  en,
  "zh-TW": zhTW,
};

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

const errorKeys = new Map<string, keyof Dictionary["errors"]>(
  Object.entries(en.errors).map(([key, value]) => [value, key as keyof Dictionary["errors"]]),
);

/** Map a known English message to the active locale. Unknown text stays as sent. */
export function translateError(message: string, t: Dictionary): string {
  const key = errorKeys.get(message);
  return key ? t.errors[key] : message;
}

export function epitaphForDisplay(epitaph: string | null | undefined, t: Dictionary): string {
  const text = epitaph?.trim() ?? "";
  if (text.length === 0 || text === en.epitaph.fallback || text === zhTW.epitaph.fallback) {
    return t.epitaph.fallback;
  }
  return text;
}
