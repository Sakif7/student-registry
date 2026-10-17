// Students. GET searches and filters them (staff only), with the query
// parameters q, programme, status, year and page; POST enrols a student and
// returns the new record, including its allocated student number, and the
// activation email for the student's sign-in account: whether it went, or
// null when staff set the student's password instead (an optional
// "password" in the body).
import { handle, json, readJson } from "@/server/http";
import { enrolStudent, listStudents } from "@/server/services/students";

export const GET = handle(async (request, _context, session) =>
  json(
    await listStudents(
      session,
      Object.fromEntries(request.nextUrl.searchParams),
    ),
  ),
);

export const POST = handle(async (request, _context, session) =>
  json(await enrolStudent(session, await readJson(request)), 201),
);
