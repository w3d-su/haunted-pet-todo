/** Quote a user-supplied string so it cannot break out of a prompt line. */
export function quoteForPrompt(value: string, max = 80): string {
  return value.replace(/[\r\n\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
