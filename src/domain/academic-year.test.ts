import { describe, expect, it } from "vitest";

import {
  academicYearOn,
  academicYearSchema,
  academicYearStart,
  academicYearsAround,
  formatAcademicYear,
  isAcademicYear,
} from "./academic-year";

describe("academic year format", () => {
  it("reads the start year", () => {
    expect(academicYearStart("2026/27")).toBe(2026);
    expect(academicYearStart("2099/00")).toBe(2099);
  });

  it.each(["2026/28", "2026-27", "2026/2027", "26/27", "2026/7", ""])(
    "rejects %j",
    (value) => {
      expect(isAcademicYear(value)).toBe(false);
    },
  );

  it("writes the start year back, padding the second year", () => {
    expect(formatAcademicYear(2026)).toBe("2026/27");
    expect(formatAcademicYear(2008)).toBe("2008/09");
    expect(formatAcademicYear(2099)).toBe("2099/00");
  });
});

describe("academicYearOn", () => {
  it("starts a new academic year on 1 September", () => {
    expect(academicYearOn("2026-08-31")).toBe("2025/26");
    expect(academicYearOn("2026-09-01")).toBe("2026/27");
  });

  it("keeps January to August in the year that started the previous autumn", () => {
    expect(academicYearOn("2027-01-15")).toBe("2026/27");
  });
});

describe("academicYearsAround", () => {
  it("lists consecutive years oldest first", () => {
    expect(academicYearsAround("2026/27", 2, 1)).toEqual([
      "2024/25",
      "2025/26",
      "2026/27",
      "2027/28",
    ]);
  });

  it("rejects a malformed centre year", () => {
    expect(() => academicYearsAround("2026", 1, 1)).toThrow(RangeError);
  });
});

describe("academicYearSchema", () => {
  it("trims and accepts a valid year", () => {
    expect(academicYearSchema.parse(" 2026/27 ")).toBe("2026/27");
  });

  it("explains the expected format", () => {
    const result = academicYearSchema.safeParse("2026/28");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Use the format 2026/27, with consecutive years",
    );
  });
});
