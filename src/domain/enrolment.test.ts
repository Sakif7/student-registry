import { describe, expect, it } from "vitest";

import {
  allowedStatusChanges,
  canChangeStatus,
  canSubmitWork,
  ENROLMENT_STATUSES,
  EnrolmentStatus,
  statusAt,
  statusChangeNeedsReason,
} from "./enrolment";

const { ENROLLED, DEFERRED, WITHDRAWN, COMPLETED } = EnrolmentStatus;

describe("status changes", () => {
  // Every pair, so a change to the rules shows up as a failing row here.
  it.each([
    [ENROLLED, ENROLLED, false],
    [ENROLLED, DEFERRED, true],
    [ENROLLED, WITHDRAWN, true],
    [ENROLLED, COMPLETED, true],
    [DEFERRED, ENROLLED, true],
    [DEFERRED, DEFERRED, false],
    [DEFERRED, WITHDRAWN, true],
    [DEFERRED, COMPLETED, false],
    [WITHDRAWN, ENROLLED, true],
    [WITHDRAWN, DEFERRED, false],
    [WITHDRAWN, WITHDRAWN, false],
    [WITHDRAWN, COMPLETED, false],
    [COMPLETED, ENROLLED, false],
    [COMPLETED, DEFERRED, false],
    [COMPLETED, WITHDRAWN, false],
    [COMPLETED, COMPLETED, false],
  ])("%s → %s allowed: %s", (from, to, allowed) => {
    // In the programme's final year, so Completed is open to them.
    expect(canChangeStatus(from, to, true)).toBe(allowed);
  });

  it("completes only a student in their programme's final year", () => {
    expect(allowedStatusChanges(ENROLLED, true)).toEqual([
      DEFERRED,
      WITHDRAWN,
      COMPLETED,
    ]);
    expect(allowedStatusChanges(ENROLLED, false)).toEqual([
      DEFERRED,
      WITHDRAWN,
    ]);
    expect(canChangeStatus(ENROLLED, COMPLETED, false)).toBe(false);
  });

  it("treats Completed as final", () => {
    expect(allowedStatusChanges(COMPLETED, true)).toEqual([]);
  });

  it("lists every status", () => {
    expect(ENROLMENT_STATUSES).toEqual([
      ENROLLED,
      DEFERRED,
      WITHDRAWN,
      COMPLETED,
    ]);
  });
});

describe("statusChangeNeedsReason", () => {
  it("requires a reason for deferral and withdrawal only", () => {
    expect(ENROLMENT_STATUSES.filter(statusChangeNeedsReason)).toEqual([
      DEFERRED,
      WITHDRAWN,
    ]);
  });
});

describe("canSubmitWork", () => {
  it("lets only enrolled students submit", () => {
    expect(ENROLMENT_STATUSES.filter(canSubmitWork)).toEqual([ENROLLED]);
  });
});

describe("statusAt", () => {
  const history = [
    // In any order.
    { toStatus: DEFERRED, changedAt: new Date("2026-11-02T10:00:00Z") },
    { toStatus: ENROLLED, changedAt: new Date("2026-09-14T09:00:00Z") },
    { toStatus: ENROLLED, changedAt: new Date("2027-01-11T09:00:00Z") },
  ];

  it("gives the status of the last change made by then", () => {
    expect(statusAt(history, new Date("2026-10-01T00:00:00Z"))).toBe(ENROLLED);
    expect(statusAt(history, new Date("2026-11-02T10:00:00Z"))).toBe(DEFERRED);
    expect(statusAt(history, new Date("2026-12-01T00:00:00Z"))).toBe(DEFERRED);
    expect(statusAt(history, new Date("2027-02-01T00:00:00Z"))).toBe(ENROLLED);
  });

  it("is null before the record existed", () => {
    expect(statusAt(history, new Date("2026-09-01T00:00:00Z"))).toBeNull();
    expect(statusAt([], new Date())).toBeNull();
  });
});
