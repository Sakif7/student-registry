import { describe, expect, it } from "vitest";

import {
  checkDrop,
  checkRegistration,
  registeredCredits,
  registrationChanges,
  registrationRefusalMessage,
} from "./registration";

describe("registrationChanges", () => {
  const structure = [
    { moduleId: "core-1", kind: "CORE" as const },
    { moduleId: "core-2", kind: "CORE" as const },
    { moduleId: "option", kind: "OPTIONAL" as const },
  ];

  it("adds the core modules a student lacks, and leaves options to choose", () => {
    expect(
      registrationChanges(structure, [
        { moduleId: "core-1", credits: 30, hasWork: false },
      ]),
    ).toEqual({ add: ["core-2"], drop: [] });
  });

  it("drops modules from outside the year, unless the student has work for them", () => {
    expect(
      registrationChanges(structure, [
        { moduleId: "core-1", credits: 30, hasWork: false },
        { moduleId: "core-2", credits: 30, hasWork: false },
        { moduleId: "option", credits: 15, hasWork: false },
        { moduleId: "old-year", credits: 30, hasWork: false },
        { moduleId: "old-with-work", credits: 30, hasWork: true },
      ]),
    ).toEqual({ add: [], drop: ["old-year"] });
  });
});

describe("checkRegistration", () => {
  const allowed = {
    status: "ENROLLED" as const,
    kind: "OPTIONAL" as const,
    alreadyRegistered: false,
    registeredCredits: 90,
    moduleCredits: 30,
    creditsPerYear: 120,
  };

  it("allows a module of the student's year that fits the year's credits", () => {
    expect(checkRegistration(allowed)).toEqual({ allowed: true });
  });

  it.each([
    [{ status: "DEFERRED" as const }, "NOT_ENROLLED"],
    [{ kind: null }, "NOT_IN_PROGRAMME"],
    [{ alreadyRegistered: true }, "ALREADY_REGISTERED"],
    [{ registeredCredits: 105 }, "OVER_CREDITS"],
  ])("refuses %j", (change, reason) => {
    expect(checkRegistration({ ...allowed, ...change })).toEqual({
      allowed: false,
      reason,
    });
  });

  it("says by how much the credits would go over", () => {
    expect(
      registrationRefusalMessage("OVER_CREDITS", {
        registered: 105,
        module: 30,
        perYear: 120,
      }),
    ).toBe(
      "That would make 135 credits this year, more than the 120 a year carries.",
    );
  });
});

describe("checkDrop", () => {
  it("drops an optional module, or one from outside the year, without work", () => {
    expect(
      checkDrop({ status: "ENROLLED", kind: "OPTIONAL", hasWork: false }),
    ).toEqual({
      allowed: true,
    });
    expect(
      checkDrop({ status: "ENROLLED", kind: null, hasWork: false }),
    ).toEqual({
      allowed: true,
    });
  });

  it("changes nothing for a student who isn't enrolled", () => {
    for (const status of ["DEFERRED", "WITHDRAWN", "COMPLETED"] as const) {
      expect(checkDrop({ status, kind: "OPTIONAL", hasWork: false })).toEqual({
        allowed: false,
        reason: "NOT_ENROLLED",
      });
    }
  });

  it("keeps core modules and modules with work", () => {
    expect(
      checkDrop({ status: "ENROLLED", kind: "CORE", hasWork: false }),
    ).toEqual({
      allowed: false,
      reason: "CORE",
    });
    expect(
      checkDrop({ status: "ENROLLED", kind: "OPTIONAL", hasWork: true }),
    ).toEqual({
      allowed: false,
      reason: "HAS_WORK",
    });
  });
});

describe("registeredCredits", () => {
  it("adds up the credits", () => {
    expect(registeredCredits([{ credits: 30 }, { credits: 15 }])).toBe(45);
    expect(registeredCredits([])).toBe(0);
  });
});
