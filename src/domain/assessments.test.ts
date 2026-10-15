import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  assessmentFormSchema,
  createAssessmentSchema,
  deadlineFieldSchema,
  deadlineSchema,
  updateAssessmentSchema,
} from "./assessments";

const LONDON = "Europe/London";
// 12:00 BST on 15 October 2026.
const NOW = new Date("2026-10-15T11:00:00.000Z");

const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("deadlineSchema", () => {
  const deadline = deadlineSchema(LONDON, NOW);

  it("reads the time as London time, in winter and in summer", () => {
    // GMT (UTC+0) in November, BST (UTC+1) in October.
    expect(deadline.parse("2026-11-20T17:00")).toEqual(
      new Date("2026-11-20T17:00:00.000Z"),
    );
    expect(deadline.parse("2026-10-20T17:00")).toEqual(
      new Date("2026-10-20T16:00:00.000Z"),
    );
  });

  it("refuses a time skipped when the clocks go forward", () => {
    expect(firstMessage(deadline.safeParse("2027-03-28T01:30"))).toBe(
      "The clocks go forward at that time, so it never happens. Choose another time.",
    );
  });

  it("takes the first of a time that happens twice when the clocks go back", () => {
    // 01:30 on 25 October 2026 happens at 00:30 UTC (BST) and 01:30 UTC (GMT).
    expect(deadline.parse("2026-10-25T01:30")).toEqual(
      new Date("2026-10-25T00:30:00.000Z"),
    );
  });

  it("must be in the future", () => {
    expect(firstMessage(deadline.safeParse("2026-10-15T12:00"))).toBe(
      "The deadline must be in the future",
    );
    expect(deadline.parse("2026-10-15T12:01")).toEqual(
      new Date("2026-10-15T11:01:00.000Z"),
    );
  });
});

describe("createAssessmentSchema", () => {
  const schema = createAssessmentSchema(LONDON, NOW);

  it("accepts a module, a title and a deadline", () => {
    expect(
      schema.parse({
        moduleCode: " CS4001 ",
        title: "  Coursework 1: Algorithms  ",
        deadline: "2026-11-20T17:00",
      }),
    ).toEqual({
      moduleCode: "CS4001",
      title: "Coursework 1: Algorithms",
      deadline: new Date("2026-11-20T17:00:00.000Z"),
    });
  });

  it("explains each missing field", () => {
    const result = schema.safeParse({
      moduleCode: "",
      title: " ",
      deadline: "",
    });
    expect(result.error && z.flattenError(result.error).fieldErrors).toEqual({
      moduleCode: ["Choose a module"],
      title: ["Enter a title"],
      deadline: ["Enter a date and time"],
    });
  });

  it("limits the title to 120 characters", () => {
    expect(
      firstMessage(
        schema.safeParse({
          moduleCode: "CS4001",
          title: "x".repeat(121),
          deadline: "2026-11-20T17:00",
        }),
      ),
    ).toBe("Use 120 characters or fewer");
  });
});

describe("updateAssessmentSchema", () => {
  const schema = updateAssessmentSchema(LONDON, NOW);

  it("accepts any one change", () => {
    expect(schema.parse({ closed: true })).toEqual({ closed: true });
    expect(schema.parse({ closed: false })).toEqual({ closed: false });
    expect(schema.parse({ deadline: "2026-12-01T09:00" })).toEqual({
      deadline: new Date("2026-12-01T09:00:00.000Z"),
    });
  });

  it("needs something to change", () => {
    expect(firstMessage(schema.safeParse({}))).toBe("Nothing to update");
  });

  it("refuses a closed flag that isn't true or false", () => {
    expect(firstMessage(schema.safeParse({ closed: "yes" }))).toBe(
      "Use true or false",
    );
  });
});

describe("assessmentFormSchema", () => {
  // The form checks against the time it is submitted, so these dates are far
  // from today in either direction.
  const schema = assessmentFormSchema(LONDON);

  it("keeps the deadline as typed, since the API converts it", () => {
    expect(
      schema.parse({
        moduleCode: "CS4001",
        title: "Essay",
        deadline: "2099-11-20T17:00",
      }),
    ).toEqual({
      moduleCode: "CS4001",
      title: "Essay",
      deadline: "2099-11-20T17:00",
    });
  });

  it("applies the same deadline rules as the API", () => {
    const deadlineError = (deadline: string) =>
      firstMessage(
        schema.safeParse({ moduleCode: "CS4001", title: "Essay", deadline }),
      );
    expect(deadlineError("2001-11-20T17:00")).toBe(
      "The deadline must be in the future",
    );
    // The last Sunday of March 2099 is the 29th.
    expect(deadlineError("2099-03-29T01:30")).toBe(
      "The clocks go forward at that time, so it never happens. Choose another time.",
    );
  });
});

describe("deadlineFieldSchema", () => {
  it("checks the deadline against the time of validation, not of creation", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-20T16:00:00.000Z"));
      const field = deadlineFieldSchema(LONDON);
      expect(field.safeParse("2026-11-20T17:00").success).toBe(true);
      vi.setSystemTime(new Date("2026-11-20T17:30:00.000Z"));
      expect(field.safeParse("2026-11-20T17:00").success).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
