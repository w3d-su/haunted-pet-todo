import { beforeEach, expect, it, vi } from "vitest";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  sendNotification,
  setVapidDetails,
}));

import { sendPushNotification } from "@/lib/push/notify";
import { getVapidKeys } from "@/lib/push/vapid";

const subscription = {
  endpoint: "https://push.example/haunt",
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

it("logs a send failure and a missing key without throwing", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(sendPushNotification(subscription, { title: "Hi", body: "Boo" })).resolves.toBeUndefined();
  expect(sendNotification).not.toHaveBeenCalled();

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  sendNotification.mockRejectedValueOnce(new Error("gone"));
  await expect(
    sendPushNotification(subscription, { title: "Hi", body: "Boo", tag: "nag" }),
  ).resolves.toBeUndefined();
  expect(setVapidDetails).toHaveBeenCalledWith(
    "mailto:ghost@haunted-pet-todo.app",
    "public",
    "private",
  );
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
