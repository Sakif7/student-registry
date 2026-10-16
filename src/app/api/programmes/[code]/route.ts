// One programme (staff only). GET returns it with its structure, year by
// year; PATCH changes its "title", "annualFeePence", "years" or
// "creditsPerYear". Its code never changes.
import { handle, json, readJson } from "@/server/http";
import { getProgramme, updateProgramme } from "@/server/services/curriculum";

type Context = RouteContext<"/api/programmes/[code]">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { code } = await params;
  return json({ programme: await getProgramme(session, code) });
});

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { code } = await params;
  const programme = await updateProgramme(
    session,
    code,
    await readJson(request),
  );
  return json({ programme });
});
