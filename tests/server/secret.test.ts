import { expect, it } from "vitest";
import { bearerMatchesSecret } from "@/lib/server/secret";

it("accepts only the exact bearer secret", () => {
  expect(bearerMatchesSecret("Bearer ghost-key", "ghost-key")).toBe(true);
  expect(bearerMatchesSecret("bearer ghost-key", "ghost-key")).toBe(true);
  expect(bearerMatchesSecret("Bearer ghost-key", "other-key")).toBe(false);
  expect(bearerMatchesSecret("Bearer ghost-key-longer", "ghost-key")).toBe(false);
  expect(bearerMatchesSecret("Bearer short", "ghost-key")).toBe(false);
  expect(bearerMatchesSecret(null, "ghost-key")).toBe(false);
  expect(bearerMatchesSecret("Bearer ghost-key", undefined)).toBe(false);
  expect(bearerMatchesSecret("Bearer ", "")).toBe(false);
  expect(bearerMatchesSecret(null, "")).toBe(false);
});
