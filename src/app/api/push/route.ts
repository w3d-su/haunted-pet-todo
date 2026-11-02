import { productionDeps } from "@/lib/server/production";
import { deletePush, postPush } from "./handlers";

export async function POST(request: Request): Promise<Response> {
  return postPush(request, productionDeps());
}

export async function DELETE(request: Request): Promise<Response> {
  return deletePush(request, productionDeps());
}
