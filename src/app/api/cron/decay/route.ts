import { productionCronDeps, runDecayCron } from "./handlers";

// Do not set maxDuration. Fluid compute is on by default, and Hobby's
// default and maximum are both 300s. A lower value would shorten that limit.
// https://vercel.com/docs/functions/configuring-functions/duration

export async function GET(request: Request): Promise<Response> {
  return runDecayCron(request, productionCronDeps());
}
