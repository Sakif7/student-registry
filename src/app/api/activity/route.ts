// The audit trail (staff only): every change, newest first, with the query
// parameter page.
import { handle, json } from "@/server/http";
import { listActivity } from "@/server/services/activity";

export const GET = handle(async (request, _context, session) =>
  json(
    await listActivity(
      session,
      Object.fromEntries(request.nextUrl.searchParams),
    ),
  ),
);
