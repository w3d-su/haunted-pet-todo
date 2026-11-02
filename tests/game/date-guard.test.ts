import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

function runDateGuard(filePath: string, raw = JSON.stringify({ event: { file_path: filePath } })) {
  return spawnSync(process.execPath, [".kiro/hooks/no-date-now-guard.mjs"], {
    input: raw,
    encoding: "utf8",
    env: { ...process.env, KIRO_FILE_PATH: path.resolve("src/lib/server/clock.ts") },
  });
}

it("date guard reads event.file_path from stdin and ignores KIRO_FILE_PATH", () => {
  const result = runDateGuard(path.resolve("src/lib/game/clock.ts"));
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
});

it("date guard writes a Date.now violation to stderr and exits 1", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "date-guard-"));
  const file = path.join(dir, "clock.ts");
  writeFileSync(file, "export const leaked = Date.now();\n");
  const result = runDateGuard(file);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/Date\.now\(\)/);
});

it("date guard writes a new Date violation to stderr", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "date-guard-"));
  const file = path.join(dir, "clock.ts");
  writeFileSync(file, "export const leaked = new Date();\n");
  const result = runDateGuard(file);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/new Date\(\)/);
});

it("date guard fails closed when event.file_path is missing", () => {
  const result = runDateGuard("", "{}");
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/event\.file_path/);
});
