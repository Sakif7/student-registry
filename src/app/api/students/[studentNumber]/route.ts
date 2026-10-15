// One student's record. GET: staff can read any record, a student only their
// own. PATCH: staff edit details (any subset of fullName, email, dateOfBirth,
// programmeCode, academicYear); the student number never changes.
import { handle, json, readJson } from "@/server/http";
import { getStudent, updateStudent } from "@/server/services/students";

type Context = RouteContext<"/api/students/[studentNumber]">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ student: await getStudent(session, studentNumber) });
});

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const student = await updateStudent(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ student });
});
