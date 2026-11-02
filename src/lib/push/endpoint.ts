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

function hostAllowed(host: string): boolean {
  return PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** https only, and only a known push host. A string prefix is not a match. */
export function allowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.length === 0 || host === "localhost") return false;
  return hostAllowed(host);
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
