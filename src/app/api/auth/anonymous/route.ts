import { signInAnonymously } from "@/lib/db/auth";
import { postAnonymous } from "./handlers";

export async function POST(): Promise<Response> {
  return postAnonymous(() => signInAnonymously());
}
