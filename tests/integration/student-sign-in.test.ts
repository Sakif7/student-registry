// Students' sign-in accounts: created at enrolment with an activation email,
// managed by staff through /api/students/{number}/sign-in, and kept in step
// with the student's record.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...all]/route";
import { PATCH as editStudent } from "@/app/api/students/[studentNumber]/route";
import { POST as sendLink } from "@/app/api/students/[studentNumber]/sign-in/link/route";
import {
  GET as getSignIn,
  PATCH as setSignIn,
} from "@/app/api/students/[studentNumber]/sign-in/route";
import {
  GET as listStudents,
  POST as enrolStudent,
} from "@/app/api/students/route";
import { db } from "@/server/db";
import { sendEmail } from "@/server/mail";

import {
  createProgramme,
  createStudent,
  createUser,
} from "../helpers/factories";
import { linkIn, sentEmails } from "../helpers/outbox";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  signIn,
  STAFF,
  type Viewer,
} from "../helpers/requests";

const PASSWORD = "correct-horse-battery-staple";
const GRACE = "grace.thompson@student.example";

interface SignInBody {
  signIn: {
    email: string;
    state: string;
    activatedAt: string | null;
    disabledAt: string | null;
    link: { sentAt: string; expiresAt: string } | null;
    devices: number;
  };
}

async function enrolGrace(
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return enrolStudent(
    await apiRequest("POST", "/api/students", {
      session: STAFF,
      json: {
        fullName: "Grace Thompson",
        email: GRACE,
        dateOfBirth: "2005-03-12",
        programmeCode: "BSC-CS",
        academicYear: "2026/27",
        ...extra,
      },
    }),
    routeContext({}),
  );
}

async function signInStatus(email: string, password: string): Promise<number> {
  const response = await authPost(
    await apiRequest("POST", "/api/auth/sign-in/email", {
      json: { email, password },
    }),
  );
  return response.status;
}

/** Follows an emailed link to its page, and returns the page's URL. */
async function follow(link: string): Promise<URL> {
  const response = await authGet(await apiRequest("GET", link));
  return new URL(response.headers.get("location") ?? "");
}

async function setPassword(token: string, newPassword = PASSWORD) {
  return authPost(
    await apiRequest("POST", "/api/auth/reset-password", {
      json: { token, newPassword },
    }),
  );
}

async function readSignIn(studentNumber: string, viewer: Viewer = STAFF) {
  const response = await getSignIn(
    await apiRequest("GET", `/api/students/${studentNumber}/sign-in`, {
      session: viewer,
    }),
    routeContext({ studentNumber }),
  );
  return { status: response.status, body: await bodyOf<SignInBody>(response) };
}

async function emailLink(studentNumber: string, viewer: Viewer = STAFF) {
  return sendLink(
    await apiRequest("POST", `/api/students/${studentNumber}/sign-in/link`, {
      session: viewer,
    }),
    routeContext({ studentNumber }),
  );
}

async function turnSignIn(
  studentNumber: string,
  json: unknown,
  viewer: Viewer = STAFF,
) {
  return setSignIn(
    await apiRequest("PATCH", `/api/students/${studentNumber}/sign-in`, {
      session: viewer,
      json,
    }),
    routeContext({ studentNumber }),
  );
}

/** A student who has activated their account with PASSWORD. */
async function activeStudent(studentNumber = "SMS-2026-0001") {
  const student = await createStudent({
    studentNumber,
    fullName: "Oliver Bennett",
    email: "oliver.bennett@student.example",
  });
  await createUser({
    name: student.fullName,
    email: student.email,
    role: "student",
    studentNumber,
    password: PASSWORD,
  });
  return student;
}

/** The token in the newest emailed link. */
function newestToken(): string {
  const email = sentEmails().at(-1);
  if (!email) throw new Error("No email was sent.");
  return new URL(linkIn(email)).pathname.split("/").at(-1) ?? "";
}

