import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { fallbackBreakdown } from "@/lib/ai/breakdown";
import { buildNagPrompt } from "@/lib/ai/nag";
import { en } from "@/lib/i18n/en";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import {
  htmlLang,
  initialLocale,
  LOCALE_BOOT_SCRIPT,
  localeFromBrowserLanguage,
} from "@/lib/i18n/locale";
import { zhTW } from "@/lib/i18n/zh-TW";
import { FALLBACK_EPITAPH } from "@/lib/game/pet";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "function" || value === null || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): unknown[] {
  if (typeof value === "function" || value === null || typeof value !== "object") return [value];
  return Object.values(value).flatMap((child) => leafValues(child));
}

it("gives en and zh-TW exactly the same keys and no empty values", () => {
  const english = leafPaths(en);
  const chinese = leafPaths(zhTW);
  expect(chinese).toEqual(english);
  expect(new Set(english).size).toBe(english.length);

  for (const value of [...leafValues(en), ...leafValues(zhTW)]) {
    expect(typeof value === "function" || typeof value === "string").toBe(true);
    if (typeof value === "string") expect(value.trim().length).toBeGreaterThan(0);
  }

  const englishErrors = Object.values(en.errors);
  expect(new Set(englishErrors).size).toBe(englishErrors.length);
});

it("keeps the English epitaph fallback identical to the stored game line", () => {
  expect(en.epitaph.fallback).toBe(FALLBACK_EPITAPH);
  expect(zhTW.epitaph.fallback).not.toBe(FALLBACK_EPITAPH);
});

it("maps zh-*, zh-Hant, and en, and lets a saved choice win", () => {
  for (const tag of ["zh", "zh-TW", "zh-CN", "zh-HK", "zh-Hant", "zh-Hant-TW", "zh-Hans", "ZH-hant", "zh_Hant"]) {
    expect(localeFromBrowserLanguage(tag)).toBe("zh-TW");
  }
  for (const tag of ["en", "en-US", "en-GB", "ja", "fr", "de", ""]) {
    expect(localeFromBrowserLanguage(tag)).toBe("en");
  }
  expect(initialLocale(null, "zh-Hant")).toBe("zh-TW");
  expect(initialLocale(null, "en-US")).toBe("en");
  expect(initialLocale("zh-TW", "en-US")).toBe("zh-TW");
  expect(initialLocale("en", "zh-TW")).toBe("en");
  expect(initialLocale("nope", "zh-CN")).toBe("zh-TW");
  expect(htmlLang("en")).toBe("en");
  expect(htmlLang("zh-TW")).toBe("zh-Hant-TW");
});

it("boots the same locale the detector would, and hides a non-English document", () => {
  function boot(language: string, stored: string | null) {
    const root = {
      lang: "",
      dataset: {} as { locale?: string },
      style: { visibility: "" },
    };
    const document = { documentElement: root, title: "" };
    const storage = new Map<string, string>();
    if (stored !== null) storage.set("haunted-locale", stored);
    const context = vm.createContext({
      document,
      navigator: { language },
      localStorage: { getItem: (key: string) => storage.get(key) ?? null },
      setTimeout: () => 0,
    });
    vm.runInContext(LOCALE_BOOT_SCRIPT, context);
    return { lang: root.lang, locale: root.dataset.locale, title: document.title, visibility: root.style.visibility };
  }

  expect(boot("zh-Hant-TW", null)).toMatchObject({
    lang: "zh-Hant-TW",
    locale: "zh-TW",
    title: zhTW.meta.title,
    visibility: "hidden",
  });
  expect(boot("en-US", null)).toMatchObject({
    lang: "en",
    locale: "en",
    title: en.meta.title,
    visibility: "",
  });
  expect(boot("zh-TW", "en").locale).toBe("en");
  expect(boot("en-US", "zh-TW").locale).toBe("zh-TW");
  expect(LOCALE_BOOT_SCRIPT).toContain(en.meta.title);
  expect(LOCALE_BOOT_SCRIPT).toContain(zhTW.meta.title);
});

it("keeps Chinese nag, speech, and breakdown fallbacks inside their limits", () => {
  const copy = dictionaryFor("zh-TW");
  const lines = [
    copy.speech.hatchling.overdue,
    copy.speech.hatchling.hungry,
    copy.speech.hatchling.celebrate,
    copy.speech.hatchling.ask,
    copy.speech.adult.haunting("回信給全部的人"),
    copy.speech.adult.dramatic,
    copy.speech.adult.gentle,
    copy.speech.adult.hungry,
    copy.speech.adult.mood,
    copy.speech.adult.evolved,
    copy.speech.adult.happy,
    ...(["gentle", "dramatic", "haunting"] as const).map((level) =>
      buildNagPrompt(
        { stage: "adult" },
        [{ title: "寫完報告", status: "overdue", deletedAt: null }],
        level,
        "zh-TW",
      ),
    ),
    buildNagPrompt({ stage: "hatchling" }, [], "gentle", "zh-TW"),
  ];
  for (const line of lines) {
    expect(line.length).toBeGreaterThan(0);
    expect(line.length).toBeLessThanOrEqual(140);
  }
  expect(buildNagPrompt({ stage: "adult" }, [{ title: "寫完報告", status: "todo", deletedAt: null }], "haunting", "zh-TW")).toContain(
    "寫完報告",
  );

  const body = fallbackBreakdown({ title: "寫研究報告" }, "zh-TW");
  expect(body.intro.length).toBeLessThanOrEqual(140);
  expect(body.subtasks.every((line) => line.length <= 80 && line.length > 0)).toBe(true);
});

it("floors Traditional Chinese at 14px and names a CJK fallback", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).toContain('html[lang="zh-Hant-TW"]');
  expect(css).toContain("max(14px, calc(8px * var(--pixel-scale)))");
  expect(css).toContain('"PingFang TC"');
  expect(css).toContain('"Noto Sans TC"');
  expect(css).toContain('"Microsoft JhengHei"');
  const worker = readFileSync("public/sw.js", "utf8");
  expect(worker).toContain(zhTW.meta.title);
  expect(worker).toContain(zhTW.push.waiting);
  expect(worker).toContain(en.push.waiting);
});
