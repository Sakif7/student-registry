// An assessment's marks (staff only). PUT saves the marks that changed as
// {"marks": {"SMS-2025-0001": 72, "SMS-2026-0001": null}}, where null removes
// a mark, and returns the updated marksheet.
import { handle, json, readJson } from "@/server/http";
import { saveMarks } from "@/server/services/assessments";

type Context = RouteContext<"/api/assessments/[assessmentId]/marks">;

export const PUT = handle<Context>(async (request, { params }, session) => {
  const { assessmentId } = await params;
  const assessment = await saveMarks(
    session,
    assessmentId,
    await readJson(request),
  );
  return json({ assessment });
});
