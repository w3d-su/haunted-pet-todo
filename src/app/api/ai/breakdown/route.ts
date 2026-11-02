import { postBreakdown, productionBreakdownDeps } from "./handlers";

export async function POST(request: Request): Promise<Response> {
  return postBreakdown(request, productionBreakdownDeps());
}
