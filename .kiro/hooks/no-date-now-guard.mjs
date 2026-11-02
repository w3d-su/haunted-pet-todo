import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RULE = "haunted/no-wall-clock";

function fromStdin(raw) {
  if (!raw) return "";
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("no-date-now-guard: expected JSON on stdin with event.file_path");
    process.exit(1);
  }
  const candidate = payload?.event?.file_path;
  return typeof candidate === "string" ? candidate.trim() : "";
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

// CLI arg (Kiro {{filePath}}), then KIRO_FILE_PATH, then stdin JSON.
const fromArg = process.argv[2]?.trim() ?? "";
const fromEnv = process.env.KIRO_FILE_PATH?.trim() ?? "";
const filePath = fromArg || fromEnv || fromStdin(fromArg || fromEnv ? "" : await readStdin());

if (!filePath) {
  console.error(
    "no-date-now-guard: missing file path (argument, KIRO_FILE_PATH, or stdin event.file_path)",
  );
  process.exit(1);
}

const eslint = new ESLint({ cwd: root });
let results;
try {
  results = await eslint.lintFiles([path.resolve(filePath)]);
} catch (error) {
  const message = error instanceof Error ? error.message : "eslint failed";
  console.error(`no-date-now-guard: ${message}`);
  process.exit(1);
}

let failed = false;
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== RULE && !message.fatal) continue;
    failed = true;
    const line = message.line ?? 1;
    console.error(`no-date-now-guard: ${filePath}:${line} ${message.message}`);
  }
}

if (failed) process.exit(1);
