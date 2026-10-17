import { describe, expect, it } from "vitest";

import {
  canEnterMarks,
  classify,
  countByClassification,
  isVisibleToStudent,
  markFieldSchema,
  markSchema,
  marksheetSchema,
  withholdResultsSchema,
} from "./results";

describe("classify", () => {
  it.each([
    [0, "FAIL"],
    [39, "FAIL"],
    [40, "PASS"],
    [59, "PASS"],
    [60, "MERIT"],
    [69, "MERIT"],
    [70, "DISTINCTION"],
    [100, "DISTINCTION"],
  ])("classifies %i as %s", (mark, classification) => {
    expect(classify(mark)).toBe(classification);
  });
});

describe("countByClassification", () => {
  it("counts the marks in each classification, including those with none", () => {
    expect(countByClassification([35, 40, 59, 74, 81])).toEqual({
      FAIL: 1,
      PASS: 2,
      MERIT: 0,
      DISTINCTION: 2,
    });
  });
});

describe("markSchema", () => {
  it.each([0, 40, 100])("accepts %i", (mark) => {
    expect(markSchema.parse({ mark })).toEqual({ mark });
  });

  it.each([
    [-1, "Marks run from 0 to 100"],
    [101, "Marks run from 0 to 100"],
    [62.5, "Marks are whole numbers"],
    [Number.NaN, "Enter a mark from 0 to 100"],
  ])("rejects %s", (mark, message) => {
    expect(markSchema.safeParse({ mark }).error?.issues[0]?.message).toBe(
      message,
    );
  });

  it("rejects a mark sent as text", () => {
    expect(markSchema.safeParse({ mark: "65" }).success).toBe(false);
  });
});

describe("withholdResultsSchema", () => {
  it("requires a reason", () => {
    expect(
      withholdResultsSchema.safeParse({ reason: " " }).error?.issues[0]
        ?.message,
    ).toBe("Give a reason");
  });
});

describe("canEnterMarks", () => {
  const deadline = new Date("2026-11-20T17:00:00.000Z");

  it("waits for the deadline, while work can still change", () => {
    expect(canEnterMarks({ deadline, closedAt: null }, deadline)).toBe(false);
    expect(
      canEnterMarks(
        { deadline, closedAt: null },
        new Date("2026-11-20T17:00:01.000Z"),
      ),
    ).toBe(true);
  });

  it("allows marking once staff close the assessment, deadline or not", () => {
    const closedAt = new Date("2026-11-01T09:00:00.000Z");
    expect(canEnterMarks({ deadline, closedAt }, closedAt)).toBe(true);
  });
});

describe("isVisibleToStudent", () => {
  const published = { publishedAt: new Date("2026-10-01T09:00:00Z") };
  const unpublished = { publishedAt: null };

  it("shows a published result", () => {
    expect(isVisibleToStudent(published, false)).toBe(true);
  });

  it("hides an unpublished result", () => {
    expect(isVisibleToStudent(unpublished, false)).toBe(false);
  });

  it("hides even published results while results are withheld", () => {
    expect(isVisibleToStudent(published, true)).toBe(false);
  });
});

describe("marksheetSchema", () => {
  it("takes marks keyed by student ID, and null to remove one", () => {
    expect(
      marksheetSchema.parse({
        marks: { "sms-2025-0001": 72, "SMS-2026-0001": null },
      }),
    ).toEqual({ marks: { "SMS-2025-0001": 72, "SMS-2026-0001": null } });
  });

  it("explains a bad mark next to the student it belongs to", () => {
    const issue = marksheetSchema.safeParse({
      marks: { "SMS-2025-0001": 101 },
    }).error?.issues[0];
    expect(issue?.path).toEqual(["marks", "SMS-2025-0001"]);
    expect(issue?.message).toBe("Marks run from 0 to 100");
  });

  it("needs at least one mark, for real student IDs", () => {
    expect(
      marksheetSchema.safeParse({ marks: {} }).error?.issues[0]?.message,
    ).toBe("There are no marks to save");
    expect(
      marksheetSchema.safeParse({ marks: { amelia: 60 } }).error?.issues[0]
        ?.message,
    ).toBe("Not a student ID");
  });
});

describe("markFieldSchema", () => {
  it("reads a blank field as no mark and digits as a mark", () => {
    expect(markFieldSchema.parse("")).toBeNull();
    expect(markFieldSchema.parse(" 72 ")).toBe(72);
  });

  it.each([
    ["72.5", "Enter a whole number from 0 to 100"],
    ["-3", "Enter a whole number from 0 to 100"],
    ["abc", "Enter a whole number from 0 to 100"],
    ["101", "Marks run from 0 to 100"],
  ])("rejects %j", (text, message) => {
    expect(markFieldSchema.safeParse(text).error?.issues[0]?.message).toBe(
      message,
    );
  });
});
