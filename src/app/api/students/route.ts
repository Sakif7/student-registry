// Students. POST enrols a student (staff only) and returns the new record,
// including its allocated student number.
import { handle, json, readJson } from "@/server/http";
import { createStudent } from "@/server/services/students";

export const POST = handle(async (request, _context, session) => {
  const student = await createStudent(session, await readJson(request));
  return json({ student }, 201);
});
