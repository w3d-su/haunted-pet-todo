import { postEpitaph, productionEpitaphDeps } from "./handlers";

export async function POST(request: Request): Promise<Response> {
  return postEpitaph(request, productionEpitaphDeps());
}
