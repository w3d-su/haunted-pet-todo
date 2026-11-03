export const LOCALES = ["en", "zh-TW"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = "haunted-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-TW";
}

/**
 * Primary browser language. Any `zh` or `zh-*` tag becomes Traditional
 * Chinese, including `zh-Hant`, `zh-TW`, and `zh-CN`. This app has one
 * Chinese UI, and it is Traditional. Every other tag stays English.
 */
export function localeFromBrowserLanguage(language: string): Locale {
  const tag = language.trim().toLowerCase().replace(/_/g, "-");
  if (tag === "zh" || tag.startsWith("zh-")) return "zh-TW";
  return "en";
}

/** A saved choice wins. Otherwise use the browser language. */
export function initialLocale(stored: string | null, browserLanguage: string): Locale {
  if (isLocale(stored)) return stored;
  return localeFromBrowserLanguage(browserLanguage);
}

export function htmlLang(locale: Locale): "en" | "zh-Hant-TW" {
  return locale === "zh-TW" ? "zh-Hant-TW" : "en";
}

/**
 * `x-locale` from the client. `zh-TW`, `zh-tw`, and `zh-Hant-TW` select
 * Traditional Chinese. `zh-CN` maps to zh-TW as well: there is no separate
 * Simplified UI.
 */
export function localeFromHeader(value: string | null): Locale {
  if (!value) return "en";
  const tag = value.trim().toLowerCase().replace(/_/g, "-");
  if (tag === "zh-tw" || tag === "zh-hant-tw" || tag === "zh-cn") return "zh-TW";
  return "en";
}

/**
 * Runs before hydration. Keep the detection identical to
 * `localeFromBrowserLanguage` and `initialLocale`.
 */
export const LOCALE_BOOT_SCRIPT = `(function () {
  var key = ${JSON.stringify(LOCALE_STORAGE_KEY)};
  var stored = null;
  try {
    stored = localStorage.getItem(key);
  } catch (error) {}
  var language = "";
  try {
    language = navigator.language || "";
  } catch (error) {}
  var tag = String(language).toLowerCase().replace(/_/g, "-");
  var detected = tag === "zh" || tag.indexOf("zh-") === 0 ? "zh-TW" : "en";
  var locale = stored === "en" || stored === "zh-TW" ? stored : detected;
  var root = document.documentElement;
  root.lang = locale === "zh-TW" ? "zh-Hant-TW" : "en";
  root.dataset.locale = locale;
  document.title = locale === "zh-TW" ? "鬧鬼寵物待辦" : "Haunted Pet To-Do";
  if (locale !== "en") root.style.visibility = "hidden";
  setTimeout(function () {
    root.style.visibility = "";
  }, 4000);
})();`;
