// Every academic year's calendar, newest first (staff only).
import { handle, json } from "@/server/http";
import { listAcademicYears } from "@/server/services/curriculum";

export const GET = handle(async (_request, _context, session) =>
  json({ academicYears: await listAcademicYears(session) }),
);
