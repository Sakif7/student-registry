// Drops a module from a student's current academic year, for staff or the
// student themselves while choosing is open. Core modules, and modules with
// work, stay.
import { handle, json } from "@/server/http";
import { dropModule } from "@/server/services/registrations";

type Context =
  RouteContext<"/api/students/[studentNumber]/modules/[moduleCode]">;

export const DELETE = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber, moduleCode } = await params;
  return json({
    modules: await dropModule(session, studentNumber, moduleCode),
  });
});
