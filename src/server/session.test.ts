import { describe, expect, it } from "vitest";

import { AppError } from "./errors";
import {
  parseSession,
  requireStaff,
  requireStaffOrSelf,
  requireStudent,
  serialiseSession,
} from "./session";

const staff = { role: "staff" } as const;
const amelia = { role: "student", studentNumber: "SMS-2026-0001" } as const;

describe("session cookie", () => {
  it("round-trips staff and student sessions", () => {
    expect(parseSession(serialiseSession(staff))).toEqual(staff);
    expect(parseSession(serialiseSession(amelia))).toEqual(amelia);
  });

  it.each([undefined, "", "admin", "student:", "student:12", "Staff"])(
    "ignores the malformed value %j",
    (value) => {
      expect(parseSession(value)).toBeNull();
    },
  );
});

/** The kind of AppError a call throws. */
function kindOf(call: () => unknown) {
  try {
    call();
  } catch (error) {
    return error instanceof AppError ? error.kind : error;
  }
  return "no error";
}

describe("permission checks", () => {
  it("lets staff do staff things only", () => {
    expect(requireStaff(staff)).toBe(staff);
    expect(kindOf(() => requireStaff(amelia))).toBe("FORBIDDEN");
    expect(kindOf(() => requireStaff(null))).toBe("UNAUTHENTICATED");
  });

  it("lets a student see their own record but not someone else's", () => {
    expect(requireStaffOrSelf(amelia, "SMS-2026-0001")).toBe(amelia);
    expect(requireStaffOrSelf(staff, "SMS-2026-0001")).toBe(staff);
    expect(kindOf(() => requireStaffOrSelf(amelia, "SMS-2026-0002"))).toBe(
      "FORBIDDEN",
    );
    expect(kindOf(() => requireStaffOrSelf(null, "SMS-2026-0001"))).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("keeps student-only actions to students", () => {
    expect(requireStudent(amelia)).toBe(amelia);
    expect(kindOf(() => requireStudent(staff))).toBe("FORBIDDEN");
  });
});
