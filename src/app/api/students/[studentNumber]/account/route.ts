// A student's account: fee charges, payments, the balance and anything
// overdue. Staff can read any account, a student only their own.
import { handle, json } from "@/server/http";
import { getAccount } from "@/server/services/fees";

type Context = RouteContext<"/api/students/[studentNumber]/account">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { studentNumber } = await params;
  return json({ account: await getAccount(session, studentNumber) });
});
