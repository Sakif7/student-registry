// A student's results, for staff or the student themselves. Staff see every
// mark; the student sees only published marks, and none while their results
// are withheld (the reason is still given).
import { handle, json } from "@/server/http";
import { getResults } from "@/server/services/results";

type Context = RouteContext<"/api/students/[studentNumber]/results">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json(await getResults(session, studentNumber));
});
