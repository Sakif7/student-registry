// Emails a student a link to set their password (staff only): an activation
// link until they have activated their account, a password-reset link after.
// 503 if the mail server couldn't take the email.
import { AppError } from "@/server/errors";
import { handle, json } from "@/server/http";
import { sendSignInLink } from "@/server/services/sign-in";

type Context = RouteContext<"/api/students/[studentNumber]/sign-in/link">;

export const POST = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  const link = await sendSignInLink(session, studentNumber);
  if (!link.sent) {
    throw new AppError(
      "UNAVAILABLE",
      "The email couldn't be sent. Try again in a few minutes.",
    );
  }
  return json({ link });
});
