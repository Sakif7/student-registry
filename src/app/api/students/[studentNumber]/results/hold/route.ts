// A hold on a student's results (staff only). PUT withholds all their results
// with a "reason" the student is shown; DELETE lifts the hold.
import { handle, json, readJson } from "@/server/http";
import { liftResultsHold, withholdResults } from "@/server/services/results";

type Context = RouteContext<"/api/students/[studentNumber]/results/hold">;

export const PUT = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  return json(
    await withholdResults(session, studentNumber, await readJson(request)),
  );
});

export const DELETE = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json(await liftResultsHold(session, studentNumber));
});
