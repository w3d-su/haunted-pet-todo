import { serverEnv } from "@/lib/server/env";

/** VAPID key pair. Server-only. Throws when either side is missing. */
export function getVapidKeys(): { publicKey: string; privateKey: string } {
  const publicKey = serverEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = serverEnv("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set");
  }
  return { publicKey, privateKey };
}