beforeEach(async () => {
  await createProgramme({ code: "BSC-CS" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enrolling a student", () => {
  it("creates an account waiting for activation, and emails a link to activate it", async () => {
    const response = await enrolGrace();

    expect(response.status).toBe(201);
    const { student, activationEmail } = await bodyOf<{
      student: { studentNumber: string };
      activationEmail: unknown;
    }>(response);
    expect(activationEmail).toEqual({
      kind: "activation",
      to: GRACE,
      sent: true,
    });
    expect(
      await db().user.findUniqueOrThrow({ where: { email: GRACE } }),
    ).toMatchObject({
      name: "Grace Thompson",
      role: "student",
      studentNumber: student.studentNumber,
      emailVerified: false,
    });
    const [email] = sentEmails();
    expect(email).toMatchObject({
      to: GRACE,
      subject: "Activate your Student Registry account",
    });

    const page = await follow(linkIn(email));
    expect(page.pathname).toBe("/activate");
    const token = page.searchParams.get("token") ?? "";
    expect((await setPassword(token)).status).toBe(200);
    expect(await signInStatus(GRACE, PASSWORD)).toBe(200);
  });

  it("sets the password staff give instead, so the student can sign in at once", async () => {
    const response = await enrolGrace({ password: PASSWORD });

    expect(response.status).toBe(201);
    const { student, activationEmail } = await bodyOf<{
      student: { studentNumber: string };
      activationEmail: unknown;
    }>(response);
    expect(activationEmail).toBeNull();
    expect(sentEmails()).toEqual([]);
    expect(await signInStatus(GRACE, PASSWORD)).toBe(200);
    expect((await readSignIn(student.studentNumber)).body.signIn).toMatchObject(
      { state: "ACTIVE", link: null },
    );
    expect(
      await db().auditEvent.findMany({
        where: { action: { startsWith: "sign_in." } },
        select: { action: true },
      }),
    ).toEqual([{ action: "sign_in.password_set" }]);
  });

  it("refuses a password too short to set", async () => {
    const response = await enrolGrace({ password: "too-short" });

    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: { password: ["Use at least 12 characters"] },
    });
    expect(await db().student.count()).toBe(0);
  });

  it("still enrols the student when the email can't be sent, and says so", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await enrolGrace();

    expect(response.status).toBe(201);
    expect(await bodyOf(response)).toMatchObject({
      activationEmail: { kind: "activation", to: GRACE, sent: false },
    });
    expect(await db().student.count()).toBe(1);
    // An unsent link can't be used, so none is kept.
    expect(await db().verification.count()).toBe(0);
  });

  it("refuses an address that a member of staff signs in with", async () => {
    await createUser({ email: GRACE, password: PASSWORD });

    const response = await enrolGrace();

    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: { email: ["Another account already uses this email address"] },
    });
    expect(await db().student.count()).toBe(0);
  });
});

