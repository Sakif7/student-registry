// Corrects a fee charge (staff only): PATCH with "amountPence" and/or
// "dueDate", and a "note" when the amount differs from the standard fee.
// Returns the student's updated account.
import { handle, json, readJson } from "@/server/http";
import { correctFee } from "@/server/services/fees";

type Context = RouteContext<"/api/fees/[feeId]">;

export const PATCH = handle<Context>(async (request, { params }, session) => {
  const { feeId } = await params;
  const account = await correctFee(session, feeId, await readJson(request));
  return json({ account });
});
