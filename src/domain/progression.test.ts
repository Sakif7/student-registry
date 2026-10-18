import { describe, expect, it } from "vitest";

import {
  progressionQuerySchema,
  progressionTargets,
  stepLabel,
  stepsFor,
  suggestedStep,
} from "./progression";

describe("a student's next step", () => {
  it("is up a year, or complete in the programme's final year", () => {
    expect(suggestedStep(1, 3)).toBe("next");
    expect(suggestedStep(3, 3)).toBe("complete");
    // A one-year programme's students complete it.
    expect(suggestedStep(1, 1)).toBe("complete");
  });

  it("can be changed to repeating the year, or waiting", () => {
    expect(stepsFor(1, 3)).toEqual(["next", "repeat", "leave"]);
    expect(stepsFor(3, 3)).toEqual(["complete", "repeat", "leave"]);
  });

  it("reads as the year it leads to", () => {
    expect(stepLabel("next", 1)).toBe("Year 2");
    expect(stepLabel("repeat", 1)).toBe("Repeat year 1");
    expect(stepLabel("complete", 3)).toBe("Complete");
    expect(stepLabel("leave", 2)).toBe("Leave for now");
  });
});

describe("progressionTargets", () => {
  it("moves students on to this year, and from August to next year too", () => {
    expect(progressionTargets("2026-10-15")).toEqual(["2026/27"]);
    expect(progressionTargets("2027-07-31")).toEqual(["2026/27"]);
    expect(progressionTargets("2027-08-01")).toEqual(["2026/27", "2027/28"]);
  });
});

describe("progressionQuerySchema", () => {
  it("reads the year from the address, and ignores anything odd", () => {
    expect(
      progressionQuerySchema.parse({
        to: "2026-27",
        programme: "bsc-cs",
        year: "2",
      }),
    ).toMatchObject({ to: "2026/27", programme: "BSC-CS", year: 2 });
    expect(
      progressionQuerySchema.parse({ to: "2026-28", year: "x" }),
    ).toMatchObject({ to: undefined, year: undefined });
  });
});
