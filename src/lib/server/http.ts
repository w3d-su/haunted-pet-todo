import { ZodError } from "zod";
import { SupabaseConfigError } from "@/lib/db/client";

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

export function badRequest(error: ZodError): Response {
  return json({ error: "Invalid request", issues: error.issues }, 400);
}

export function notFound(message: string): Response {
  return json({ error: message }, 404);
}

export function conflict(message: string): Response {
  return json({ error: message }, 409);
}

/** Version retries ran out. Callers must answer 503, never a bare 500. */
export class RetryLaterError extends Error {
  constructor() {
    super("pet_state version conflict");
    this.name = "RetryLaterError";
  }
}

export function retryLater(): Response {
  return json({ error: "Service busy" }, 503, { "Retry-After": "1" });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function storageFailure(error: unknown): Response {
  if (error instanceof RetryLaterError) return retryLater();
  if (error instanceof SupabaseConfigError) {
    return json({ error: error.message }, 503);
  }
  console.error(error);
  return json({ error: "Storage error" }, 500);
}
