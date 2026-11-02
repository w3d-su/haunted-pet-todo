import { beforeEach, expect, it, vi } from "vitest";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  sendNotification,
  setVapidDetails,
}));

import { PUSH_TIMEOUT_MS, sendPushNotification } from "@/lib/push/notify";
import { getVapidKeys } from "@/lib/push/vapid";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/haunt",
  keys: { p256dh: "key", auth: "auth" },
};

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

it("reads both VAPID keys and throws when one is missing", () => {
  expect(() => getVapidKeys()).toThrow(/VAPID/);
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  expect(getVapidKeys()).toEqual({ publicKey: "public", privateKey: "private" });
});

it("times out the socket, reports a gone subscription, and does not throw", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(
    sendPushNotification(
      { endpoint: "http://169.254.169.254/latest", keys: subscription.keys },
      { title: "Hi", body: "Boo" },
    ),
  ).resolves.toBe("failed");
  expect(sendNotification).not.toHaveBeenCalled();

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  sendNotification.mockResolvedValueOnce(undefined);
  await expect(sendPushNotification(subscription, { title: "Hi", body: "Boo" })).resolves.toBe(
    "sent",
  );
  expect(sendNotification).toHaveBeenCalledWith(subscription, expect.any(String), {
    timeout: PUSH_TIMEOUT_MS,
  });

  sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
  await expect(sendPushNotification(subscription, { title: "Hi", body: "Boo" })).resolves.toBe(
    "gone",
  );
  sendNotification.mockRejectedValueOnce(Object.assign(new Error("missing"), { statusCode: 404 }));
  await expect(sendPushNotification(subscription, { title: "Hi", body: "Boo" })).resolves.toBe(
    "gone",
  );
  sendNotification.mockRejectedValueOnce(new Error("timeout"));
  await expect(sendPushNotification(subscription, { title: "Hi", body: "Boo" })).resolves.toBe(
    "failed",
  );
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
