import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RULE = "haunted/no-wall-clock";

/** ESLint's JS entry, resolved from the repo so the path is the same on every OS. */
export function eslintBinPath(repoRoot) {
  const require = createRequire(path.join(repoRoot, "package.json"));
  const pkgPath = require.resolve("eslint/package.json");
  const binField = JSON.parse(readFileSync(pkgPath, "utf8")).bin;
  const relative = typeof binField === "string" ? binField : binField?.eslint;
  if (typeof relative !== "string") throw new Error("eslint bin missing");
  return path.resolve(path.dirname(pkgPath), relative);
}

/**
 * pnpm does not hoist ESLint's plugins. These are the directories the
 * `.bin` shim would put on NODE_PATH, passed as an env var instead of a shell.
 */
export function eslintModulePaths(binPath) {
  // bin/eslint.js -> package -> the node_modules that holds it -> the pnpm store node_modules.
  const packageDir = path.dirname(path.dirname(binPath));
  const candidates = [
    path.join(packageDir, "node_modules"),
    path.dirname(packageDir),
    path.join(path.dirname(path.dirname(path.dirname(packageDir))), "node_modules"),
  ];
  return candidates.filter((dir, index) => existsSync(dir) && candidates.indexOf(dir) === index);
}

/** ESLint status 2 is a crash. Any other nonzero status with no JSON is one too. */
export function eslintFailed(status, stdout) {
  if (status === 2) return true;
  const text = typeof stdout === "string" ? stdout.trim() : "";
  return typeof status === "number" && status !== 0 && text.length === 0;
}

export function isInsideRepo(repoRoot, candidate) {
  const resolved = path.resolve(repoRoot, candidate);
  const relative = path.relative(repoRoot, resolved);
  if (relative === "" || relative === ".") return true;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
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

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

function runEslint(source) {
  // Tests point NO_DATE_NOW_ESLINT at a stand-in script. Node runs it directly, never a shell.
  const override = process.env.NO_DATE_NOW_ESLINT;
  const script = override || eslintBinPath(root);
  const env = { ...process.env };
  if (!override) {
    const extra = eslintModulePaths(script).join(path.delimiter);
    if (extra) env.NODE_PATH = env.NODE_PATH ? `${extra}${path.delimiter}${env.NODE_PATH}` : extra;
  }
  return spawnSync(
    process.execPath,
    [script, "--format", "json", "--stdin", "--stdin-filename", "src/lib/game/hook-target.ts"],
    { cwd: root, encoding: "utf8", input: source, env },
  );
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
  if (!isInsideRepo(root, resolved)) {
    warn(`path is outside the repo: ${filePath}`);
    process.exit(0);
  }
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

  // stdin-filename puts the contents under the game-core rule even for a temp path inside the repo.
  let result;
  try {
    result = runEslint(source);
  } catch (error) {
    console.error(`no-date-now-guard: ${error.message}`);
    process.exit(1);
  }

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
