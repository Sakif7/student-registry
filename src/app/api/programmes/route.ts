// The programmes students can be enrolled on, with their standard annual fee.
import { handle, json } from "@/server/http";
import { listProgrammes } from "@/server/services/students";

export const GET = handle(async (_request, _context, session) =>
  json({ programmes: await listProgrammes(session) }),
);
