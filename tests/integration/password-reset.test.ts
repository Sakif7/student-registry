// Password-reset links through Better Auth's endpoints (/api/auth/*): asking
// for a link by email, following it, and choosing a new password. The same
// link activates an account that has never had a password.
import { describe, expect, it } from "vitest";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...all]/route";
import { db } from "@/server/db";

import { createStudent, createUser } from "../helpers/factories";
import { linkIn, sentEmails } from "../helpers/outbox";
import { apiRequest, bodyOf } from "../helpers/requests";

const EMAIL = "rachel.moss@college.example";
const OLD_PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "a-brand-new-passphrase";
// A documentation address (RFC 5737). Requests are rate limited per address.
const ADDRESS = "203.0.113.9";
const HOUR_MS = 60 * 60 * 1000;

async function requestReset(email: string): Promise<Response> {
  return authPost(
    await apiRequest("POST", "/api/auth/request-password-reset", {
      json: { email, redirectTo: "/reset-password" },
      headers: { "x-forwarded-for": ADDRESS },
    }),
  );
}

/** Asks for a link for the address, and returns the token in the email. */
async function emailedToken(email: string): Promise<string> {
  expect((await requestReset(email)).status).toBe(200);
  const sent = sentEmails().at(-1);
  if (!sent) throw new Error("No email was sent.");
  return new URL(linkIn(sent)).pathname.split("/").at(-1) ?? "";
}

async function resetPassword(
  token: string,
  newPassword: string,
): Promise<Response> {
  return authPost(
    await apiRequest("POST", "/api/auth/reset-password", {
      json: { token, newPassword },
    }),
  );
}

async function signInStatus(email: string, password: string): Promise<number> {
  const response = await authPost(
    await apiRequest("POST", "/api/auth/sign-in/email", {
      json: { email, password },
      headers: { "x-forwarded-for": ADDRESS },
    }),
  );
  return response.status;
}

/** A student enrolled with an account that has no password yet. */
async function pendingStudent() {
  const student = await createStudent({ email: "oliver@student.example" });
  return db().user.create({
    data: {
      name: student.fullName,
      email: student.email,
      role: "student",
      studentNumber: student.studentNumber,
    },
  });
}

describe("asking for a reset link", () => {
  it("emails a single-use link to an account with a password", async () => {
    await createUser({
      name: "Rachel Moss",
      email: EMAIL,
      password: OLD_PASSWORD,
    });

    const response = await requestReset(EMAIL);

    expect(response.status).toBe(200);
    const emails = sentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: EMAIL,
      subject: "Reset your Student Registry password",
    });
    expect(emails[0]?.text).toContain("Hello Rachel Moss,");
    expect(emails.map(linkIn)).toEqual([
      expect.stringMatching(
        /^http:\/\/localhost:3000\/api\/auth\/reset-password\/\w+\?callbackURL=%2Freset-password$/,
      ),
    ]);
  });

  it("sends the activation email to someone who has never set a password", async () => {
    const user = await pendingStudent();

    await requestReset(user.email);

    expect(sentEmails()).toEqual([
      expect.objectContaining({
        to: user.email,
        subject: "Activate your Student Registry account",
      }),
    ]);
  });

  it("answers the same whatever the address, and only emails a working account", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    await createUser({
      email: "turned.off@college.example",
      password: OLD_PASSWORD,
      disabledAt: new Date(),
    });

    const real = await requestReset(EMAIL);
    const unknown = await requestReset("nobody@college.example");
    const turnedOff = await requestReset("turned.off@college.example");

    const answer = await bodyOf(real);
    expect(await bodyOf(unknown)).toEqual(answer);
    expect(await bodyOf(turnedOff)).toEqual(answer);
    expect(sentEmails().map(({ to }) => to)).toEqual([EMAIL]);
  });

  it("allows ten requests a minute from one address", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });

    for (let request = 1; request <= 10; request += 1) {
      const email = `nobody${request}@college.example`;
      expect((await requestReset(email)).status).toBe(200);
    }

    expect((await requestReset(EMAIL)).status).toBe(429);
    expect(sentEmails()).toEqual([]);
  });
});

describe("emails per account", () => {
  it("are limited to three an hour, whatever the requests", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });

    for (let request = 1; request <= 4; request += 1) {
      expect((await requestReset(EMAIL)).status).toBe(200);
    }

    expect(sentEmails()).toHaveLength(3);
  });
});

