// Reverses a payment entered by mistake (staff only): POST {"reason": "..."}.
// The payment stays on record but no longer counts; a second reversal of the
// same payment returns 409. Returns the student's updated account.
import { handle, json, readJson } from "@/server/http";
import { reversePayment } from "@/server/services/fees";

type Context = RouteContext<"/api/payments/[paymentId]/reversal">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { paymentId } = await params;
  const account = await reversePayment(
    session,
    paymentId,
    await readJson(request),
  );
  return json({ account }, 201);
});
