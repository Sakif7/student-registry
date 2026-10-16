// Builds requests for calling Route Handlers directly in integration tests, as
// a given viewer. Each viewer is signed in for real: they get an account and a
// session row in the test database, and the request carries that session's
// cookie, signed with the app's secret, so the code under test checks it
// exactly as it would in production.
import { NextRequest } from "next/server";

import { db } from "@/server/db";
import type { Session } from "@/server/session";

import {
  newSessionToken,
  SESSION_COOKIE,
  sessionCookieValue,
} from "./session-cookie";

const ORIGIN = "http://localhost:3000";
const HOUR_MS = 60 * 60 * 1000;

/** Who a test request comes from. */
export type Viewer =
  { role: "staff" } | { role: "student"; studentNumber: string };

/** A member of Registry staff. */
export const STAFF: Viewer = { role: "staff" };

/** A student, by student number. Their record must already exist. */
export function asStudent(studentNumber: string): Viewer {
  return { role: "student", studentNumber };
}

/** The staff member every test signs in as. */
export const TEST_STAFF = {
  name: "Rachel Moss",
  email: "rachel.moss@college.example",
};

/**
 * Signs a viewer in, as Better Auth would: finds or creates their account,
 * then creates a new session for it.
 *
 * @returns The session as the services see it, and the cookie carrying it.
 */
export async function signIn(
  viewer: Viewer,
): Promise<{ session: Session; cookie: string }> {
  const user =
    viewer.role === "staff"
      ? await staffUser()
      : await studentUser(viewer.studentNumber);

  const token = newSessionToken();
  const { id: sessionId } = await db().session.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 8 * HOUR_MS),
    },
  });
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const session: Session =
    viewer.role === "staff"
      ? { role: "staff", userId: user.id, name: user.name, sessionId }
      : {
          role: "student",
          userId: user.id,
          name: user.name,
          sessionId,
          studentNumber: viewer.studentNumber,
        };
  return {
    session,
    cookie: `${SESSION_COOKIE}=${await sessionCookieValue(token, secret)}`,
  };
}

/** The session a viewer gets, for calling a service directly. */
export async function sessionFor(viewer: Viewer): Promise<Session> {
  return (await signIn(viewer)).session;
}

// Created with ON CONFLICT DO NOTHING, so viewers signing in at the same
// moment (in the concurrency tests) share one account instead of colliding.
async function staffUser() {
  await db().user.createMany({
    data: [{ ...TEST_STAFF, role: "staff", emailVerified: true }],
    skipDuplicates: true,
  });
  return db().user.findUniqueOrThrow({ where: { email: TEST_STAFF.email } });
}

async function studentUser(studentNumber: string) {
  const student = await db().student.findUnique({
    where: { studentNumber },
    select: { fullName: true, email: true },
  });
  if (!student) {
    throw new Error(
      `Create student ${studentNumber} before making requests as them.`,
    );
  }
  await db().user.createMany({
    data: [
      {
        name: student.fullName,
        email: student.email,
        role: "student",
        studentNumber,
        emailVerified: true,
      },
    ],
    skipDuplicates: true,
  });
  return db().user.findUniqueOrThrow({ where: { studentNumber } });
}

interface RequestOptions {
  session?: Viewer | null;
  /** Sent as a JSON body with the matching Content-Type. */
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/** A request to this app's API, as the browser would send it. */
export async function apiRequest(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<NextRequest> {
  const headers = new Headers(options.headers);
  if (options.session) {
    headers.set("cookie", (await signIn(options.session)).cookie);
  }
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  return new NextRequest(new URL(path, ORIGIN), { method, headers, body });
}

/** The context Next.js passes to a Route Handler: params as a promise. */
export function routeContext<Params extends Record<string, string>>(
  params: Params,
): { params: Promise<Params> } {
  return { params: Promise.resolve(params) };
}

/** A response's JSON body, typed for assertions. */
export async function bodyOf<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}
