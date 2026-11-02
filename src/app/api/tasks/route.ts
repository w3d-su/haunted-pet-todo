import { deleteTask, getTasksRoute, patchTask, postTask } from "./handlers";
import { productionDeps } from "@/lib/server/production";

export async function GET(request: Request): Promise<Response> {
  return getTasksRoute(request, productionDeps());
}

export async function POST(request: Request): Promise<Response> {
  return postTask(request, productionDeps());
}

export async function PATCH(request: Request): Promise<Response> {
  return patchTask(request, productionDeps());
}

export async function DELETE(request: Request): Promise<Response> {
  return deleteTask(request, productionDeps());
}
