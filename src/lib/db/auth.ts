import { createUserClient } from "./client";

/** Resolves the signed-in user from a bearer access token. Anonymous users are real auth.users rows. */
export async function userIdFromAccessToken(accessToken: string): Promise<string | null> {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}
