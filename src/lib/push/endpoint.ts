import { parse as parseLegacyUrl } from "node:url";

/** Hosts a browser push service actually uses. Match the parsed hostname only. */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "web.push.apple.com",
] as const;

export const MAX_PUSH_SUBSCRIPTIONS = 5;
export const P256DH_BYTES = 65;
export const AUTH_BYTES = 16;

const HOST_CHARS = /^[a-z0-9.-]+$/;

function hostAllowed(host: string): boolean {
  return PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function portEmpty(port: string | null | undefined): boolean {
  return port == null || port === "";
}

/**
 * https only, and only a known push host.
 * web-push 3.6.7 connects with legacy `url.parse`, which disagrees with
 * WHATWG `new URL` on `;` and `%2e`. Both parsers must name the same host,
 * the host may contain only letters, digits, dots, and hyphens, and neither
 * parser may see an explicit port.
 */
export function allowedPushEndpoint(endpoint: string): boolean {
  let modern: URL;
  try {
    modern = new URL(endpoint);
  } catch {
    return false;
  }
  if (modern.protocol !== "https:") return false;
  if (modern.username !== "" || modern.password !== "") return false;
  if (!portEmpty(modern.port)) return false;

  const legacy = parseLegacyUrl(endpoint);
  if (legacy.protocol !== "https:") return false;
  if (!portEmpty(legacy.port)) return false;
  if (legacy.hostname !== modern.hostname) return false;

  const host = modern.hostname;
  if (!HOST_CHARS.test(host) || host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
    return false;
  }
  return hostAllowed(host);
}

/** Canonical href after the allowlist check. Store and send this, not the raw input. */
export function normalizedPushEndpoint(endpoint: string): string | null {
  if (!allowedPushEndpoint(endpoint)) return null;
  return new URL(endpoint).href;
}

/** Byte length of a base64url string, or null when it is not base64url. */
export function base64UrlByteLength(value: string): number | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const decoded = Buffer.from(`${value}${pad}`, "base64url");
  return decoded.length;
}

export function validPushKeys(p256dh: string, auth: string): boolean {
  return base64UrlByteLength(p256dh) === P256DH_BYTES && base64UrlByteLength(auth) === AUTH_BYTES;
}
