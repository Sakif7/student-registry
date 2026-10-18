// Publishes an assessment's unpublished marks to all its students at once
// (staff only), except those whose results are withheld. Refused with 409
// when a JSON body's "expected" (how many marks the publisher saw waiting)
// no longer matches.
import { handle, json, readJson } from "@/server/http";
import { publishAssessmentMarks } from "@/server/services/results";

type Context = RouteContext<"/api/assessments/[assessmentId]/publication">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { assessmentId } = await params;
  // The body is optional: without one, every waiting mark is published.
  const input = request.headers.get("content-type")
    ? await readJson(request)
    : {};
  return json(await publishAssessmentMarks(session, assessmentId, input));
});
