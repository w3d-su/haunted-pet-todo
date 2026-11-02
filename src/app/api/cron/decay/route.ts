import { productionCronDeps, runDecayCron } from "./handlers";

/** Hobby allows at most 60 seconds. The daily job is a backstop, not the only clock. */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return runDecayCron(request, productionCronDeps());
}
