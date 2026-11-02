import type { AnonymousSession } from "@/lib/db/auth";
import { SupabaseConfigError } from "@/lib/db/client";
import { json } from "@/lib/server/http";

export async function postAnonymous(
  signIn: () => Promise<AnonymousSession>,
): Promise<Response> {
  try {
    const session = await signIn();
    return json(session, 201);
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return json({ error: error.message }, 503);
    }
    console.error(error);
    return json(
      {
        error:
          "Anonymous sign-in failed. Enable anonymous sign-ins for the Supabase project (see README).",
      },
      503,
    );
  }
}
