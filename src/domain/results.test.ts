import { describe, expect, it } from "vitest";

import {
  classify,
  isVisibleToStudent,
  markSchema,
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
