/**
 * Simplified forms that are not the ordinary Traditional glyph.
 * Shared characters (的, 一, 是) are left out on purpose.
 */
const SIMPLIFIED_ONLY = "这来时个对会说现发经还过问门东车长书买儿头体无开关电马国们为从实";

/**
 * True when the text is mostly Han and does not use simplified-only glyphs.
 * English fails the Han ratio. A Traditional line that quotes an English
 * task name still passes.
 */
export function isTraditionalChinese(text: string): boolean {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (han === 0) return false;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (han / (han + latin) < 0.4) return false;
  for (const glyph of SIMPLIFIED_ONLY) {
    if (text.includes(glyph)) return false;
  }
  return true;
}
