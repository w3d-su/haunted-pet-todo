import { expect, it } from "vitest";
import { postAnonymous } from "@/app/api/auth/anonymous/handlers";
import { SupabaseConfigError } from "@/lib/db/client";

it("returns the anonymous session", async () => {
  const response = await postAnonymous(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: 1,
  }));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ accessToken: "token" });
});

it("hides configuration failures", async () => {
  const response = await postAnonymous(async () => {
    throw new SupabaseConfigError("missing");
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: "missing" });
});
