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
