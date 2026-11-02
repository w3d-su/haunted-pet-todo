import { spawnSync } from "node:child_process";
import { ESLint } from "eslint";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const clockFile = path.resolve("src/lib/game/clock.ts");

function hookEnv(filePath?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.KIRO_FILE_PATH;
  if (filePath) env.KIRO_FILE_PATH = filePath;
  return env;
}

function runDateGuard(options: { args?: string[]; input?: string; envPath?: string }) {
  return spawnSync(process.execPath, [".kiro/hooks/no-date-now-guard.mjs", ...(options.args ?? [])], {
    input: options.input ?? "",
    encoding: "utf8",
    env: hookEnv(options.envPath),
  });
}

async function wallClockMessages(code: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: "src/lib/game/fixture.ts" });
  return (result?.messages ?? []).filter((message) => message.ruleId === "haunted/no-wall-clock");
}

it("wall clock rule flags computed access, spacing, new Date, aliases, and global prefixes", async () => {
  const violations = [
    "export const n = Date.now();\n",
    "export const n = Date['now']();\n",
    "export const n = Date.now ();\n",
    "export const n = new Date;\n",
    "export const n = new Date();\n",
    "const D = Date;\nexport const n = D.now();\n",
    "const D = Date;\nexport const n = new D;\n",
    "export const n = window.Date.now();\n",
    "export const n = globalThis.Date;\n",
  ];
  for (const code of violations) {
    expect(await wallClockMessages(code), code).not.toEqual([]);
  }
});

it("wall clock rule ignores comments, strings, and an unused alias", async () => {
  const clean = [
    "export const note = \"Date.now()\";\nexport const also = 'new Date';\n",
    "// Date.now()\n/* new Date() */\nexport const templated = `Date['now']()`;\n",
    "const D = Date;\nexport const kept = D;\n",
  ];
  for (const code of clean) {
    expect(await wallClockMessages(code), code).toEqual([]);
  }
});

it("date guard accepts the path from a CLI arg, an env var, or stdin JSON", () => {
  const clean = { status: 0, stdout: "", stderr: "" };
  expect(runDateGuard({ args: [clockFile] })).toMatchObject(clean);
  expect(runDateGuard({ envPath: clockFile })).toMatchObject(clean);
  expect(
    runDateGuard({ input: JSON.stringify({ event: { file_path: clockFile } }) }),
  ).toMatchObject(clean);
});

it("date guard reports the shared rule on stderr for a computed Date.now", () => {
  const dir = mkdtempSync(path.join("src/lib/game", `date-guard-${process.pid}-`));
  const file = path.join(dir, "leaky.ts");
  try {
    writeFileSync(file, "export const leaked = Date['now']();\n");
    const result = runDateGuard({ args: [path.resolve(file)] });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Date\.now\(\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("date guard allows comments and strings that mention the clock", () => {
  const dir = mkdtempSync(path.join("src/lib/game", `date-guard-clean-${process.pid}-`));
  const file = path.join(dir, "comment.ts");
  try {
    writeFileSync(file, "// Date.now()\nexport const note = \"new Date()\";\n");
    const result = runDateGuard({ envPath: path.resolve(file) });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("date guard fails closed when no path is provided", () => {
  const result = runDateGuard({ input: "{}" });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/file path/);
});
