// Modules. GET lists them for anyone signed in (the assessment form offers
// them); POST sets one up (staff only).
import { handle, json, readJson } from "@/server/http";
import { listModules } from "@/server/services/assessments";
import { createModule } from "@/server/services/curriculum";

export const GET = handle(async (_request, _context, session) =>
  json({ modules: await listModules(session) }),
);

export const POST = handle(async (request, _context, session) => {
  await createModule(session, await readJson(request));
  return new Response(null, { status: 201 });
});
