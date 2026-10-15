// Charges a student the fee for an academic year (staff only):
// POST {"academicYear": "2026/27"}, optionally with "amountPence", "dueDate"
// and "note". Returns the updated account.
import { handle, json, readJson } from "@/server/http";
import { assignFee } from "@/server/services/fees";

type Context = RouteContext<"/api/students/[studentNumber]/fees">;

export const POST = handle<Context>(async (request, { params }, session) => {
  const { studentNumber } = await params;
  const account = await assignFee(
    session,
    studentNumber,
    await readJson(request),
  );
  return json({ account }, 201);
});
