import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare a bearer token to a server secret in constant time.
 * Both sides are hashed first so a length mismatch cannot skip the compare.
 * An empty secret never matches, including an empty bearer token.
 */
export function bearerMatchesSecret(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  const provided = match?.[1] ?? "";
  const expected = secret ?? "";
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  const equal = timingSafeEqual(left, right);
  return equal && expected.length > 0 && provided.length > 0;
}
