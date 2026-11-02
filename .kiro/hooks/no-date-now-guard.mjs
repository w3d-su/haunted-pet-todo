import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eslintBin = path.join(root, "node_modules", ".bin", "eslint");
const RULE = "haunted/no-wall-clock";

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

// CLI arg (Kiro {{filePath}}), then KIRO_FILE_PATH, then stdin JSON.
const fromArg = usable(process.argv[2]);
const fromEnv = usable(process.env.KIRO_FILE_PATH);
const filePath = fromArg || fromEnv || pathFromStdin(fromArg || fromEnv ? "" : await readStdin());

if (!filePath) {
  warn("no file path (argument, KIRO_FILE_PATH, or stdin filePath)");
  process.exit(0);
}

const resolved = path.resolve(filePath);
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
  eslintBin,
  ["--format", "json", "--stdin", "--stdin-filename", "src/lib/game/hook-target.ts"],
  { cwd: root, encoding: "utf8", input: source },
);

if (result.error) {
  console.error(`no-date-now-guard: ${result.error.message}`);
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
