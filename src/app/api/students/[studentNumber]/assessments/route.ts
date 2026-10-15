// The assessments a student can submit to, each with their own submission
// and whether they can upload now. For staff or the student themselves.
import { handle, json } from "@/server/http";
import { listStudentAssessments } from "@/server/services/submissions";

type Context = RouteContext<"/api/students/[studentNumber]/assessments">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({
    assessments: await listStudentAssessments(session, studentNumber),
  });
});
