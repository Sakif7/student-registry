import { describe, expect, it } from "vitest";

import { deadlineNotes, registeredOn } from "./deadline-notes";

const databases = { code: "CS4002", semester: "FIRST" as const };
const registered = { "2026/27": 24, "2027/28": 0 };
const calendars = {
  "2026/27": {
    semester1Start: "2026-09-21",
    semester1End: "2027-01-22",
    semester2Start: "2027-02-01",
    semester2End: "2027-06-11",
  },
};

describe("deadlineNotes", () => {
  it("names the year and the students it reaches", () => {
    expect(
      deadlineNotes("2026-11-20T17:00", databases, registered, calendars),
    ).toEqual([
      "Falls in 2026/27: 24 students are registered on CS4002 that year.",
    ]);
  });

  it("shows a year typed wrongly at once", () => {
    expect(
      deadlineNotes("2027-11-20T17:00", databases, registered, calendars),
    ).toEqual([
      "Falls in 2027/28: no student is registered on CS4002 that year yet.",
    ]);
    expect(
      deadlineNotes("2029-11-20T17:00", databases, registered, calendars),
    ).toEqual(["Falls in 2029/30."]);
  });

  it("says when it falls outside the module's semester", () => {
    expect(
      deadlineNotes("2027-07-15T17:00", databases, registered, calendars),
    ).toEqual([
      "Falls in 2026/27: 24 students are registered on CS4002 that year.",
      "CS4002 is taught in semester 1, from 21 Sep 2026 to 22 Jan 2027.",
    ]);
    // A module taught all year has no semester to fall outside.
    expect(
      deadlineNotes(
        "2027-07-15T17:00",
        { code: "CS6001", semester: "ALL_YEAR" },
        { "2026/27": 1 },
        calendars,
      ),
    ).toEqual([
      "Falls in 2026/27: 1 student is registered on CS6001 that year.",
    ]);
  });

  it("counts nobody registered as none, in the years counted only", () => {
    expect(
      registeredOn(
        {
          years: ["2026/27", "2027/28"],
          byModule: { CS4002: { "2026/27": 24 } },
        },
        "CS4002",
      ),
    ).toEqual({ "2026/27": 24, "2027/28": 0 });
  });

  it("has nothing to say about a deadline still being typed", () => {
    expect(deadlineNotes("", databases, registered, calendars)).toEqual([]);
    expect(deadlineNotes("2026-1", databases, registered, calendars)).toEqual(
      [],
    );
  });
});
