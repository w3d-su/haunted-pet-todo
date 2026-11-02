import { sendNotification, setVapidDetails, type PushSubscription } from "web-push";
import { allowedPushEndpoint } from "@/lib/push/endpoint";
import { getVapidKeys } from "@/lib/push/vapid";

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
}

export type PushSendResult = "sent" | "gone" | "failed";

/** Socket timeout so a silent host cannot hold the daily cron. */
export const PUSH_TIMEOUT_MS = 5_000;

function statusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const code = (error as { statusCode?: unknown }).statusCode;
  return typeof code === "number" ? code : null;
}

/**
 * Send one Web Push message.
 * `gone` means the push service said 404 or 410, so the caller deletes the row.
 * Any other failure is logged and does not throw.
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!allowedPushEndpoint(subscription.endpoint)) {
    console.error("refusing push endpoint");
    return "failed";
  }
  try {
    const { publicKey, privateKey } = getVapidKeys();
    setVapidDetails("mailto:ghost@haunted-pet-todo.app", publicKey, privateKey);
    await sendNotification(subscription, JSON.stringify(payload), { timeout: PUSH_TIMEOUT_MS });
    return "sent";
  } catch (error) {
    const status = statusCode(error);
    if (status === 404 || status === 410) return "gone";
    console.error(error);
    return "failed";
  }
}
