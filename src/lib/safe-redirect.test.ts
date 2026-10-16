import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNextPath("/staff/students?status=ENROLLED")).toBe(
      "/staff/students?status=ENROLLED",
    );
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example/"],
    ["//evil.example/"],
    ["/\\evil.example/"],
    ["javascript:alert(1)"],
    ["/staff\nSet-Cookie: x=1"],
  ])("sends %j home instead", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
