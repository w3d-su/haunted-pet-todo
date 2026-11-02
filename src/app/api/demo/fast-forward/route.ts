import { postFastForward } from "./handlers";
import { productionDeps } from "@/lib/server/production";

export async function POST(request: Request): Promise<Response> {
  return postFastForward(request, productionDeps());
}
