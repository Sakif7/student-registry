// The modules assessments can be set for, each with its programme.
import { handle, json } from "@/server/http";
import { listModules } from "@/server/services/assessments";

export const GET = handle(async (_request, _context, session) =>
  json({ modules: await listModules(session) }),
);
