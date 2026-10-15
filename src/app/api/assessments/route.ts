// Assessments (staff only). GET lists them with submission counts; POST sets
// one with "moduleCode", "title" and "deadline", a wall-clock time in the
// college's time zone such as "2026-11-20T17:00".
import { handle, json, readJson } from "@/server/http";
import {
  createAssessment,
  listAssessments,
} from "@/server/services/assessments";

export const GET = handle(async (_request, _context, session) =>
  json({ assessments: await listAssessments(session) }),
);

export const POST = handle(async (request, _context, session) => {
  const assessment = await createAssessment(session, await readJson(request));
  return json({ assessment }, 201);
});
