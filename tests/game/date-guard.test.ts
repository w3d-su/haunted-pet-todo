import { spawnSync } from "node:child_process";
import { Linter } from "eslint";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import noWallClock from "../../eslint/no-wall-clock.mjs";
import { eslintBinPath, eslintFailed, isInsideRepo } from "../../.kiro/hooks/no-date-now-guard.mjs";

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
  delete env.NODE_PATH;
  delete env.KIRO_FILE_PATH;
  if (filePath) env.KIRO_FILE_PATH = filePath;
  return env;
}

function runDateGuard(options: {
  args?: string[];
  input?: string;
  envPath?: string;
  cwd?: string;
  eslint?: string;
}) {
  const env = hookEnv(options.envPath);
  if (options.eslint) env.NO_DATE_NOW_ESLINT = options.eslint;
  return spawnSync(process.execPath, [path.resolve(".kiro/hooks/no-date-now-guard.mjs"), ...(options.args ?? [])], {
    input: options.input ?? "",
    encoding: "utf8",
    env,
    cwd: options.cwd,
  });
}

function fakeEslint(body: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "date-guard-eslint-"));
  const file = path.join(dir, "eslint");
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);
  return { dir, file };
}

const linter = new Linter({ configType: "flat" });
const wallClockConfig = [
  {
    files: ["**/*"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { haunted: { rules: { "no-wall-clock": noWallClock } } },
    rules: { "haunted/no-wall-clock": "error" },
  },
];

function wallClockMessages(code: string) {
  return linter
    .verify(code, wallClockConfig as Parameters<Linter["verify"]>[1])
    .filter((message) => message.ruleId === "haunted/no-wall-clock");
}

it("wall clock rule flags computed access, spacing, new Date, aliases, and global prefixes", () => {
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
    "const D = Date;\nexport const kept = D;\n",
  ];
  for (const code of violations) {
    expect(wallClockMessages(code), code).not.toEqual([]);
  }
});

it("wall clock rule flags self.Date, unbound now, and aliases of the global objects", () => {
  const cases: Array<[string, RegExp]> = [
    ["export const n = new self.Date();\n", /new Date/],
    ["export const n = self.Date;\n", /self\.Date/],
    ["export const n = self['Date'];\n", /self\.Date/],
    ["export const n = self.Date.now();\n", /Date\.now\(\)/],
    ["const n = Date.now;\nexport const called = n();\n", /Date/],
    ["export const n = Date.now.call(null);\n", /Date/],
    ["export const n = Date['now'];\n", /Date/],
    ["const w = window;\nexport const n = w.Date.now();\n", /Date\.now\(\)/],
    ["const g = globalThis;\nexport const n = new g.Date();\n", /new Date/],
    ["const s = self;\nexport const n = s.Date;\n", /Date/],
    ["const s = self;\nexport const n = new s.Date();\n", /new Date/],
    ["const w = window;\nconst D = w.Date;\nexport const n = D.now();\n", /Date\.now\(\)/],
    ["const outer = globalThis;\nconst inner = outer;\nexport const n = new inner.Date();\n", /new Date/],
    ["export const bag = { Date };\n", /Date/],
  ];
  for (const [code, pattern] of cases) {
    const messages = wallClockMessages(code);
    expect(messages, code).not.toEqual([]);
    expect(
      messages.some((message) => pattern.test(message.message)),
      code,
    ).toBe(true);
  }
});

it("wall clock rule reports a direct Date.now() call once", () => {
  for (const code of ["export const n = Date['now']();\n", "export const n = Date.now();\n"]) {
    const messages = wallClockMessages(code);
    expect(messages, code).toHaveLength(1);
    expect(messages[0]?.message, code).toMatch(/Date\.now\(\)/);
  }
});

it("wall clock rule ignores instanceof Date, Date keys, and shadowed globals", () => {
  const clean = [
    "export function check(value) { return value instanceof Date; }\n",
    "export function check(value) { return value instanceof self.Date; }\n",
    "export const bag = { Date: 1 };\n",
    "export function take(bag) { const { Date: renamed } = bag; return renamed; }\n",
    "function take(window) { return new window.Date(); }\n",
    "const w = window;\nexport const n = w.now();\n",
    "const g = globalThis;\nexport const n = g.now();\n",
    "const s = self;\nexport const n = s.now();\n",
  ];
  for (const code of clean) {
    expect(wallClockMessages(code), code).toEqual([]);
  }
});

it("wall clock rule flags Date destructured from a global object", () => {
  const cases = [
    "const { Date: D } = globalThis;\nexport const n = D.now();\n",
    "const { Date: D } = window;\nexport const n = D.now();\n",
    "const { Date: D } = self;\nexport const n = D.now();\n",
    "const g = globalThis;\nconst { Date: D } = g;\nexport const n = D.now();\n",
    "let G2;\nG2 = globalThis;\nconst { Date: D } = G2;\nexport const n = D.now();\n",
    "let G2;\nG2 = window;\nexport const n = new G2.Date();\n",
    "let G2;\nG2 = self;\nexport const n = G2.Date.now();\n",
  ];
  for (const code of cases) {
    expect(wallClockMessages(code), code).not.toEqual([]);
  }
});

