import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "./errors";
import { handle, json, readJson } from "./http";
import { sessionFromRequest } from "./session";

// The session lookup needs the database; the integration tests cover it.
vi.mock("./session", () => ({ sessionFromRequest: vi.fn() }));

function post(headers: Record<string, string> = {}, body?: string) {
  return new NextRequest("http://localhost:3000/api/things", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.mocked(sessionFromRequest).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handle", () => {
  it("passes the signed-in user's session to the handler", async () => {
    const staff = {
      role: "staff",
      userId: "u1",
      name: "Jane Okafor",
      sessionId: "s1",
    } as const;
    vi.mocked(sessionFromRequest).mockResolvedValue(staff);
    const route = handle((_request, _context, session) =>
      Response.json({ session }),
    );
    const response = await route(
      new NextRequest("http://localhost:3000/api/things"),
      {},
    );
    expect(await response.json()).toEqual({ session: staff });
  });

  it("reports a failed session lookup as a server error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sessionFromRequest).mockRejectedValue(
      new Error("Can't reach database server"),
    );
    const route = handle(() => new Response(null, { status: 204 }));
    const response = await route(
      new NextRequest("http://localhost:3000/api/things"),
      {},
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database");
  });

  it("turns an AppError into problem details with field errors", async () => {
    const route = handle(() => {
      throw new AppError("CONFLICT", "Already exists.", { email: ["Taken"] });
    });
    const response = await route(post(), {});
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Already exists.",
      instance: "/api/things",
      errors: { email: ["Taken"] },
    });
  });

  it("logs an unexpected error but reveals nothing about it", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const route = handle(() => {
      throw new Error("password authentication failed for user registry");
    });
    const response = await route(post(), {});
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("Something went wrong. Please try again.");
    expect(body).not.toContain("password");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("blocks a write from another site", async () => {
    const route = handle(() => new Response(null, { status: 204 }));
    const response = await route(post({ origin: "https://evil.example" }), {});
    expect(response.status).toBe(403);
  });

  it("allows same-site writes and writes with no Origin (e.g. curl)", async () => {
    const route = handle(() => new Response(null, { status: 204 }));
    expect(
      (await route(post({ origin: "http://localhost:3000" }), {})).status,
    ).toBe(204);
    expect((await route(post(), {})).status).toBe(204);
  });

  it("treats an Origin that isn't an address, such as null, as another site", async () => {
    const route = handle(() => new Response(null, { status: 204 }));
    expect((await route(post({ origin: "null" }), {})).status).toBe(403);
    expect((await route(post({ origin: "::nonsense" }), {})).status).toBe(403);
  });

  it("refuses an address with a NUL character, which the database can't store", async () => {
    const route = handle(() => new Response(null, { status: 204 }));
    const response = await route(
      new NextRequest("http://localhost:3000/api/students?q=%00"),
      {},
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      detail: "The request contains a character that isn't allowed.",
    });
  });
});

describe("json", () => {
  it("tells browsers and proxies not to keep the response", () => {
    expect(json({ a: 1 }).headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });
});

describe("readJson", () => {
  it("reads a JSON body", async () => {
    await expect(
      readJson(post({ "content-type": "application/json" }, '{"a":1}')),
    ).resolves.toEqual({ a: 1 });
  });

  it("insists on a JSON content type", async () => {
    await expect(readJson(post({}, '{"a":1}'))).rejects.toMatchObject({
      kind: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects malformed JSON", async () => {
    await expect(
      readJson(post({ "content-type": "application/json" }, "{a:1")),
    ).rejects.toMatchObject({
      kind: "VALIDATION",
      message: "The request body isn't valid JSON.",
    });
  });

  it("reads the content type in any case", async () => {
    await expect(
      readJson(post({ "content-type": "Application/JSON" }, '{"a":1}')),
    ).resolves.toEqual({ a: 1 });
  });

  it("refuses a body over 1 MB, declared or not", async () => {
    const big = `{"a":"${"x".repeat(1024 * 1024)}"}`;
    await expect(
      readJson(post({ "content-type": "application/json" }, big)),
    ).rejects.toMatchObject({ kind: "PAYLOAD_TOO_LARGE" });
    await expect(
      readJson(
        post(
          { "content-type": "application/json", "content-length": "2000000" },
          "{}",
        ),
      ),
    ).rejects.toMatchObject({ kind: "PAYLOAD_TOO_LARGE" });
  });

  it("refuses a NUL character in any string or key", async () => {
    for (const body of [
      '{"reference":"A\\u0000B"}',
      '{"list":["ok","\\u0000"]}',
      '{"\\u0000":1}',
    ]) {
      await expect(
        readJson(post({ "content-type": "application/json" }, body)),
      ).rejects.toMatchObject({
        kind: "VALIDATION",
        message: "The request contains a character that isn't allowed.",
      });
    }
  });
});
