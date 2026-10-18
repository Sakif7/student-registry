import { describe, expect, it } from "vitest";

import {
  checkDrop,
  checkRegistration,
  creditStanding,
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

  const live = { hasWork: false, ended: false };

  it("adds the core modules a student lacks, and leaves options to choose", () => {
    expect(
      registrationChanges(structure, [
        { moduleId: "core-1", credits: 30, ...live },
      ]),
    ).toEqual({ add: ["core-2"], drop: [], end: [], resume: [] });
  });

  it("drops modules from outside the year, or ends those the student has work for", () => {
    expect(
      registrationChanges(structure, [
        { moduleId: "core-1", credits: 30, ...live },
        { moduleId: "core-2", credits: 30, ...live },
        { moduleId: "option", credits: 15, ...live },
        { moduleId: "old-year", credits: 30, ...live },
        { moduleId: "old-with-work", credits: 30, ...live, hasWork: true },
        // Ended already: history, left as it is.
        { moduleId: "ended", credits: 30, hasWork: true, ended: true },
      ]),
    ).toEqual({
      add: [],
      drop: ["old-year"],
      end: ["old-with-work"],
      resume: [],
    });
  });

  it("resumes a module ended before, once it is back in the student's year", () => {
    expect(
      registrationChanges(structure, [
        { moduleId: "core-1", credits: 30, hasWork: true, ended: true },
        { moduleId: "core-2", credits: 30, ...live },
      ]),
    ).toEqual({ add: [], drop: [], end: [], resume: ["core-1"] });
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
  const free = { hasWork: false, wasDue: false };

  it("drops an optional module, or one from outside the year, without work", () => {
    expect(
      checkDrop({ status: "ENROLLED", kind: "OPTIONAL", ...free }),
    ).toEqual({
      allowed: true,
    });
    expect(checkDrop({ status: "ENROLLED", kind: null, ...free })).toEqual({
      allowed: true,
    });
  });

  it("changes nothing for a student who isn't enrolled", () => {
    for (const status of ["DEFERRED", "WITHDRAWN", "COMPLETED"] as const) {
      expect(checkDrop({ status, kind: "OPTIONAL", ...free })).toEqual({
        allowed: false,
        reason: "NOT_ENROLLED",
      });
    }
  });

  it("keeps core modules and modules with work", () => {
    expect(checkDrop({ status: "ENROLLED", kind: "CORE", ...free })).toEqual({
      allowed: false,
      reason: "CORE",
    });
    expect(
      checkDrop({
        status: "ENROLLED",
        kind: "OPTIONAL",
        ...free,
        hasWork: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "HAS_WORK",
    });
  });

  it("keeps a module once one of its deadlines has passed, work or not", () => {
    expect(
      checkDrop({
        status: "ENROLLED",
        kind: "OPTIONAL",
        ...free,
        wasDue: true,
      }),
    ).toEqual({ allowed: false, reason: "WAS_DUE" });
  });
});

describe("registeredCredits", () => {
  it("adds up the credits", () => {
    expect(registeredCredits([{ credits: 30 }, { credits: 15 }])).toBe(45);
    expect(registeredCredits([])).toBe(0);
    // A module left during the year no longer counts.
    expect(
      registeredCredits([{ credits: 30 }, { credits: 15, ended: true }]),
    ).toBe(30);
  });
});

describe("creditStanding", () => {
  it("says how many credits are still to choose", () => {
    expect(creditStanding(105, 120)).toEqual({ kind: "short", credits: 15 });
    expect(creditStanding(0, 180)).toEqual({ kind: "short", credits: 180 });
  });

  it("knows a year that is exactly full", () => {
    expect(creditStanding(120, 120)).toEqual({ kind: "full", credits: 0 });
  });

  it("says how far a year has gone over, as a late core module can take it", () => {
    expect(creditStanding(150, 120)).toEqual({ kind: "over", credits: 30 });
  });
});
