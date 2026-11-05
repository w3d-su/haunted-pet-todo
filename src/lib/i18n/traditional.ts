import { Converter } from "opencc-js/cn2t";

/**
 * Checked one at a time, OpenCC rewrites these Traditional glyphs too
 * (台灣 → 臺灣, 公里 → 公裡, 游泳 → 遊泳, 批准 → 批準). They are everyday Taiwan
 * usage, not Simplified. The list comes from Big5 level 1. Its other rewritten
 * glyphs (听, 坏, 儿, 么, ...) stay rejected because they mark Simplified text.
 */
const TRADITIONAL_VARIANTS = new Set(
  "台里后干裏丑尸凶斗占划吁托朴污佣余杠岩岳征杰泄肴虱采咨咸挂苧范郁准栗涌祕荐脣喫游腌雇辟檐癡纔",
);

const toTraditional = Converter({ from: "cn", to: "tw" });

/** A Han character OpenCC would rewrite, other than a Traditional variant. */
function containsSimplified(text: string): boolean {
  for (const glyph of text) {
    if (TRADITIONAL_VARIANTS.has(glyph)) continue;
    if (toTraditional(glyph) !== glyph) return true;
  }
  return false;
}

function withoutQuoted(text: string, quoted: readonly string[]): string {
  return quoted
    .filter((value) => value.length > 0)
    .sort((a, b) => b.length - a.length)
    .reduce((rest, value) => rest.replaceAll(value, " "), text);
}

/**
 * Traditional Chinese for model replies. `quoted` is the player's own text,
 * such as task titles. It is ignored, so a title in any language neither
 * passes nor fails the reply. Han characters must then outnumber Latin words:
 * a sentence may name "GitHub", but "Here lies 報告" is still English.
 */
export function isTraditionalChinese(text: string, quoted: readonly string[] = []): boolean {
  const own = withoutQuoted(text, quoted);
  const han = own.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latinWords = own.match(/[A-Za-z]+/g)?.length ?? 0;
  if (han <= latinWords) return false;
  return !containsSimplified(own);
}
