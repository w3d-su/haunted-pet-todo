import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

async function typescriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await typescriptFiles(full)));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

it("src/lib/game does not call Date.now or new Date", async () => {
  const files = await typescriptFiles(path.resolve("src/lib/game"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    expect(source, file).not.toMatch(/Date\.now\(/);
    expect(source, file).not.toMatch(/new Date\(/);
    expect(source, file).not.toMatch(/globalThis\.Date/);
  }
});
