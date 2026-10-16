// The signed-in user, as every permission check in the app sees them. Better
// Auth (./auth.ts) checks the session cookie against the database; this module
// turns its result into a small Session object: a member of Registry staff, or
// one student. Services take that object and decide what it may do.
import "server-only";

import { io } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { auth } from "./auth";
import { AppError } from "./errors";

export type StaffSession = {
  role: "staff";
  userId: string;
  name: string;
  /** This session's own ID, to tell it apart from the user's others. */
  sessionId: string;
};
export type StudentSession = {
  role: "student";
  userId: string;
  name: string;
  sessionId: string;
  studentNumber: string;
};
export type Session = StaffSession | StudentSession;

/**
 * The session the request's cookie belongs to, or null when there is none, it
 * has expired or been signed out, or the account is disabled.
 */
async function sessionFromHeaders(
  requestHeaders: Headers,
): Promise<Session | null> {
  const result = await auth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const { user } = result;
  if (user.disabledAt) return null;
  const sessionId = result.session.id;
  if (user.role === "staff") {
    return { role: "staff", userId: user.id, name: user.name, sessionId };
  }
  if (user.role === "student" && user.studentNumber) {
    return {
      role: "student",
      userId: user.id,
      name: user.name,
      sessionId,
      studentNumber: user.studentNumber,
    };
  }
  return null;
}

/** The session of a Route Handler request. */
export function sessionFromRequest(
  request: NextRequest,
): Promise<Session | null> {
  return sessionFromHeaders(request.headers);
}

/** The session of the request being rendered (Server Components only). */
export async function currentSession(): Promise<Session | null> {
  return sessionFromHeaders(await headers());
}

/**
 * Allows anyone signed in, staff or student.
 *
 * @throws AppError (UNAUTHENTICATED) without a session.
 */
export function requireSession(session: Session | null): Session {
  if (!session) throw notSignedIn();
  return session;
}

/**
 * Allows Registry staff only.
 *
 * @throws AppError: UNAUTHENTICATED without a session, FORBIDDEN for a student.
 */
export function requireStaff(session: Session | null): StaffSession {
  if (!session) throw notSignedIn();
  if (session.role !== "staff") {
    throw new AppError("FORBIDDEN", "Only Registry staff can do this.");
  }
  return session;
}

/**
 * Allows staff, or the student whose record it is.
 *
 * @throws AppError: UNAUTHENTICATED without a session, FORBIDDEN for another
 *   student's record.
 */
export function requireStaffOrSelf(
  session: Session | null,
  studentNumber: string,
): Session {
  if (!session) throw notSignedIn();
  if (session.role === "student" && session.studentNumber !== studentNumber) {
    throw new AppError("FORBIDDEN", "You can only see your own record.");
  }
  return session;
}

/**
 * Allows a student only.
 *
 * @throws AppError: UNAUTHENTICATED without a session, FORBIDDEN for staff.
 */
export function requireStudent(session: Session | null): StudentSession {
  if (!session) throw notSignedIn();
  if (session.role !== "student") {
    throw new AppError("FORBIDDEN", "Only students can do this.");
  }
  return session;
}

/**
 * For pages: returns the viewer's session if it has the given role. Anyone
 * else goes to the sign-in page, or to their own home page if they are
 * signed in with the other role. Everything a page renders after this check
 * is request-time data.
 */
export async function requirePageRole(role: "staff"): Promise<StaffSession>;
export async function requirePageRole(role: "student"): Promise<StudentSession>;
export async function requirePageRole(role: Session["role"]): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(`/${session.role}`);
  // With partial prefetching, cookies resolve while Next.js prerenders a
  // route's shell, so the session read above doesn't stop the prerender.
  // io() stops it here, before any page reads the clock (new Date()), which
  // a prerender may not do. At request time it resolves immediately.
  await io();
  return session;
}

function notSignedIn(): AppError {
  return new AppError("UNAUTHENTICATED", "Sign in first.");
}
