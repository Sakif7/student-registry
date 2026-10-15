// Changes a student's enrolment status (staff only): POST {"status":
// "DEFERRED", "reason": "..."}. A reason is required for deferral and
// withdrawal; disallowed changes return 409.
import { handle, json, readJson } from "@/server/http";
import { changeStatus } from "@/server/services/students";

type Context = RouteContext<"/api/students/[studentNumber]/status">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const student = await changeStatus(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ student });
});
