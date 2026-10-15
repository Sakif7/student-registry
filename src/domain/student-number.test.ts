import { describe, expect, it } from "vitest";

import { formatStudentNumber, isStudentNumber } from "./student-number";

describe("formatStudentNumber", () => {
  it("pads the sequence to four digits", () => {
    expect(formatStudentNumber(2026, 1)).toBe("SMS-2026-0001");
    expect(formatStudentNumber(2026, 9_999)).toBe("SMS-2026-9999");
  });

  it("widens after 9999 instead of failing or wrapping", () => {
    expect(formatStudentNumber(2026, 10_000)).toBe("SMS-2026-10000");
  });

  it.each([
    [26, 1],
    [2026, 0],
    [2026, 1.5],
  ])("rejects year %i with sequence %i", (year, sequence) => {
    expect(() => formatStudentNumber(year, sequence)).toThrow(RangeError);
  });
});

describe("isStudentNumber", () => {
  it.each(["SMS-2026-0001", "SMS-2026-10000"])("accepts %s", (value) => {
    expect(isStudentNumber(value)).toBe(true);
  });

  it.each(["sms-2026-0001", "SMS-2026-001", "SMS-26-0001", "SMS-2026-0001 "])(
    "rejects %j",
    (value) => {
      expect(isStudentNumber(value)).toBe(false);
    },
  );
});
