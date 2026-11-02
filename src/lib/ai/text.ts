/** Quote a user-supplied string so it cannot break out of a prompt line. */
export function quoteForPrompt(value: string, max = 80): string {
  return value.replace(/[\r\n\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Drop tags and links so model text is stored and shown as plain words. */
export function plainLine(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Same as `plainLine`, keeping the line breaks an epitaph needs. */
export function plainEpitaph(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => plainLine(line))
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, 200);
}
