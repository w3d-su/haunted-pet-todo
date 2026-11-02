import { getPet, patchPet } from "./handlers";
import { productionDeps } from "@/lib/server/production";

export async function GET(request: Request): Promise<Response> {
  return getPet(request, productionDeps());
}

export async function PATCH(request: Request): Promise<Response> {
  return patchPet(request, productionDeps());
}
