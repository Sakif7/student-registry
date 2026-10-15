import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  fromDbDate,
  instantToWallTime,
  isCalendarDate,
  toDbDate,
  todayIn,
  wallTimeToInstant,
} from "./college-time";

const LONDON = "Europe/London";

describe("isCalendarDate", () => {
  it.each(["2026-10-15", "2024-02-29", "1999-12-31"])("accepts %s", (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-10-5",
    "15/10/2026",
    "2026-10-15T00:00",
    "",
  ])("rejects %j", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});

describe("todayIn", () => {
  it("uses the time zone's date, not UTC's", () => {
    // 23:30 UTC on 15 October is 00:30 on 16 October in London (BST, UTC+1).
    const lateEvening = new Date("2026-10-15T23:30:00Z");
    expect(todayIn(LONDON, lateEvening)).toBe("2026-10-16");
    expect(todayIn("UTC", lateEvening)).toBe("2026-10-15");
  });

  it("is the same date in winter, when London is on UTC", () => {
    expect(todayIn(LONDON, new Date("2026-12-01T23:30:00Z"))).toBe(
      "2026-12-01",
    );
  });
});

describe("calendar arithmetic", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-10-15", 30)).toBe("2026-11-14");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, including across a DST change", () => {
    expect(daysBetween("2026-10-15", "2026-10-15")).toBe(0);
    expect(daysBetween("2026-10-20", "2026-10-30")).toBe(10);
    expect(daysBetween("2026-10-30", "2026-10-20")).toBe(-10);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("rejects malformed dates loudly", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("database dates", () => {
  it("round-trips a calendar date without a day shift", () => {
    // These tests run in Asia/Dhaka (UTC+6), where a Date built from local
    // midnight would be stored as the previous day.
    const stored = toDbDate("2004-05-17");
    expect(stored.toISOString()).toBe("2004-05-17T00:00:00.000Z");
    expect(fromDbDate(stored)).toBe("2004-05-17");
  });
});

describe("wallTimeToInstant", () => {
  it("reads summer time (BST, UTC+1)", () => {
    expect(wallTimeToInstant("2026-07-01T09:30", LONDON)?.toISOString()).toBe(
      "2026-07-01T08:30:00.000Z",
    );
  });

  it("reads winter time (GMT, UTC+0)", () => {
    expect(wallTimeToInstant("2026-11-20T17:00", LONDON)?.toISOString()).toBe(
      "2026-11-20T17:00:00.000Z",
    );
  });

  it("returns null for a time in the hour skipped when clocks go forward", () => {
    // 29 March 2026: 01:00 GMT jumps straight to 02:00 BST.
    expect(wallTimeToInstant("2026-03-29T01:30", LONDON)).toBeNull();
  });

  it("handles the minutes either side of the skipped hour", () => {
    expect(wallTimeToInstant("2026-03-29T00:59", LONDON)?.toISOString()).toBe(
      "2026-03-29T00:59:00.000Z",
    );
    expect(wallTimeToInstant("2026-03-29T02:00", LONDON)?.toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
  });

  it("takes the first occurrence of a time in the repeated hour", () => {
    // 25 October 2026: 01:00-01:59 happens in BST, then again in GMT.
    expect(wallTimeToInstant("2026-10-25T01:30", LONDON)?.toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("works in other time zones", () => {
    expect(
      wallTimeToInstant("2026-10-15T17:00", "Asia/Dhaka")?.toISOString(),
    ).toBe("2026-10-15T11:00:00.000Z");
  });

  it("rejects malformed input loudly", () => {
    expect(() => wallTimeToInstant("2026-10-15 17:00", LONDON)).toThrow(
      RangeError,
    );
  });
});

describe("instantToWallTime", () => {
  it("shows an instant as London wall-clock time", () => {
    expect(instantToWallTime(new Date("2026-07-01T08:30:00Z"), LONDON)).toBe(
      "2026-07-01T09:30",
    );
    expect(instantToWallTime(new Date("2026-11-20T17:00:00Z"), LONDON)).toBe(
      "2026-11-20T17:00",
    );
  });

  it("round-trips with wallTimeToInstant", () => {
    const instant = wallTimeToInstant("2026-10-25T01:30", LONDON);
    expect(instant && instantToWallTime(instant, LONDON)).toBe(
      "2026-10-25T01:30",
    );
  });
});
