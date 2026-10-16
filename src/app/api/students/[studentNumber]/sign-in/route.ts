// A student's sign-in account (staff only). GET shows where it stands;
// PATCH {"enabled": false} turns sign-in off, signing the student out
// everywhere, and {"enabled": true} turns it back on.
import { handle, json, readJson } from "@/server/http";
import { getStudentSignIn, setSignInEnabled } from "@/server/services/sign-in";

type Context = RouteContext<"/api/students/[studentNumber]/sign-in">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ signIn: await getStudentSignIn(session, studentNumber) });
});

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const signIn = await setSignInEnabled(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ signIn });
});
