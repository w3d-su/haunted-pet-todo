import { productionRemindDeps, runRemindCron } from "./handlers";

// Called hourly by .github/workflows/remind.yml. Vercel Hobby only allows a
// daily cron, so this route is not listed in vercel.json.

export async function GET(request: Request): Promise<Response> {
  return runRemindCron(request, productionRemindDeps());
}
