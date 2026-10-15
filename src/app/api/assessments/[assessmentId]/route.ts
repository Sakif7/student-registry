// One assessment (staff only). GET returns it with its submission tracker;
// PATCH changes the "title" or "deadline", or sets "closed" to true or false
// to stop or resume accepting submissions.
import { handle, json, readJson } from "@/server/http";
import { getAssessment, updateAssessment } from "@/server/services/assessments";

type Context = RouteContext<"/api/assessments/[assessmentId]">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { assessmentId } = await params;
  return json({ assessment: await getAssessment(session, assessmentId) });
});

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { assessmentId } = await params;
  const assessment = await updateAssessment(
    session,
    assessmentId,
    await readJson(request),
  );
  return json({ assessment });
});
