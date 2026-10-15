// Records a payment (staff only): POST {"amountPence": 50000, "paidOn":
// "2026-10-15", "reference": "BACS 0042"}. Returns the updated account, with
// the new balance.
import { handle, json, readJson } from "@/server/http";
import { recordPayment } from "@/server/services/fees";

type Context = RouteContext<"/api/students/[studentNumber]/payments">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const account = await recordPayment(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ account }, 201);
});
