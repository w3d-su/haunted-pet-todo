import { createAnonClient, createUserClient } from "./client";

export interface AnonymousSession {
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number | null;
}

/**
 * Creates a Supabase anonymous user. The project must allow anonymous
 * sign-ins (dashboard, or `enable_anonymous_sign_ins` in local config).
 * Anonymous users are real `auth.users` rows, so `auth.uid()` RLS works.
 */
export async function signInAnonymously(): Promise<AnonymousSession> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? "Anonymous sign-in failed");
  }
  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
  };
}

export async function userIdFromAccessToken(accessToken: string): Promise<string | null> {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}
