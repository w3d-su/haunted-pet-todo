import { productionCronDeps, runDecayCron } from "./handlers";

export async function GET(request: Request): Promise<Response> {
  return runDecayCron(request, productionCronDeps());
}
