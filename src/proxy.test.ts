import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

function visit(path: string, cookie?: string) {
  return proxy(
    new NextRequest(new URL(path, "http://localhost:3000"), {
      headers: cookie ? { cookie } : {},
    }),
  );
}

describe("proxy", () => {
  it("sends visitors without a session cookie to sign in, remembering where they were going", () => {
    const response = visit("/staff/students?status=ENROLLED&page=2");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fstaff%2Fstudents%3Fstatus%3DENROLLED%26page%3D2",
    );
  });

  it("doesn't remember the home page, which only sends people on", () => {
    expect(visit("/").headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("lets a request with a session cookie through, for the page to check", () => {
    const response = visit("/student", "registry.session_token=abc.def");

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("ignores cookies that aren't this app's session", () => {
    const response = visit("/staff", "better-auth.session_token=abc.def");

    expect(response.status).toBe(307);
  });
});
