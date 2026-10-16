// Adds a module to a programme's structure (staff only), with its
// "moduleCode", "yearOfStudy" and "kind" ("CORE" or "OPTIONAL").
import { handle, json, readJson } from "@/server/http";
import { addProgrammeModule } from "@/server/services/curriculum";

type Context = RouteContext<"/api/programmes/[code]/modules">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { code } = await params;
  const programme = await addProgrammeModule(
    session,
    code,
    await readJson(request),
  );
  return json({ programme }, 201);
});
