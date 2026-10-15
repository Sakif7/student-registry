// The demo session. GET shows it; POST {"role":"staff"} or
// {"role":"student","studentNumber":"SMS-2026-0001"} starts one; DELETE ends it.
import { NextResponse } from "next/server";

import { handle, json, readJson } from "@/server/http";
import { startSession } from "@/server/services/viewers";
import { SESSION_COOKIE, serialiseSession } from "@/server/session";

export const GET = handle((_request, _context, session) => json({ session }));

export const POST = handle(async (request) => {
  const session = await startSession(await readJson(request));
  const response = json({ session });
  response.cookies.set(SESSION_COOKIE, serialiseSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
});

export const DELETE = handle(() => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
