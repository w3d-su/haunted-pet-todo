import { expect, it } from "vitest";
import { addressIsBlocked, createPushLookup } from "@/lib/push/agent";
import {
  allowedPushEndpoint,
  base64UrlByteLength,
  normalizedPushEndpoint,
  validPushKeys,
} from "@/lib/push/endpoint";

it("accepts only https hosts from the push services", () => {
  expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
  expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
  expect(allowedPushEndpoint("https://notify.windows.com/w/?token=1")).toBe(true);
  expect(allowedPushEndpoint("https://web.push.apple.com/Q")).toBe(true);
  expect(allowedPushEndpoint("http://169.254.169.254/latest")).toBe(false);
  expect(allowedPushEndpoint("http://localhost/push")).toBe(false);
  expect(allowedPushEndpoint("not-a-url")).toBe(false);
  expect(allowedPushEndpoint("ftp://fcm.googleapis.com/fcm/send/abc")).toBe(false);
  expect(allowedPushEndpoint("https://evilfcm.googleapis.com/fcm/send/abc")).toBe(false);
  expect(allowedPushEndpoint("https://fcm.googleapis.com.attacker.com/fcm/send/abc")).toBe(false);
  expect(allowedPushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/abc")).toBe(false);
  expect(allowedPushEndpoint("https://127.0.0.3;.fcm.googleapis.com/x")).toBe(false);
  expect(allowedPushEndpoint("https://fcm%2egoogleapis%2ecom/x")).toBe(false);
  expect(allowedPushEndpoint("https://fcm.googleapis.com:443/x")).toBe(false);
});

it("normalizes a stored endpoint to the WHATWG href", () => {
  expect(normalizedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(
    "https://fcm.googleapis.com/fcm/send/abc",
  );
  expect(normalizedPushEndpoint("https://127.0.0.3;.fcm.googleapis.com/x")).toBeNull();
  expect(normalizedPushEndpoint("https://fcm%2egoogleapis%2ecom/x")).toBeNull();
});

it("rejects a resolved private address before the push agent connects", () => {
  expect(addressIsBlocked("127.0.0.1")).toBe(true);
  expect(addressIsBlocked("10.1.2.3")).toBe(true);
  expect(addressIsBlocked("192.168.1.1")).toBe(true);
  expect(addressIsBlocked("172.16.0.1")).toBe(true);
  expect(addressIsBlocked("169.254.169.254")).toBe(true);
  expect(addressIsBlocked("0.0.0.0")).toBe(true);
  expect(addressIsBlocked("::1")).toBe(true);
  expect(addressIsBlocked("::")).toBe(true);
  expect(addressIsBlocked("fe80::1")).toBe(true);
  expect(addressIsBlocked("fc00::1")).toBe(true);
  expect(addressIsBlocked("::ffff:127.0.0.1")).toBe(true);
  expect(addressIsBlocked("100.64.0.1")).toBe(true);
  expect(addressIsBlocked("100.127.255.1")).toBe(true);
  expect(addressIsBlocked("198.18.0.1")).toBe(true);
  expect(addressIsBlocked("198.19.255.1")).toBe(true);
  expect(addressIsBlocked("224.0.0.1")).toBe(true);
  expect(addressIsBlocked("240.0.0.1")).toBe(true);
  expect(addressIsBlocked("255.255.255.255")).toBe(true);
  expect(addressIsBlocked("64:ff9b::1")).toBe(true);
  expect(addressIsBlocked("64:ff9b::8.8.8.8")).toBe(true);
  expect(addressIsBlocked("2002::1")).toBe(true);
  expect(addressIsBlocked("::127.0.0.1")).toBe(true);
  expect(addressIsBlocked("::7f00:1")).toBe(true);
  expect(addressIsBlocked("8.8.8.8")).toBe(false);
  expect(addressIsBlocked("1.1.1.1")).toBe(false);
  expect(addressIsBlocked("100.128.0.1")).toBe(false);
  expect(addressIsBlocked("2001:4860:4860::8888")).toBe(false);

  const lookup = createPushLookup(((
    _hostname: string,
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    callback(null, "127.0.0.1", 4);
  }) as never);
  lookup("fcm.googleapis.com", {}, (err) => {
    expect(err).toBeTruthy();
    expect(err?.code).toBe("EBLOCKED");
  });
});

it("measures base64url key sizes", () => {
  const p256dh = Buffer.alloc(65, 1).toString("base64url");
  const auth = Buffer.alloc(16, 2).toString("base64url");
  expect(base64UrlByteLength(p256dh)).toBe(65);
  expect(base64UrlByteLength(auth)).toBe(16);
  expect(validPushKeys(p256dh, auth)).toBe(true);
  expect(validPushKeys(Buffer.alloc(64, 1).toString("base64url"), auth)).toBe(false);
  expect(validPushKeys(`${p256dh}=`, auth)).toBe(false);
});