describe("a student's sign-in, for staff", () => {
  it("shows an account waiting for activation, and the link sent", async () => {
    const enrolled = await enrolGrace();
    const { student } = await bodyOf<{ student: { studentNumber: string } }>(
      enrolled,
    );

    const { status, body } = await readSignIn(student.studentNumber);

    expect(status).toBe(200);
    expect(body.signIn).toMatchObject({
      email: GRACE,
      state: "PENDING",
      activatedAt: null,
      disabledAt: null,
      devices: 0,
    });
    expect(body.signIn.link).not.toBeNull();
  });

  it("shows when an active account was activated, and how many devices it's on", async () => {
    await activeStudent();
    await signIn(asStudent("SMS-2026-0001"));

    const { body } = await readSignIn("sms-2026-0001");

    expect(body.signIn).toMatchObject({ state: "ACTIVE", devices: 1 });
    expect(body.signIn.activatedAt).not.toBeNull();
  });

  it("is for staff only", async () => {
    await activeStudent();
    const student = asStudent("SMS-2026-0001");

    expect((await readSignIn("SMS-2026-0001", student)).status).toBe(403);
    expect((await emailLink("SMS-2026-0001", student)).status).toBe(403);
    expect(
      (await turnSignIn("SMS-2026-0001", { enabled: false }, student)).status,
    ).toBe(403);
  });

  it("answers 404 for an unknown student", async () => {
    expect((await readSignIn("SMS-2026-9999")).status).toBe(404);
    expect((await emailLink("SMS-2026-9999")).status).toBe(404);
  });

  it("emails an active student a password reset link that replaces any earlier one", async () => {
    await activeStudent();

    const first = await emailLink("SMS-2026-0001");
    const firstToken = newestToken();
    await emailLink("SMS-2026-0001");
    const secondToken = newestToken();

    expect(first.status).toBe(200);
    expect(await bodyOf(first)).toEqual({
      link: {
        kind: "reset",
        to: "oliver.bennett@student.example",
        sent: true,
      },
    });
    expect(sentEmails().at(-1)?.subject).toBe(
      "Reset your Student Registry password",
    );
    expect(
      (await setPassword(firstToken, "a-brand-new-passphrase")).status,
    ).toBe(400);
    expect(
      (await setPassword(secondToken, "a-brand-new-passphrase")).status,
    ).toBe(200);
  });

  it("answers 503 when the email can't be sent, keeping no link", async () => {
    await activeStudent();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await emailLink("SMS-2026-0001");

    expect(response.status).toBe(503);
    expect((await readSignIn("SMS-2026-0001")).body.signIn.link).toBeNull();
  });

  it("turns sign-in off, signing the student out everywhere and cancelling links", async () => {
    await activeStudent();
    const { cookie } = await signIn(asStudent("SMS-2026-0001"));
    await emailLink("SMS-2026-0001");
    const token = newestToken();

    const response = await turnSignIn("SMS-2026-0001", { enabled: false });

    expect(response.status).toBe(200);
    expect(await bodyOf<SignInBody>(response)).toMatchObject({
      signIn: { state: "DISABLED", devices: 0, link: null },
    });
    const withOldCookie = await listStudents(
      await apiRequest("GET", "/api/students", { headers: { cookie } }),
      routeContext({}),
    );
    expect(withOldCookie.status).toBe(401);
    expect(await signInStatus("oliver.bennett@student.example", PASSWORD)).toBe(
      403,
    );
    expect((await setPassword(token, "a-brand-new-passphrase")).status).toBe(
      400,
    );
    expect((await emailLink("SMS-2026-0001")).status).toBe(409);
  });

  it("keeps the date sign-in was first turned off", async () => {
    await activeStudent();
    await turnSignIn("SMS-2026-0001", { enabled: false });
    const first = (await readSignIn("SMS-2026-0001")).body.signIn.disabledAt;

    await turnSignIn("SMS-2026-0001", { enabled: false });

    expect((await readSignIn("SMS-2026-0001")).body.signIn.disabledAt).toBe(
      first,
    );
  });

  it("turns sign-in back on", async () => {
    await activeStudent();
    await turnSignIn("SMS-2026-0001", { enabled: false });

    const response = await turnSignIn("SMS-2026-0001", { enabled: true });

    expect(await bodyOf<SignInBody>(response)).toMatchObject({
      signIn: { state: "ACTIVE", disabledAt: null },
    });
    expect(await signInStatus("oliver.bennett@student.example", PASSWORD)).toBe(
      200,
    );
  });

  it("creates the account of a student who has none, when sending the activation email", async () => {
    // Enrolled before sign-in existed, with an address another account had.
    await createStudent({
      studentNumber: "SMS-2026-0001",
      email: "oliver.bennett@student.example",
    });
    expect((await readSignIn("SMS-2026-0001")).body.signIn).toMatchObject({
      state: "PENDING",
      link: null,
    });

    const response = await emailLink("SMS-2026-0001");

    expect(await bodyOf(response)).toMatchObject({
      link: { kind: "activation", sent: true },
    });
    expect(
      await db().user.findUnique({ where: { studentNumber: "SMS-2026-0001" } }),
    ).toMatchObject({
      email: "oliver.bennett@student.example",
      role: "student",
    });
  });

  it("asks for a new address when the student's is another account's", async () => {
    await createStudent({
      studentNumber: "SMS-2026-0001",
      email: "rachel.moss@college.example",
    });
    await createUser({
      email: "rachel.moss@college.example",
      password: PASSWORD,
    });

    const response = await emailLink("SMS-2026-0001");

    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      detail:
        "Another account already uses this student's email address. Change the student's email first.",
    });
  });

  it("needs to be told whether sign-in should be on", async () => {
    await activeStudent();

    const response = await turnSignIn("SMS-2026-0001", { enabled: "no" });

    expect(response.status).toBe(400);
  });
});

describe("editing the student's record", () => {
  async function edit(json: unknown) {
    return editStudent(
      await apiRequest("PATCH", "/api/students/SMS-2026-0001", {
        session: STAFF,
        json,
      }),
      routeContext({ studentNumber: "SMS-2026-0001" }),
    );
  }

  it("moves the account to the new name and address, cancelling links sent to the old one", async () => {
    await activeStudent();
    await emailLink("SMS-2026-0001");
    const token = newestToken();

    const response = await edit({
      fullName: "Oliver J. Bennett",
      email: "oliver.j.bennett@student.example",
    });

    expect(response.status).toBe(200);
    expect(
      await db().user.findUniqueOrThrow({
        where: { studentNumber: "SMS-2026-0001" },
      }),
    ).toMatchObject({
      name: "Oliver J. Bennett",
      email: "oliver.j.bennett@student.example",
    });
    expect((await setPassword(token, "a-brand-new-passphrase")).status).toBe(
      400,
    );
    expect(
      await signInStatus("oliver.j.bennett@student.example", PASSWORD),
    ).toBe(200);
    expect(await signInStatus("oliver.bennett@student.example", PASSWORD)).toBe(
      401,
    );
  });

  it("refuses an address another account uses", async () => {
    await activeStudent();
    await createUser({
      email: "rachel.moss@college.example",
      password: PASSWORD,
    });

    const response = await edit({ email: "rachel.moss@college.example" });

    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: { email: ["Another account already uses this email address"] },
    });
  });
});
