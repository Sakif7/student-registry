import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatDays, formatMoney } from "./format";

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
});

describe("formatDays", () => {
  it("uses the singular for one day", () => {
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(0)).toBe("0 days");
    expect(formatDays(30)).toBe("30 days");
  });
});
