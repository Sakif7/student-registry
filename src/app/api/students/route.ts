// Students. GET searches and filters them (staff only), with the query
// parameters q, programme, status, year and page; POST enrols a student and
// returns the new record, including its allocated student number, and
// whether the activation email for the student's sign-in account went.
import { handle, json, readJson } from "@/server/http";
import { sendSignInLink } from "@/server/services/sign-in";
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
  // The enrolment stands even if the mail server is down: staff can send the
  // email again from the student's record.
  const activationEmail = await sendSignInLink(session, student.studentNumber);
  return json({ student, activationEmail }, 201);
});
