// Moving students on to a new academic year (staff only). GET lists the
// students still to move on to `to` (written 2027-28), with the same `q`,
// `programme`, `year` and `page` as the page, and a fingerprint of who is
// listed ("listed"). POST moves them on: the year, the same filters, that
// fingerprint, and any steps staff changed, by student ID ("steps"); 409 if
// the students listed have changed meanwhile.
import { handle, json, readJson } from "@/server/http";
import {
  listToProgress,
  progressStudents,
} from "@/server/services/progression";

export const GET = handle(async (request, _context, session) =>
  json(
    await listToProgress(
      session,
      Object.fromEntries(request.nextUrl.searchParams),
    ),
  ),
);

export const POST = handle(async (request, _context, session) =>
  json({ outcome: await progressStudents(session, await readJson(request)) }),
);
