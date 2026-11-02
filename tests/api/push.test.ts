import { expect, it } from "vitest";
import { deletePush, postPush } from "@/app/api/push/handlers";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);
const subscription = {
  endpoint: "https://push.example/haunt",
  expirationTime: null,
  keys: { p256dh: "key", auth: "auth" },
};

it("rejects a signed-out caller", async () => {
  const world = createMemoryWorld();
  const response = await postPush(request("POST", "/api/push", subscription), world.deps(null, NOW));
  expect(response.status).toBe(401);
});

it("upserts a subscription and deletes that endpoint", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postPush(request("POST", "/api/push", subscription), deps);
  expect(created.status).toBe(200);
  const replaced = await postPush(
    request("POST", "/api/push", { ...subscription, keys: { p256dh: "next", auth: "auth" } }),
    deps,
  );
  expect(replaced.status).toBe(200);
  expect(world.pushes).toHaveLength(1);
  expect(world.pushes[0]?.p256dh).toBe("next");

  const removed = await deletePush(
    request("DELETE", "/api/push", { endpoint: subscription.endpoint }),
    deps,
  );
  expect(removed.status).toBe(200);
  expect(world.pushes).toHaveLength(0);

  const invalid = await postPush(request("POST", "/api/push", { endpoint: "" }), deps);
  expect(invalid.status).toBe(400);
});
