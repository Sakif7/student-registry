import { describe, expect, it } from "vitest";

import {
  allowedStatusChanges,
  canChangeStatus,
  canSubmitWork,
  ENROLMENT_STATUSES,
  EnrolmentStatus,
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
    expect(canChangeStatus(from, to)).toBe(allowed);
  });

  it("treats Completed as final", () => {
    expect(allowedStatusChanges(COMPLETED)).toEqual([]);
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
