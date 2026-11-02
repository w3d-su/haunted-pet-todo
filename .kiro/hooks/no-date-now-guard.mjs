import { readFileSync } from "node:fs";

// The save hook passes `{ event: { file_path } }` on stdin.
// The path is not taken from $KIRO_FILE_PATH.

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString("utf8").trim();

let filePath = "";
try {
  const payload = JSON.parse(raw);
  const candidate = payload?.event?.file_path;
  if (typeof candidate === "string") filePath = candidate;
} catch {
  console.error("no-date-now-guard: expected JSON on stdin with event.file_path");
  process.exit(1);
}

if (filePath.length === 0) {
  console.error("no-date-now-guard: missing event.file_path");
  process.exit(1);
}

let source = "";
try {
  source = readFileSync(filePath, "utf8");
} catch {
  console.error(`no-date-now-guard: cannot read ${filePath}`);
  process.exit(1);
}

const hits = [];
if (source.includes("Date.now(")) hits.push("Date.now()");
if (source.includes("new Date(")) hits.push("new Date()");
if (source.includes("globalThis.Date")) hits.push("globalThis.Date");

if (hits.length > 0) {
  console.error(
    `no-date-now-guard: ${filePath} uses ${hits.join(", ")}. Pass a now: number or a Clock.`,
  );
  process.exit(1);
}
