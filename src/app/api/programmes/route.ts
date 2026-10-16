// Programmes. GET lists them, with their annual fee and length, for anyone
// signed in (the enrolment form offers them); POST sets one up (staff only).
import { handle, json, readJson } from "@/server/http";
import { createProgramme } from "@/server/services/curriculum";
import { listProgrammes } from "@/server/services/students";

export const GET = handle(async (_request, _context, session) =>
  json({ programmes: await listProgrammes(session) }),
);

export const POST = handle(async (request, _context, session) => {
  const programme = await createProgramme(session, await readJson(request));
  return json({ programme }, 201);
});
