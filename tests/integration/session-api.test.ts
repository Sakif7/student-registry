// /api/session: starting, reading and ending the demo session.
import { describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/session/route";

import { createStudent } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
} from "../helpers/requests";

const noParams = routeContext({});

describe("POST /api/session", () => {
  it("starts a staff session in an HttpOnly, SameSite=Lax cookie", async () => {
    const response = await POST(
      apiRequest("POST", "/api/session", { json: { role: "staff" } }),
      noParams,
    );

    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ session: { role: "staff" } });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sms_session=staff");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/");
  });

  it("starts a session as an existing student, whatever the case of the ID", async () => {
    const student = await createStudent();
    const response = await POST(
      apiRequest("POST", "/api/session", {
        json: {
          role: "student",
          studentNumber: student.studentNumber.toLowerCase(),
        },
      }),
      noParams,
    );

    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({
      session: { role: "student", studentNumber: student.studentNumber },
    });
  });

  it("refuses a student who doesn't exist", async () => {
    const response = await POST(
      apiRequest("POST", "/api/session", {
        json: { role: "student", studentNumber: "SMS-2026-9999" },
      }),
      noParams,
    );

    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({
      detail: "There is no student with ID SMS-2026-9999.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("explains invalid input field by field", async () => {
    const response = await POST(
      apiRequest("POST", "/api/session", {
        json: { role: "student", studentNumber: "12345" },
      }),
      noParams,
    );

    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: { studentNumber: ["Enter a student ID such as SMS-2026-0001"] },
    });
  });

  it("rejects an unknown role", async () => {
    const response = await POST(
      apiRequest("POST", "/api/session", { json: { role: "admin" } }),
      noParams,
    );
    expect(response.status).toBe(400);
  });

  it("blocks a cross-site request", async () => {
    const response = await POST(
      apiRequest("POST", "/api/session", {
        json: { role: "staff" },
        headers: { origin: "https://evil.example" },
      }),
      noParams,
    );
    expect(response.status).toBe(403);
  });
});

describe("GET /api/session", () => {
  it("returns the current session, or null without one", async () => {
    const student = asStudent("SMS-2026-0001");
    expect(
      await bodyOf(
        await GET(
          apiRequest("GET", "/api/session", { session: student }),
          noParams,
        ),
      ),
    ).toEqual({ session: student });
    expect(
      await bodyOf(await GET(apiRequest("GET", "/api/session"), noParams)),
    ).toEqual({ session: null });
  });
});

describe("DELETE /api/session", () => {
  it("ends the session by expiring the cookie", async () => {
    const response = await DELETE(
      apiRequest("DELETE", "/api/session", { session: STAFF }),
      noParams,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(
      /sms_session=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i,
    );
  });
});
