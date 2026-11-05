"use client";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function openSession() {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const existing = await client.auth.getSession();
  if (existing.error) throw existing.error;
  if (!existing.data.session) {
    const signed = await client.auth.signInAnonymously();
    if (signed.error) throw signed.error;
  }
  return client;
}

// The initial pet and task reads can arrive together. Share the sign-in, then
// read the current session for each request so refreshed tokens take effect.
let sessionClient: ReturnType<typeof openSession> | undefined;

export async function gameRequest(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (supabaseConfigured()) {
    sessionClient ??= openSession().catch((cause) => {
      sessionClient = undefined;
      throw cause;
    });
    const client = await sessionClient;
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error(error?.message ?? "Sign-in failed. Reload to try again.");
    headers.set("authorization", `Bearer ${data.session.access_token}`);
  }
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("x-time-zone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  return fetch(path, { ...init, headers, credentials: "same-origin" });
}
