// Signing in and out through Better Auth's endpoints (/api/auth/*), and what
// the app makes of the session afterwards: who gets in, what they're told
// when they don't, and what ends a session.
import { describe, expect, it } from "vitest";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...all]/route";
import { GET as listStudents } from "@/app/api/students/route";
import { db } from "@/server/db";

import { createStudent, createUser } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  signIn,
  STAFF,
} from "../helpers/requests";
import { SESSION_COOKIE } from "../helpers/session-cookie";

const PASSWORD = "correct-horse-battery-staple";
const EMAIL = "rachel.moss@college.example";
// A documentation address (RFC 5737). Sign-in is rate limited per address.
const ADDRESS = "203.0.113.7";

async function signInWith(
  email: string,
  password: string,
  address = ADDRESS,
): Promise<Response> {
  return authPost(
    await apiRequest("POST", "/api/auth/sign-in/email", {
      json: { email, password },
      headers: { "x-forwarded-for": address, "user-agent": "Test browser" },
    }),
  );
}

/** The session cookie a response sets, as a browser would send it back. */
function sessionCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error("No session cookie was set.");
  return cookie.split(";")[0] ?? "";
}

/** GET /api/students with the cookie: 200 for staff, 401 for nobody. */
async function studentsListStatus(cookie: string): Promise<number> {
  const response = await listStudents(
    await apiRequest("GET", "/api/students", { headers: { cookie } }),
    routeContext({}),
  );
  return response.status;
}

describe("signing in", () => {
  it("lets someone in with the right password, with a cookie scripts can't read", async () => {
    const user = await createUser({ email: EMAIL, password: PASSWORD });

    const response = await signInWith(EMAIL, PASSWORD);

    expect(response.status).toBe(200);
    const setCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    expect(setCookie).toMatch(/; HttpOnly/i);
    expect(setCookie).toMatch(/; SameSite=Lax/i);
    expect(setCookie).toMatch(/; Max-Age=28800/i);
    expect(await studentsListStatus(sessionCookieFrom(response))).toBe(200);

    // The session records where it came from, for the list of devices.
    const [session] = await db().session.findMany({
      where: { userId: user.id },
    });
    expect(session).toMatchObject({
      ipAddress: ADDRESS,
      userAgent: "Test browser",
    });
  });

  it("matches the email address whatever its case", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });

    const response = await signInWith("Rachel.Moss@College.Example", PASSWORD);

    expect(response.status).toBe(200);
  });

  it("gives a wrong password and an unknown address the same answer", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });

    const wrongPassword = await signInWith(EMAIL, "not-the-password");
    const unknownEmail = await signInWith("nobody@college.example", PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await bodyOf(unknownEmail)).toEqual(await bodyOf(wrongPassword));
    expect(wrongPassword.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a student who hasn't activated their account yet", async () => {
    const student = await createStudent({ email: "oliver@student.example" });
    // Enrolled, but no password set: no credential account.
    await db().user.create({
      data: {
        name: student.fullName,
        email: student.email,
        role: "student",
        studentNumber: student.studentNumber,
      },
    });

    const response = await signInWith(student.email, PASSWORD);

    expect(response.status).toBe(401);
  });

  it("refuses an account with sign-in turned off, but only says so to someone with the password", async () => {
    const user = await createUser({
      email: EMAIL,
      password: PASSWORD,
      disabledAt: new Date(),
    });

    const withPassword = await signInWith(EMAIL, PASSWORD);
    const withoutPassword = await signInWith(EMAIL, "not-the-password");

    expect(withPassword.status).toBe(403);
    expect(await bodyOf(withPassword)).toMatchObject({
      message: "Sign-in is turned off for this account. Contact the Registry.",
    });
    expect(withoutPassword.status).toBe(401);
    expect(await db().session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("allows 30 attempts a minute from one address", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });

    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const email = `nobody${attempt}@college.example`;
      expect((await signInWith(email, PASSWORD)).status).toBe(401);
    }
    const next = await signInWith(EMAIL, PASSWORD);
    const elsewhere = await signInWith(EMAIL, PASSWORD, "198.51.100.23");

    expect(next.status).toBe(429);
    expect(elsewhere.status).toBe(200);
  });

  it("has no way to sign up or to change one's own name", async () => {
    await createStudent({ studentNumber: "SMS-2026-0001" });
    const { cookie } = await signIn(asStudent("SMS-2026-0001"));

    const signUp = await authPost(
      await apiRequest("POST", "/api/auth/sign-up/email", {
        json: {
          name: "Mallory",
          email: "mallory@example.com",
          password: PASSWORD,
        },
      }),
    );
    const rename = await authPost(
      await apiRequest("POST", "/api/auth/update-user", {
        json: { name: "Someone Else" },
        headers: { cookie },
      }),
    );

    expect(signUp.status).toBe(404);
    expect(rename.status).toBe(404);
    expect(await db().user.count()).toBe(1);
  });
});

describe("sessions", () => {
  it("are described by the session endpoint, with the role and student number", async () => {
    await createStudent({ studentNumber: "SMS-2026-0001" });
    const { cookie } = await signIn(asStudent("SMS-2026-0001"));

    const response = await authGet(
      await apiRequest("GET", "/api/auth/get-session", { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({
      user: { role: "student", studentNumber: "SMS-2026-0001" },
    });
  });

  it("end when the user signs out, so the cookie stops working", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const cookie = sessionCookieFrom(await signInWith(EMAIL, PASSWORD));

    const response = await authPost(
      // As the browser sends it: an empty JSON body, and the page's origin.
      await apiRequest("POST", "/api/auth/sign-out", {
        json: {},
        headers: { cookie, origin: "http://localhost:3000" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await db().session.count()).toBe(0);
    expect(await studentsListStatus(cookie)).toBe(401);
  });

  it("stop working once they expire", async () => {
    const { cookie } = await signIn(STAFF);
    await db().session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await studentsListStatus(cookie)).toBe(401);
  });

  it("stop working when sign-in is turned off for the account", async () => {
    const { cookie, session } = await signIn(STAFF);
    await db().user.update({
      where: { id: session.userId },
      data: { disabledAt: new Date() },
    });

    expect(await studentsListStatus(cookie)).toBe(401);
  });

  it("only count with the app's signature", async () => {
    const { cookie } = await signIn(STAFF);
    const [token] = decodeURIComponent(cookie.split("=")[1] ?? "").split(".");
    const forged = `${SESSION_COOKIE}=${encodeURIComponent(`${token ?? ""}.${"A".repeat(43)}=`)}`;

    expect(await studentsListStatus(cookie)).toBe(200);
    expect(await studentsListStatus(forged)).toBe(401);
  });
});
