// Changes a module's "title", "credits" or "semester" (staff only). Its code
// never changes, and its credits only until students are registered on it.
import { handle, readJson } from "@/server/http";
import { updateModule } from "@/server/services/curriculum";

type Context = RouteContext<"/api/modules/[code]">;

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { code } = await params;
  await updateModule(session, code, await readJson(request));
  return new Response(null, { status: 204 });
});
