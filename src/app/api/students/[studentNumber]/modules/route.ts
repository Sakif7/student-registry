// A student's modules, for staff or the student themselves. GET lists this
// academic year's registrations, the optional modules still open to them,
// and earlier years'; POST {"moduleCode"} registers the student on one.
import { handle, json, readJson } from "@/server/http";
import {
  getStudentModules,
  registerOnModule,
} from "@/server/services/registrations";

type Context = RouteContext<"/api/students/[studentNumber]/modules">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ modules: await getStudentModules(session, studentNumber) });
});

export const POST = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const modules = await registerOnModule(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ modules }, 201);
});
