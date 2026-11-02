import { expect, it } from "vitest";
import {
  allowedPushEndpoint,
  base64UrlByteLength,
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
