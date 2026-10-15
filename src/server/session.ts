// The demo session: a cookie naming either the Registry staff or one student.
// It stands in for authentication, which the brief allows to be left out.
// Every permission check goes through this module, so replacing the toggle
// with real sign-in would only change how the session is read.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { isStudentNumber } from "@/domain/student-number";

import { AppError } from "./errors";

export const SESSION_COOKIE = "sms_session";

export type StaffSession = { role: "staff" };
export type StudentSession = { role: "student"; studentNumber: string };
export type Session = StaffSession | StudentSession;

const STUDENT_PREFIX = "student:";

/** Reads a session from the cookie value; null when absent or malformed. */
export function parseSession(value: string | undefined): Session | null {
  if (value === "staff") return { role: "staff" };
  if (value?.startsWith(STUDENT_PREFIX)) {
    const studentNumber = value.slice(STUDENT_PREFIX.length);
    if (isStudentNumber(studentNumber))
      return { role: "student", studentNumber };
  }
  return null;
}

/** The cookie value for a session: "staff" or "student:SMS-2026-0001". */
export function serialiseSession(session: Session): string {
  return session.role === "staff"
    ? "staff"
    : `${STUDENT_PREFIX}${session.studentNumber}`;
}

/** The session of a Route Handler request. */
export function sessionFromRequest(request: NextRequest): Session | null {
  return parseSession(request.cookies.get(SESSION_COOKIE)?.value);
}

/** The session of the request being rendered (Server Components only). */
export async function currentSession(): Promise<Session | null> {
  return parseSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Allows anyone with a session, staff or student.
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
 * For pages: returns the viewer's session if it has the given role, and
 * otherwise sends them to the role picker.
 */
export async function requirePageRole(role: "staff"): Promise<StaffSession>;
export async function requirePageRole(role: "student"): Promise<StudentSession>;
export async function requirePageRole(role: Session["role"]): Promise<Session> {
  const session = await currentSession();
  if (session?.role !== role) redirect("/");
  return session;
}

function notSignedIn(): AppError {
  return new AppError(
    "UNAUTHENTICATED",
    "Choose a view first: Registry staff or a student.",
  );
}
