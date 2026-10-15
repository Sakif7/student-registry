// Publishes all of a student's unpublished marks (staff only). Refused with
// 409 while their results are withheld.
import { handle, json } from "@/server/http";
import { publishResults } from "@/server/services/results";

type Context =
  RouteContext<"/api/students/[studentNumber]/results/publication">;

export const POST = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json(await publishResults(session, studentNumber));
});
