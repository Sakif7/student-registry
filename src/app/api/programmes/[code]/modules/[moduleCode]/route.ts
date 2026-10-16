// Takes a module out of a programme's structure (staff only). Students'
// registrations on it stay.
import { handle, json } from "@/server/http";
import { removeProgrammeModule } from "@/server/services/curriculum";

type Context = RouteContext<"/api/programmes/[code]/modules/[moduleCode]">;

export const DELETE = handle<Context>(async (_request, { params }, session) => {
  const { code, moduleCode } = await params;
  return json({
    programme: await removeProgrammeModule(session, code, moduleCode),
  });
});