it("wall clock rule ignores comments, strings, Date.UTC, and Date.parse", () => {
  const clean = [
    "export const note = \"Date.now()\";\nexport const also = 'new Date';\n",
    "// Date.now()\n/* new Date() */\nexport const templated = `Date['now']()`;\n",
    "export const utc = Date.UTC(2026, 0, 1);\n",
    "export const parsed = Date.parse(\"2026-01-01T00:00:00.000Z\");\n",
    "export const utc = globalThis.Date.UTC(2026, 0, 1);\n",
    "export const parsed = window.Date.parse(\"2026-01-01T00:00:00.000Z\");\n",
    "export const parsed = self.Date.parse(\"2026-01-01T00:00:00.000Z\");\n",
    "const g = globalThis;\nexport const utc = g.Date.UTC(2026, 0, 1);\n",
    "let G2;\nG2 = globalThis;\nexport const parsed = G2.Date.parse(\"2026-01-01T00:00:00.000Z\");\n",
  ];
  for (const code of clean) {
    expect(wallClockMessages(code), code).toEqual([]);
  }
});

it(
  "date guard accepts a clean game file",
  () => {
    const result = runDateGuard({ args: [clockFile] });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  },
  30_000,
);

it(
  "date guard reports the shared rule on stderr for a computed Date.now",
  () => {
  const dir = mkdtempSync(path.join(process.cwd(), ".date-guard-"));
  const file = path.join(dir, "leaky.ts");
  try {
    writeFileSync(file, "export const leaked = Date['now']();\n");
    const result = runDateGuard({ args: [file] });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Date\.now\(\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
},
  30_000,
);

it("date guard treats eslint status 2, or a nonzero empty stdout, as failure", () => {
  const bin = eslintBinPath(path.resolve("."));
  expect(bin.replaceAll("\\", "/")).toMatch(/eslint\/bin\/eslint\.js$/);
  expect(existsSync(bin)).toBe(true);
  expect(isInsideRepo(path.resolve("."), "src/lib/game/clock.ts")).toBe(true);
  expect(isInsideRepo(path.resolve("."), path.resolve("src/lib/game/clock.ts"))).toBe(true);
  expect(isInsideRepo(path.resolve("."), path.join(tmpdir(), "leak.ts"))).toBe(false);
  expect(eslintFailed(2, "[]")).toBe(true);
  expect(eslintFailed(2, "")).toBe(true);
  expect(eslintFailed(1, "")).toBe(true);
  expect(eslintFailed(1, " \n")).toBe(true);
  expect(eslintFailed(1, "[]")).toBe(false);
  expect(eslintFailed(0, "")).toBe(false);
  expect(eslintFailed(null, "")).toBe(false);
});

it(
  "date guard prints eslint stderr and exits 1 when eslint crashes",
  () => {
    const crashed = fakeEslint("process.stdout.write('[]'); process.stderr.write('eslint: fatal\\n'); process.exit(2);");
    const empty = fakeEslint("process.stderr.write('eslint: no json\\n'); process.exit(1);");
    try {
      const statusTwo = runDateGuard({ args: [clockFile], eslint: crashed.file });
      expect(statusTwo.status).toBe(1);
      expect(statusTwo.stdout).toBe("");
      expect(statusTwo.stderr).toMatch(/eslint: fatal/);

      const emptyStdout = runDateGuard({ args: [clockFile], eslint: empty.file });
      expect(emptyStdout.status).toBe(1);
      expect(emptyStdout.stdout).toBe("");
      expect(emptyStdout.stderr).toMatch(/eslint: no json/);
    } finally {
      rmSync(crashed.dir, { recursive: true, force: true });
      rmSync(empty.dir, { recursive: true, force: true });
    }
  },
  30_000,
);

it(
  "date guard resolves a relative path from the repo root",
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "date-guard-cwd-"));
    try {
      const result = runDateGuard({ args: ["src/lib/game/clock.ts"], cwd: dir });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

it(
  "date guard warns and exits 0 for a file outside the repo",
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "date-guard-outside-"));
    const file = path.join(dir, "leaky.ts");
    try {
      writeFileSync(file, "export const leaked = Date.now();\n");
      const result = runDateGuard({ args: [file] });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/outside the repo/);
      expect(result.stderr).not.toMatch(/Date\.now\(\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

it(
  "date guard warns and exits 0 when the path is missing, blank, unexpanded, or absent",
  () => {
  const cases = [
    runDateGuard({ input: "{}" }),
    runDateGuard({ args: ["   "] }),
    runDateGuard({ args: ["{{filePath}}"] }),
    runDateGuard({ args: [path.join(tmpdir(), "missing-game-file.ts")] }),
  ];
  for (const result of cases) {
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/no-date-now-guard: warning:/);
  }
},
  30_000,
);
