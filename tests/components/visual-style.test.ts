import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/** The visual-style hook's font rule, including the date-field exception. */
function fontViolations(css: string, allowDateField: boolean): string[] {
  const lines = css.split("\n");
  let media = "";
  let selector = "";
  const violations: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const mediaMatch = line.match(/@media\s*\(([^)]+)\)/);
    if (mediaMatch) media = mediaMatch[1] ?? "";
    if (line.includes("{") && !line.includes("@media")) {
      const before = line.slice(0, line.indexOf("{")).trim();
      if (before.length > 0) selector = before;
    }
    const family = line.match(/font-family:\s*([^;]+)/);
    if (!family) continue;
    const value = family[1] ?? "";
    if (value.includes("Press Start") || value.includes("--font-press-start")) continue;
    const dateException =
      allowDateField &&
      media.replace(/\s/g, "") === "max-width:389px" &&
      selector.includes('input[type="datetime-local"]') &&
      value.includes("ui-sans-serif");
    if (dateException) continue;
    violations.push(`${index + 1}: ${value.trim()}`);
  }
  return violations;
}

it("visual-style check does not flag the native date field below 389px", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const steering = readFileSync(".kiro/steering/visual-style.md", "utf8");
  const hook = JSON.parse(readFileSync(".kiro/hooks/visual-style-check.json", "utf8")) as {
    hooks: { action: { prompt: string } }[];
  };
  const prompt = hook.hooks[0]?.action.prompt ?? "";
  const documented =
    steering.includes("ui-sans-serif") &&
    steering.includes("below 389px") &&
    prompt.includes("do not flag") &&
    prompt.includes("389px") &&
    prompt.includes("datetime-local");

  expect(documented).toBe(true);
  expect(fontViolations(css, documented)).toEqual([]);
  const flagged = fontViolations(`${css}\n.other { font-family: Comic Sans; }\n`, documented);
  expect(flagged).toHaveLength(1);
  expect(flagged[0]).toContain("Comic Sans");
});
