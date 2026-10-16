// Everything done to a student's record, newest first, and by whom (staff
// only).
import { handle, json } from "@/server/http";
import { getStudentHistory } from "@/server/services/activity";

type Context = RouteContext<"/api/students/[studentNumber]/history">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ history: await getStudentHistory(session, studentNumber) });
});
