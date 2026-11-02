import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

it("src/lib/game does not call Date.now or new Date", async () => {
  const dir = path.resolve("src/lib/game");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".ts"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const source = await readFile(path.join(dir, file), "utf8");
    expect(source, file).not.toMatch(/Date\.now\(/);
    expect(source, file).not.toMatch(/new Date\(/);
  }
});
