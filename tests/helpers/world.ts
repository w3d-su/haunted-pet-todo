export { createMemoryWorld } from "@/lib/server/memory";
export type { MemoryWorld, StoredEvent } from "@/lib/server/memory";

export const USER_ID = "11111111-1111-4111-8111-111111111111";

export function request(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
