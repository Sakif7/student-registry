// The signed-in user's own account through /api/account: changing their
// password, and the devices they are signed in on.
import { describe, expect, it } from "vitest";

import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as changePasswordRoute } from "@/app/api/account/password/route";
import { DELETE as signOutDeviceRoute } from "@/app/api/account/sessions/[sessionId]/route";
import {
  DELETE as signOutOthersRoute,
  GET as listDevicesRoute,
} from "@/app/api/account/sessions/route";
import { GET as listStudents } from "@/app/api/students/route";
import { db } from "@/server/db";

import { createUser } from "../helpers/factories";
import { apiRequest, bodyOf, routeContext } from "../helpers/requests";
import { SESSION_COOKIE } from "../helpers/session-cookie";

const EMAIL = "rachel.moss@college.example";
const PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "a-brand-new-passphrase";
const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

/** Signs in through Better Auth from a device, and returns its cookie. */
async function signInFrom(
  userAgent: string,
  password = PASSWORD,
): Promise<string> {
  const response = await authPost(
    await apiRequest("POST", "/api/auth/sign-in/email", {
      json: { email: EMAIL, password },
      headers: { "user-agent": userAgent, "x-forwarded-for": "203.0.113.7" },
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.split(";")[0] ?? "";
}

async function signInStatus(password: string): Promise<number> {
  const response = await authPost(
    await apiRequest("POST", "/api/auth/sign-in/email", {
      json: { email: EMAIL, password },
    }),
  );
  return response.status;
}

async function changePassword(cookie: string, json: unknown) {
  return changePasswordRoute(
    await apiRequest("POST", "/api/account/password", {
      json,
      headers: { cookie },
    }),
    routeContext({}),
  );
}

async function devices(cookie: string) {
  const response = await listDevicesRoute(
    await apiRequest("GET", "/api/account/sessions", { headers: { cookie } }),
    routeContext({}),
  );
  return bodyOf<{
    devices: { id: string; device: string; current: boolean }[];
  }>(response);
}

/** Whether a cookie still signs its owner in. */
async function stillSignedIn(cookie: string): Promise<boolean> {
  const response = await listStudents(
    await apiRequest("GET", "/api/students", { headers: { cookie } }),
    routeContext({}),
  );
  return response.status === 200;
}

const change = {
  currentPassword: PASSWORD,
  password: NEW_PASSWORD,
  confirmation: NEW_PASSWORD,
};

describe("changing one's password", () => {
  it("replaces the password, and signs out every other device", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    const phone = await signInFrom(SAFARI_ON_IPHONE);

    const response = await changePassword(laptop, change);

    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ signedOutDevices: 1 });
    expect(await stillSignedIn(laptop)).toBe(true);
    expect(await stillSignedIn(phone)).toBe(false);
    expect(await signInStatus(PASSWORD)).toBe(401);
    expect(await signInStatus(NEW_PASSWORD)).toBe(200);
  });

  it("refuses a wrong current password, next to the field", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);

    const response = await changePassword(laptop, {
      ...change,
      currentPassword: "not-the-password",
    });

    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: { currentPassword: ["That isn't your current password"] },
    });
    expect(await signInStatus(PASSWORD)).toBe(200);
  });

  it("counts wrong current passwords as failed sign-ins, so guessing locks the address", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await changePassword(laptop, {
        ...change,
        currentPassword: `wrong-guess-${attempt}`,
      });
      expect(response.status).toBe(400);
    }

    const locked = await changePassword(laptop, change);

    expect(locked.status).toBe(429);
    expect(await bodyOf(locked)).toMatchObject({
      detail:
        "Too many failed attempts to sign in with this email address. Try again in 15 minutes.",
    });
    expect(await signInStatus(PASSWORD)).toBe(429);
  });

  it("checks the new password's rules", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);

    const response = await changePassword(laptop, {
      currentPassword: PASSWORD,
      password: "too-short",
      confirmation: "something-else",
    });

    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: {
        password: ["Use at least 12 characters"],
        confirmation: ["The passwords don't match"],
      },
    });
  });

  it("needs a session", async () => {
    expect((await changePassword("", change)).status).toBe(401);
  });
});

describe("the devices one is signed in on", () => {
  it("are listed with this one first and marked", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    await signInFrom(SAFARI_ON_IPHONE);

    const { devices: listed } = await devices(laptop);

    expect(listed).toMatchObject([
      { device: "Chrome on Windows", current: true },
      { device: "Safari on iPhone", current: false },
    ]);
  });

  it("can be signed out one at a time", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    const phone = await signInFrom(SAFARI_ON_IPHONE);
    const [, other] = (await devices(laptop)).devices;

    const response = await signOutDeviceRoute(
      await apiRequest("DELETE", `/api/account/sessions/${other?.id ?? ""}`, {
        headers: { cookie: laptop },
      }),
      routeContext({ sessionId: other?.id ?? "" }),
    );

    expect(response.status).toBe(204);
    expect(await stillSignedIn(phone)).toBe(false);
    expect(await stillSignedIn(laptop)).toBe(true);
  });

  it("can be signed out all at once, except this one", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    await signInFrom(SAFARI_ON_IPHONE);
    await signInFrom(SAFARI_ON_IPHONE);

    const response = await signOutOthersRoute(
      await apiRequest("DELETE", "/api/account/sessions", {
        headers: { cookie: laptop },
      }),
      routeContext({}),
    );

    expect(await bodyOf(response)).toEqual({ signedOutDevices: 2 });
    expect((await devices(laptop)).devices).toHaveLength(1);
  });

  it("are only ever one's own", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    const other = await createUser({ password: PASSWORD });
    const theirs = await db().session.create({
      data: {
        token: "someone-elses-session",
        userId: other.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    for (const id of [theirs.id, "not-a-session-id"]) {
      const response = await signOutDeviceRoute(
        await apiRequest("DELETE", `/api/account/sessions/${id}`, {
          headers: { cookie: laptop },
        }),
        routeContext({ sessionId: id }),
      );
      expect(response.status).toBe(404);
    }
    expect(await db().session.count({ where: { userId: other.id } })).toBe(1);
  });

  it("don't include this one among those to sign out", async () => {
    await createUser({ email: EMAIL, password: PASSWORD });
    const laptop = await signInFrom(CHROME_ON_WINDOWS);
    const [current] = (await devices(laptop)).devices;

    const response = await signOutDeviceRoute(
      await apiRequest("DELETE", `/api/account/sessions/${current?.id ?? ""}`, {
        headers: { cookie: laptop },
      }),
      routeContext({ sessionId: current?.id ?? "" }),
    );

    expect(response.status).toBe(409);
    expect(await stillSignedIn(laptop)).toBe(true);
  });
});
