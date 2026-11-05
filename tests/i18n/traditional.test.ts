import { expect, it } from "vitest";
import { isTraditionalChinese } from "@/lib/i18n/traditional";

it("rejects Simplified Chinese and pure English", () => {
  expect(isTraditionalChinese("写报告并检查数据")).toBe(false);
  expect(isTraditionalChinese("Please finish the report")).toBe(false);
  expect(isTraditionalChinese("")).toBe(false);
});

it("accepts Traditional Chinese that names things in English", () => {
  expect(isTraditionalChinese("和 Alice 一起檢查 GitHub Actions 報告")).toBe(true);
  expect(isTraditionalChinese("喔，這件很大")).toBe(true);
  expect(isTraditionalChinese("請用台灣慣用的繁體中文")).toBe(true);
});

it("accepts everyday Taiwan words that OpenCC rewrites glyph by glyph", () => {
  for (const word of ["去游泳", "批准申請", "占用時間", "汙染和污染", "岩石", "上傳照片", "雇用", "拜託與托兒"]) {
    expect(isTraditionalChinese(word)).toBe(true);
  }
});

it("still rejects glyphs that mark Simplified text", () => {
  for (const word of ["听音乐", "坏掉了", "这是什么"]) {
    expect(isTraditionalChinese(word)).toBe(false);
  }
});

it("rejects an English sentence that only quotes Chinese", () => {
  expect(isTraditionalChinese("Here lies 報告")).toBe(false);
  expect(isTraditionalChinese("Here lies 寫季度報告書", ["寫季度報告書"])).toBe(false);
});

it("ignores the player's own text in either direction", () => {
  expect(isTraditionalChinese("別再拖延「写报告」了", ["写报告"])).toBe(true);
  expect(isTraditionalChinese("別再拖延 Finish the quarterly report 了", ["Finish the quarterly report"])).toBe(true);
  expect(isTraditionalChinese("别再拖延「报告」了", ["报告"])).toBe(false);
});
