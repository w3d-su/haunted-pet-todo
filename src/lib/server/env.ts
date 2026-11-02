/** Bracket access so Next does not inline the value at build time. */
export function serverEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Server-only. Not a `NEXT_PUBLIC_` flag, so the client bundle cannot turn it on. */
export function demoModeEnabled(): boolean {
  return serverEnv("DEMO_MODE") === "true";
}
