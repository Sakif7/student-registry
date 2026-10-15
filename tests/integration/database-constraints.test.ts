// The database enforces the invariants the app relies on, so even a write that
// bypasses the app's validation cannot store invalid data.
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";

import {
  createAssessment,
  createProgramme,
  createStudent,
} from "../helpers/factories";

describe("database constraints", () => {
  it("rejects a negative programme fee", async () => {
    await expect(createProgramme({ annualFeePence: -1 })).rejects.toThrow(
      "programmes_annual_fee_pence_check",
    );
  });

  it("rejects a payment of zero", async () => {
    const student = await createStudent();
    await expect(
      db().payment.create({
        data: {
          studentId: student.id,
          amountPence: 0,
          paidOn: new Date("2026-10-01T00:00:00.000Z"),
          reference: "BANK-001",
        },
      }),
    ).rejects.toThrow("payments_amount_pence_check");
  });

  it("rejects a payment reference that is not normalised", async () => {
    const student = await createStudent();
    await expect(
      db().payment.create({
        data: {
          studentId: student.id,
          amountPence: 100,
          paidOn: new Date("2026-10-01T00:00:00.000Z"),
          reference: "bank-001",
        },
      }),
    ).rejects.toThrow("payments_reference_check");
  });

  it("rejects a mark above 100", async () => {
    const student = await createStudent();
    const assessment = await createAssessment();
    await expect(
      db().assessmentResult.create({
        data: { studentId: student.id, assessmentId: assessment.id, mark: 101 },
      }),
    ).rejects.toThrow("assessment_results_mark_check");
  });

  it("rejects an email that is not lower-case", async () => {
    await expect(
      createStudent({ email: "Amelia.Hart@example.ac.uk" }),
    ).rejects.toThrow("students_email_check");
  });

  it("rejects a malformed student number", async () => {
    await expect(createStudent({ studentNumber: "SMS-26-1" })).rejects.toThrow(
      "students_student_number_check",
    );
  });

  it("rejects a results hold without a reason", async () => {
    await expect(
      createStudent({ resultsWithheldAt: new Date() }),
    ).rejects.toThrow("students_results_hold_check");
  });

  it("rejects a status change that keeps the same status", async () => {
    const student = await createStudent();
    await expect(
      db().enrolmentStatusChange.create({
        data: {
          studentId: student.id,
          fromStatus: "ENROLLED",
          toStatus: "ENROLLED",
        },
      }),
    ).rejects.toThrow("enrolment_status_changes_status_check");
  });
});
