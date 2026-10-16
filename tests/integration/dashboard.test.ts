// The Registry dashboard: students by status, and the overdue worklist.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toDbDate } from "@/domain/college-time";
import { db } from "@/server/db";
import { getDashboard } from "@/server/services/dashboard";

import {
  createAssessment,
  createProgramme,
  createStudent,
} from "../helpers/factories";
import { asStudent, sessionFor, STAFF } from "../helpers/requests";

// 15 October 2026 in London.
const NOW = new Date("2026-10-15T11:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function charge(
  studentId: string,
  amountPence: number,
  dueDate: string,
  academicYear = "2026/27",
) {
  await db().feeCharge.create({
    data: {
      studentId,
      academicYear,
      description: `Tuition fee ${academicYear}`,
      amountPence,
      dueDate: toDbDate(dueDate),
    },
  });
}

async function pay(
  studentId: string,
  amountPence: number,
  reference: string,
  reversal?: string,
) {
  await db().payment.create({
    data: {
      studentId,
      amountPence,
      paidOn: toDbDate("2026-10-01"),
      reference,
      reversal: reversal ? { create: { reason: reversal } } : undefined,
    },
  });
}

describe("getDashboard", () => {
  it("counts students in each status, including statuses with none", async () => {
    const programme = await createProgramme();
    for (const status of ["ENROLLED", "ENROLLED", "WITHDRAWN"] as const) {
      await createStudent({ programmeId: programme.id, status });
    }

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.statusCounts).toEqual({
      ENROLLED: 2,
      DEFERRED: 0,
      WITHDRAWN: 1,
      COMPLETED: 0,
    });
    expect(dashboard.totalStudents).toBe(3);
  });

  it("lists overdue accounts, longest overdue first, withdrawn students included", async () => {
    const programme = await createProgramme({ title: "MSc Data Science" });
    const recent = await createStudent({
      studentNumber: "SMS-2026-0001",
      fullName: "Hannah Kowalski",
      programmeId: programme.id,
      status: "WITHDRAWN",
    });
    await charge(recent.id, 1_195_000, "2026-10-09");
    await pay(recent.id, 200_000, "CARD HK 1");
    const oldest = await createStudent({
      studentNumber: "SMS-2025-0001",
      fullName: "Amelia Hart",
      programmeId: programme.id,
    });
    await charge(oldest.id, 953_500, "2025-10-01", "2025/26");
    await charge(oldest.id, 953_500, "2026-11-30");
    await pay(oldest.id, 500_000, "BACS AH 1");

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.overdueAccounts).toEqual([
      {
        studentNumber: "SMS-2025-0001",
        fullName: "Amelia Hart",
        status: "ENROLLED",
        programmeTitle: "MSc Data Science",
        overduePence: 453_500,
        overdueSince: "2025-10-01",
        daysOverdue: 379,
        balancePence: 1_407_000,
      },
      {
        studentNumber: "SMS-2026-0001",
        fullName: "Hannah Kowalski",
        status: "WITHDRAWN",
        programmeTitle: "MSc Data Science",
        overduePence: 995_000,
        overdueSince: "2026-10-09",
        daysOverdue: 6,
        balancePence: 995_000,
      },
    ]);
    expect(dashboard.totalOverduePence).toBe(1_448_500);
  });

  it("leaves out accounts that are paid, in credit, due today or not yet due", async () => {
    const programme = await createProgramme();
    const paid = await createStudent({ programmeId: programme.id });
    await charge(paid.id, 953_500, "2026-10-01");
    await pay(paid.id, 953_500, "PAID 1");
    const inCredit = await createStudent({ programmeId: programme.id });
    await charge(inCredit.id, 953_500, "2026-10-01");
    await pay(inCredit.id, 1_000_000, "CREDIT 1");
    const dueToday = await createStudent({ programmeId: programme.id });
    await charge(dueToday.id, 953_500, "2026-10-15");
    const dueLater = await createStudent({ programmeId: programme.id });
    await charge(dueLater.id, 953_500, "2026-11-14");

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.overdueAccounts).toEqual([]);
    expect(dashboard.totalOverduePence).toBe(0);
  });

  it("treats a reversed payment as never made", async () => {
    const student = await createStudent({ studentNumber: "SMS-2026-0001" });
    await charge(student.id, 953_500, "2026-10-01");
    await pay(student.id, 953_500, "BACS 1", "Payment recalled by the bank");

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.overdueAccounts).toMatchObject([
      { studentNumber: "SMS-2026-0001", overduePence: 953_500 },
    ]);
  });

  it("counts students with marks to publish, and with results withheld", async () => {
    const { id: assessmentId } = await createAssessment();
    const toPublish = await createStudent();
    const held = await createStudent({
      resultsWithheldAt: NOW,
      resultsWithheldReason: "Outstanding tuition fees",
    });
    const allPublished = await createStudent();
    await db().assessmentResult.createMany({
      data: [
        { studentId: toPublish.id, assessmentId, mark: 60 },
        // Withheld, so not counted as waiting to be published.
        { studentId: held.id, assessmentId, mark: 50 },
        {
          studentId: allPublished.id,
          assessmentId,
          mark: 70,
          publishedAt: NOW,
        },
      ],
    });

    expect((await getDashboard(await sessionFor(STAFF))).results).toEqual({
      toPublish: 1,
      withheld: 1,
    });
  });

  it("is for staff only", async () => {
    await expect(getDashboard(null)).rejects.toMatchObject({
      kind: "UNAUTHENTICATED",
    });
    await createStudent({ studentNumber: "SMS-2026-0001" });
    await expect(
      getDashboard(await sessionFor(asStudent("SMS-2026-0001"))),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
  });
});
