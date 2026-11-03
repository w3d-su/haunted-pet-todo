import { Converter } from "opencc-js/cn2t";

/**
 * OpenCC rewrites these Traditional glyphs to another Traditional form
 * (台灣 → 臺灣, 公里 → 公裡). They are everyday Taiwan usage, not Simplified.
 */
const TRADITIONAL_VARIANTS = new Set(["台", "里", "后", "干", "裏"]);

const toTraditional = Converter({ from: "cn", to: "tw" });

/** A Han character OpenCC would rewrite, other than a Traditional variant. */
function containsSimplified(text: string): boolean {
  for (const glyph of text) {
    if (TRADITIONAL_VARIANTS.has(glyph)) continue;
    if (toTraditional(glyph) !== glyph) return true;
  }
  return false;
}

/**
 * Traditional Chinese for model replies. ASCII words are removed first so a
 * Traditional sentence that names "GitHub" is not rejected for its Latin
 * ratio. Any Simplified character OpenCC knows still fails the check.
 */
export function isTraditionalChinese(text: string): boolean {
  const withoutAscii = text.replace(/[A-Za-z0-9]+/g, "");
  const han = withoutAscii.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (han < 1) return false;
  return !containsSimplified(text);
}