describe("following the link", () => {
  it("opens the page for choosing a password, with the token", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    const token = await emailedToken(EMAIL);
    const [link] = sentEmails().map(linkIn);

    const response = await authGet(await apiRequest("GET", link ?? ""));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "http://localhost:3000/reset-password",
    );
    expect(location.searchParams.get("token")).toBe(token);
  });

  it("works for 72 hours, then opens the page with an error instead", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    await emailedToken(EMAIL);
    const [link] = sentEmails().map(linkIn);
    const verification = await db().verification.findFirstOrThrow();
    const hoursValid =
      (verification.expiresAt.getTime() - Date.now()) / HOUR_MS;
    expect(hoursValid).toBeGreaterThan(71.9);
    expect(hoursValid).toBeLessThanOrEqual(72);

    await db().verification.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await authGet(await apiRequest("GET", link ?? ""));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(location.searchParams.has("token")).toBe(false);
  });
});

describe("choosing a new password", () => {
  it("replaces the password and signs the account out everywhere", async () => {
    const user = await createUser({ email: EMAIL, password: OLD_PASSWORD });
    expect(await signInStatus(EMAIL, OLD_PASSWORD)).toBe(200);
    const token = await emailedToken(EMAIL);

    const response = await resetPassword(token, NEW_PASSWORD);

    expect(response.status).toBe(200);
    expect(await db().session.count({ where: { userId: user.id } })).toBe(0);
    expect(await signInStatus(EMAIL, OLD_PASSWORD)).toBe(401);
    expect(await signInStatus(EMAIL, NEW_PASSWORD)).toBe(200);
  });

  it("activates an account that never had a password", async () => {
    const user = await pendingStudent();
    const token = await emailedToken(user.email);

    expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);

    expect(
      await db().user.findUniqueOrThrow({ where: { id: user.id } }),
    ).toMatchObject({ emailVerified: true });
    expect(await signInStatus(user.email, NEW_PASSWORD)).toBe(200);
    // Activated, so a later link is a password reset.
    await requestReset(user.email);
    expect(sentEmails().at(-1)?.subject).toBe(
      "Reset your Student Registry password",
    );
  });

  it("lifts a lock from failed sign-ins", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await signInStatus(EMAIL, "not-the-password");
    }
    expect(await signInStatus(EMAIL, OLD_PASSWORD)).toBe(429);
    const token = await emailedToken(EMAIL);

    await resetPassword(token, NEW_PASSWORD);

    expect(await signInStatus(EMAIL, NEW_PASSWORD)).toBe(200);
  });

  it("accepts each link only once", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    const token = await emailedToken(EMAIL);
    await resetPassword(token, NEW_PASSWORD);

    const again = await resetPassword(token, "yet-another-passphrase");

    expect(again.status).toBe(400);
    expect(await bodyOf(again)).toMatchObject({ code: "INVALID_TOKEN" });
    expect(await signInStatus(EMAIL, NEW_PASSWORD)).toBe(200);
  });

  it("stops the account's other links working once a password is set", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    const older = await emailedToken(EMAIL);
    const newer = await emailedToken(EMAIL);

    expect((await resetPassword(newer, NEW_PASSWORD)).status).toBe(200);

    const stale = await resetPassword(older, "yet-another-passphrase");
    expect(stale.status).toBe(400);
    expect(await bodyOf(stale)).toMatchObject({ code: "INVALID_TOKEN" });
    expect(await signInStatus(EMAIL, NEW_PASSWORD)).toBe(200);
  });

  it("refuses a password under 12 characters, leaving the link usable", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    const token = await emailedToken(EMAIL);

    const tooShort = await resetPassword(token, "short-pass");

    expect(tooShort.status).toBe(400);
    expect(await bodyOf(tooShort)).toMatchObject({
      code: "PASSWORD_TOO_SHORT",
    });
    expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);
  });

  it("refuses an expired link", async () => {
    await createUser({ email: EMAIL, password: OLD_PASSWORD });
    const token = await emailedToken(EMAIL);
    await db().verification.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await resetPassword(token, NEW_PASSWORD);

    expect(response.status).toBe(400);
    expect(await signInStatus(EMAIL, OLD_PASSWORD)).toBe(200);
  });
});
