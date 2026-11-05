"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { isLocale } from "@/lib/i18n/locale";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="max-w-full">
      <label className="visually-hidden" htmlFor="language">
        {t.locale.label}
      </label>
      <select
        id="language"
        className={`max-w-full border-2 border-ghost-white bg-bg-panel px-2 py-2 text-[10px] leading-relaxed text-ghost-white [color-scheme:dark] ${focus}`}
        value={locale}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) setLocale(next);
        }}
      >
        <option value="en">{t.locale.english}</option>
        <option value="zh-TW">{t.locale.traditionalChinese}</option>
      </select>
    </div>
  );
}
