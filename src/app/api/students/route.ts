// Students. GET searches and filters them (staff only), with the query
// parameters q, programme, status, year and page; POST enrols a student and
// returns the new record, including its allocated student number.
import { handle, json, readJson } from "@/server/http";
import { createStudent, listStudents } from "@/server/services/students";

export const GET = handle(async (request, _context, session) =>
  json(
    await listStudents(
      session,
      Object.fromEntries(request.nextUrl.searchParams),
    ),
  ),
);

export const POST = handle(async (request, _context, session) => {
  const student = await createStudent(session, await readJson(request));
  return json({ student }, 201);
});
