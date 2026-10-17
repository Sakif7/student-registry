// Publishes all of a student's unpublished marks (staff only). Refused with
// 409 while their results are withheld, or when a JSON body's "expected"
// (how many marks the publisher saw waiting) no longer matches.
import { handle, json, readJson } from "@/server/http";
import { publishResults } from "@/server/services/results";

type Context =
  RouteContext<"/api/students/[studentNumber]/results/publication">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  // The body is optional: without one, every waiting mark is published.
  const input = request.headers.get("content-type")
    ? await readJson(request)
    : {};
  return json(await publishResults(session, studentNumber, input));
});
