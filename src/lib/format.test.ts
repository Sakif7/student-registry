import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatDate,
  formatDateOf,
  formatDateTime,
  formatDays,
  formatDaysAway,
  formatDeadlineAway,
  formatFileSize,
  formatMoney,
} from "./format";

describe("formatMoney", () => {
  it("formats pence as pounds sterling", () => {
    expect(formatMoney(125_050)).toBe("£1,250.50");
    expect(formatMoney(0)).toBe("£0.00");
    expect(formatMoney(-1_000)).toBe("-£10.00");
  });
});

describe("formatDate", () => {
  it("formats a calendar date without shifting it", () => {
    // These tests run in Asia/Dhaka (UTC+6).
    expect(formatDate("2026-10-15")).toBe("15 Oct 2026");
    expect(formatDate("2027-01-01")).toBe("1 Jan 2027");
  });
});

describe("formatDateTime", () => {
  it("shows London time with GMT or BST", () => {
    expect(
      formatDateTime(new Date("2026-11-20T17:00:00Z"), "Europe/London"),
    ).toBe("Fri 20 Nov 2026, 17:00 GMT");
    expect(
      formatDateTime(new Date("2026-07-01T08:30:00Z"), "Europe/London"),
    ).toBe("Wed 1 Jul 2026, 09:30 BST");
  });

  it("can show the seconds, for a submission time", () => {
    expect(
      formatDateTime(new Date("2026-10-15T15:45:03.250Z"), "Europe/London", {
        seconds: true,
      }),
    ).toBe("Thu 15 Oct 2026, 16:45:03 BST");
  });
});

describe("formatDays", () => {
  it("uses the singular for one day", () => {
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(0)).toBe("0 days");
    expect(formatDays(30)).toBe("30 days");
  });
});

describe("formatDaysAway", () => {
  it.each([
    [0, "today"],
    [1, "tomorrow"],
    [3, "in 3 days"],
    [-1, "yesterday"],
    [-3, "3 days ago"],
  ])("writes %i days as %j", (days, text) => {
    expect(formatDaysAway(days)).toBe(text);
  });
});

describe("formatDeadlineAway", () => {
  const timeZone = "Europe/London";
  // 16:48 BST on Saturday 17 October 2026.
  const now = new Date("2026-10-17T15:48:00.000Z");

  it.each([
    // Midnight is "tomorrow" by the calendar, but only hours away.
    ["2026-10-17T23:00:00.000Z", "in 7 hours"],
    ["2026-10-17T16:47:00.000Z", "in 59 minutes"],
    ["2026-10-17T16:48:00.000Z", "in 1 hour"],
    ["2026-10-17T15:48:30.000Z", "in less than a minute"],
    ["2026-10-18T15:47:59.000Z", "in 23 hours"],
    ["2026-10-18T16:00:00.000Z", "in 24 hours"],
    // Midnight on Monday is two days away by the calendar, but 31 hours.
    ["2026-10-18T23:00:00.000Z", "in 31 hours"],
    ["2026-10-19T15:47:59.000Z", "in 47 hours"],
    ["2026-10-19T15:48:00.000Z", "in 2 days"],
    // 3 days and 12 minutes; 2 days and 23 hours is still "2 days".
    ["2026-10-20T16:00:00.000Z", "in 3 days"],
    ["2026-10-20T14:48:00.000Z", "in 2 days"],
    ["2026-10-17T09:00:00.000Z", "today"],
    ["2026-10-16T16:00:00.000Z", "yesterday"],
  ])("writes a deadline at %s as %j", (deadline, text) => {
    expect(formatDeadlineAway(new Date(deadline), now, timeZone)).toBe(text);
  });
});

describe("formatCount", () => {
  it("uses the singular for one, and the plural given or an added s", () => {
    expect(formatCount(1, "student")).toBe("1 student");
    expect(formatCount(0, "student")).toBe("0 students");
    expect(formatCount(2, "person", "people")).toBe("2 people");
  });
});

describe("formatFileSize", () => {
  it("uses bytes, KB or MB as the size suits", () => {
    expect(formatFileSize(900)).toBe("900 bytes");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("formatDateOf", () => {
  it("uses the date in the given time zone", () => {
    // 23:30 UTC on 15 October is already 16 October in London (BST).
    const lateEvening = new Date("2026-10-15T23:30:00Z");
    expect(formatDateOf(lateEvening, "Europe/London")).toBe("16 Oct 2026");
    expect(formatDateOf(lateEvening, "UTC")).toBe("15 Oct 2026");
  });
});
