import { expect, it } from "vitest";
import { deletePush, postPush } from "@/app/api/push/handlers";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);
const p256dh = Buffer.alloc(65, 7).toString("base64url");
const auth = Buffer.alloc(16, 8).toString("base64url");
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/haunt",
  expirationTime: null,
  keys: { p256dh, auth },
};

it("rejects a signed-out caller", async () => {
  const world = createMemoryWorld();
  const response = await postPush(request("POST", "/api/push", subscription), world.deps(null, NOW));
  expect(response.status).toBe(401);
});

it("rejects endpoints that are not a known https push host", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  for (const endpoint of [
    "http://169.254.169.254/latest",
    "http://localhost/push",
    "not-a-url",
    "ftp://fcm.googleapis.com/fcm/send/x",
    "https://evilfcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com.attacker.com/fcm/send/x",
  ]) {
    const response = await postPush(
      request("POST", "/api/push", { ...subscription, endpoint }),
      deps,
    );
    expect(response.status).toBe(400);
  }
  expect(world.pushes).toHaveLength(0);
});

it("rejects keys that are not 65 and 16 bytes", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const response = await postPush(
    request("POST", "/api/push", {
      ...subscription,
      keys: { p256dh: Buffer.alloc(32).toString("base64url"), auth },
    }),
    deps,
  );
  expect(response.status).toBe(400);
  const authResponse = await postPush(
    request("POST", "/api/push", {
      ...subscription,
      keys: { p256dh, auth: Buffer.alloc(8).toString("base64url") },
    }),
    deps,
  );
  expect(authResponse.status).toBe(400);
  expect(world.pushes).toHaveLength(0);
});

it("upserts a subscription, caps the user at five, and deletes that endpoint", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postPush(request("POST", "/api/push", subscription), deps);
  expect(created.status).toBe(200);
  const nextKey = Buffer.alloc(65, 9).toString("base64url");
  const replaced = await postPush(
    request("POST", "/api/push", { ...subscription, keys: { p256dh: nextKey, auth } }),
    deps,
  );
  expect(replaced.status).toBe(200);
  expect(world.pushes).toHaveLength(1);
  expect(world.pushes[0]?.p256dh).toBe(nextKey);

  for (let index = 0; index < 4; index += 1) {
    const added = await postPush(
      request("POST", "/api/push", {
        ...subscription,
        endpoint: `https://updates.push.services.mozilla.com/wpush/${index}`,
      }),
      deps,
    );
    expect(added.status).toBe(200);
  }
  const sixth = await postPush(
    request("POST", "/api/push", {
      ...subscription,
      endpoint: "https://web.push.apple.com/extra",
    }),
    deps,
  );
  expect(sixth.status).toBe(409);
  expect(world.pushes).toHaveLength(5);

  const removed = await deletePush(
    request("DELETE", "/api/push", { endpoint: subscription.endpoint }),
    deps,
  );
  expect(removed.status).toBe(200);
  expect(world.pushes).toHaveLength(4);
});
