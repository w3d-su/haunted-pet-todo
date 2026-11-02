import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RULE = "haunted/no-wall-clock";

export function eslintExecutable(platform = process.platform) {
  return platform === "win32" ? "eslint.cmd" : "eslint";
}

/** ESLint status 2 is a crash. Any other nonzero status with no JSON is one too. */
export function eslintFailed(status, stdout) {
  if (status === 2) return true;
  const text = typeof stdout === "string" ? stdout.trim() : "";
  return typeof status === "number" && status !== 0 && text.length === 0;
}

function warn(message) {
  console.error(`no-date-now-guard: warning: ${message}`);
}

function usable(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("{{")) return "";
  return trimmed;
}

function pathFromStdin(raw) {
  if (!raw) return "";
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return "";
  }
  const event = payload?.event;
  return usable(event?.file_path) || usable(event?.filePath) || usable(payload?.filePath) || "";
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function eslintCommand() {
  // Tests point this at a stand-in binary. Windows needs the .cmd shim.
  if (process.env.NO_DATE_NOW_ESLINT) return process.env.NO_DATE_NOW_ESLINT;
  return path.join(root, "node_modules", ".bin", eslintExecutable());
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

async function main() {
  // CLI arg (Kiro {{filePath}}), then KIRO_FILE_PATH, then stdin JSON.
  const fromArg = usable(process.argv[2]);
  const fromEnv = usable(process.env.KIRO_FILE_PATH);
  const filePath = fromArg || fromEnv || pathFromStdin(fromArg || fromEnv ? "" : await readStdin());

  if (!filePath) {
    warn("no file path (argument, KIRO_FILE_PATH, or stdin filePath)");
    process.exit(0);
  }

  const resolved = path.resolve(root, filePath);
  if (!existsSync(resolved)) {
    warn(`file not found: ${filePath}`);
    process.exit(0);
  }

  let source = "";
  try {
    source = readFileSync(resolved, "utf8");
  } catch {
    warn(`file not found: ${filePath}`);
    process.exit(0);
  }

  // stdin-filename puts the contents under the game-core rule even for a temp path.
  // The .bin/eslint shim sets NODE_PATH. Importing ESLint from this file does not.
  const result = spawnSync(
    eslintCommand(),
    ["--format", "json", "--stdin", "--stdin-filename", "src/lib/game/hook-target.ts"],
    {
      cwd: root,
      encoding: "utf8",
      input: source,
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    console.error(`no-date-now-guard: ${result.error.message}`);
    process.exit(1);
  }

  if (eslintFailed(result.status, result.stdout)) {
    const detail = typeof result.stderr === "string" ? result.stderr : "";
    console.error(detail.trim() ? detail.trimEnd() : "no-date-now-guard: eslint failed");
    process.exit(1);
  }

  let results;
  try {
    results = JSON.parse(result.stdout || "[]");
  } catch {
    console.error(result.stderr || "no-date-now-guard: eslint did not return JSON");
    process.exit(result.status === 0 ? 1 : result.status ?? 1);
  }

  let failed = false;
  for (const item of results) {
    for (const message of item.messages ?? []) {
      if (message.ruleId !== RULE && !message.fatal) continue;
      failed = true;
      const line = message.line ?? 1;
      console.error(`no-date-now-guard: ${filePath}:${line} ${message.message}`);
    }
  }

  if (failed) process.exit(1);
}

if (isDirectRun()) {
  await main();
}
