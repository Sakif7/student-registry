// One student's record: staff can read any record, a student only their own.
import { handle, json } from "@/server/http";
import { getStudent } from "@/server/services/students";

type Context = RouteContext<"/api/students/[studentNumber]">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ student: await getStudent(session, studentNumber) });
});
