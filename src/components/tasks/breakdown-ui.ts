import { BREAKDOWN_CLAIM_LOST } from "@/lib/ai/messages";

export { BREAKDOWN_CLAIM_LOST };

/** A lost race is not a failure the player needs to see. */
export function breakdownFailureIsQuiet(status: number, message: string): boolean {
  return status === 409 && message === BREAKDOWN_CLAIM_LOST;
}
