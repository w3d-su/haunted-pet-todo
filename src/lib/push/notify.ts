import { sendNotification, setVapidDetails, type PushSubscription } from "web-push";
import { getVapidKeys } from "@/lib/push/vapid";

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
}

/**
 * Send one Web Push message. Logs and swallows failures so a cron tick
 * keeps going when a subscription is stale or the keys are unset.
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<void> {
  try {
    const { publicKey, privateKey } = getVapidKeys();
    setVapidDetails("mailto:ghost@haunted-pet-todo.app", publicKey, privateKey);
    await sendNotification(subscription, JSON.stringify(payload));
  } catch (error) {
    console.error(error);
  }
}
