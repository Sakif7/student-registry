// The Registry dashboard: students by programme and status, the year's fees
// and marks, assessments, what needs attention, and the overdue worklist.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toDbDate } from "@/domain/college-time";
import { db } from "@/server/db";
import { getDashboard } from "@/server/services/dashboard";

import {
  createAssessment,
  createModule,
  createProgramme,
  createStudent,
  createSubmission,
  registerStudents,
} from "../helpers/factories";
import { asStudent, sessionFor, STAFF } from "../helpers/requests";

// 15 October 2026 in London.
const NOW = new Date("2026-10-15T11:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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
      standardFeePence: amountPence,
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

  it("counts each programme's students by status, programmes with none included", async () => {
    const data = await createProgramme({
      code: "MSC-DS",
      title: "MSc Data Science",
    });
    await createProgramme({ code: "BA-BM", title: "BA Business Management" });
    for (const status of ["ENROLLED", "DEFERRED", "ENROLLED"] as const) {
      await createStudent({ programmeId: data.id, status });
    }

    const { programmes } = await getDashboard(await sessionFor(STAFF));

    expect(programmes).toEqual([
      {
        code: "BA-BM",
        title: "BA Business Management",
        counts: { ENROLLED: 0, DEFERRED: 0, WITHDRAWN: 0, COMPLETED: 0 },
      },
      {
        code: "MSC-DS",
        title: "MSc Data Science",
        counts: { ENROLLED: 2, DEFERRED: 1, WITHDRAWN: 0, COMPLETED: 0 },
      },
    ]);
  });

  it("totals this academic year's fees, paying older years' charges first", async () => {
    const programme = await createProgramme();
    const partPaid = await createStudent({ programmeId: programme.id });
    await charge(partPaid.id, 953_500, "2026-10-01");
    await pay(partPaid.id, 500_000, "CARD 1");
    const notYetDue = await createStudent({ programmeId: programme.id });
    await charge(notYetDue.id, 953_500, "2026-11-14");
    // Owes last year's fee: this payment clears that first.
    const behind = await createStudent({ programmeId: programme.id });
    await charge(behind.id, 953_500, "2025-10-01", "2025/26");
    await charge(behind.id, 953_500, "2026-10-01");
    await pay(behind.id, 953_500, "BACS 1");

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.academicYear).toBe("2026/27");
    expect(dashboard.fees).toEqual({
      chargedPence: 2_860_500,
      paidPence: 500_000,
      overduePence: 1_407_000,
      notYetDuePence: 953_500,
    });
    // Last year's fees, paid first, for chasing after 1 September.
    expect(
      (await getDashboard(await sessionFor(STAFF), { year: "2025/26" })).fees,
    ).toEqual({
      chargedPence: 953_500,
      paidPence: 953_500,
      overduePence: 0,
      notYetDuePence: 0,
    });
  });

  it("lists open assessments soonest first, and those past the deadline oldest first", async () => {
    const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);
    const later = await createAssessment({ deadline: days(20) });
    const sooner = await createAssessment({ deadline: days(5) });
    const lately = await createAssessment({ deadline: days(-2) });
    const longAgo = await createAssessment({ deadline: days(-9) });
    await createAssessment({ deadline: days(-30), closedAt: days(-20) });

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.openAssessments.map(({ id }) => id)).toEqual([
      sooner.id,
      later.id,
    ]);
    expect(dashboard.pastDeadline.map(({ id }) => id)).toEqual([
      longAgo.id,
      lately.id,
    ]);
  });

  it("lists work to mark: submissions without a mark, once the deadline has passed", async () => {
    const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);
    const marked = await createStudent();
    const unmarked = await createStudent();
    const moduleCoded = async (code: string) =>
      (await createModule({ code, title: `Module ${code}` })).id;
    const essay = await createAssessment({
      title: "Management essay",
      deadline: days(-7),
      moduleId: await moduleCoded("BM4001"),
    });
    // Closed, but closing doesn't mark anything.
    const report = await createAssessment({
      title: "Database design report",
      deadline: days(-14),
      closedAt: days(-3),
      moduleId: await moduleCoded("CS4002"),
    });
    // Still open: work can be replaced until the deadline.
    const proposal = await createAssessment({ deadline: days(10) });
    for (const { id } of [essay, report, proposal]) {
      await createSubmission({ studentId: marked.id, assessmentId: id });
      await createSubmission({ studentId: unmarked.id, assessmentId: id });
    }
    await db().assessmentResult.createMany({
      data: [
        { studentId: marked.id, assessmentId: essay.id, mark: 60 },
        { studentId: marked.id, assessmentId: proposal.id, mark: 60 },
      ],
    });

    const { workToMark } = await getDashboard(await sessionFor(STAFF));

    expect(workToMark).toEqual([
      {
        assessmentId: report.id,
        title: "Database design report",
        moduleCode: "CS4002",
        deadline: report.deadline,
        unmarked: 2,
      },
      {
        assessmentId: essay.id,
        title: "Management essay",
        moduleCode: "BM4001",
        deadline: essay.deadline,
        unmarked: 1,
      },
    ]);
  });

  it("counts the academic year's marks by classification, by the college's calendar", async () => {
    const marks = async (deadline: string, ...values: number[]) => {
      const { id: assessmentId } = await createAssessment({
        deadline: new Date(deadline),
      });
      for (const mark of values) {
        const { id: studentId } = await createStudent();
        await db().assessmentResult.create({
          data: { studentId, assessmentId, mark },
        });
      }
    };
    await marks("2026-10-01T16:00:00.000Z", 35, 72);
    // 00:30 on 1 September in London (BST): this academic year.
    await marks("2026-08-31T23:30:00.000Z", 65);
    // 23:30 on 31 August in London: last academic year.
    await marks("2026-08-31T22:30:00.000Z", 50);

    const dashboard = await getDashboard(await sessionFor(STAFF));

    expect(dashboard.marks).toEqual({
      FAIL: 1,
      PASS: 0,
      MERIT: 1,
      DISTINCTION: 1,
    });

    // Last year's, asked for: in reach while its resits are marked.
    const lastYear = await getDashboard(await sessionFor(STAFF), {
      year: "2025/26",
    });
    expect(lastYear.academicYear).toBe("2025/26");
    expect(lastYear.marks).toEqual({
      FAIL: 0,
      PASS: 1,
      MERIT: 0,
      DISTINCTION: 0,
    });
    // Anything odd shows this year.
    expect(
      (await getDashboard(await sessionFor(STAFF), { year: "2025/27" }))
        .academicYear,
    ).toBe("2026/27");
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

  it("lists students with marks to publish, longest waiting first, and counts held results", async () => {
    const { id: assessmentId } = await createAssessment();
    const { id: otherAssessmentId } = await createAssessment();
    const recent = await createStudent({
      studentNumber: "SMS-2026-0001",
      fullName: "Chloe Dubois",
    });
    const waiting = await createStudent({
      studentNumber: "SMS-2026-0002",
      fullName: "Oliver Bennett",
    });
    const held = await createStudent({
      resultsWithheldAt: NOW,
      resultsWithheldReason: "Outstanding tuition fees",
    });
    const allPublished = await createStudent();
    const hoursAgo = (hours: number) =>
      new Date(NOW.getTime() - hours * 60 * 60 * 1000);
    await db().assessmentResult.createMany({
      data: [
        {
          studentId: recent.id,
          assessmentId,
          mark: 62,
          updatedAt: hoursAgo(1),
        },
        {
          studentId: waiting.id,
          assessmentId,
          mark: 81,
          updatedAt: hoursAgo(48),
        },
        {
          studentId: waiting.id,
          assessmentId: otherAssessmentId,
          mark: 74,
          updatedAt: hoursAgo(2),
        },
        // Withheld, so not waiting to be published.
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
      toPublish: [
        {
          studentNumber: "SMS-2026-0002",
          fullName: "Oliver Bennett",
          count: 2,
          waitingSince: hoursAgo(48),
        },
        {
          studentNumber: "SMS-2026-0001",
          fullName: "Chloe Dubois",
          count: 1,
          waitingSince: hoursAgo(1),
        },
      ],
      withheld: 1,
    });
  });

  it("lists enrolled students waiting to activate, those needing a new link first", async () => {
    const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
    const student = async (
      name: string,
      enrolledDaysAgo: number,
      account: {
        activated?: boolean;
        disabled?: boolean;
        link?: { sentDaysAgo: number; expiresInHours: number };
      } | null,
      status: "ENROLLED" | "WITHDRAWN" = "ENROLLED",
    ) => {
      const created = await createStudent({
        fullName: name,
        status,
        createdAt: daysAgo(enrolledDaysAgo),
      });
      if (!account) return created;
      const user = await db().user.create({
        data: {
          name,
          email: created.email,
          role: "student",
          studentNumber: created.studentNumber,
          emailVerified: account.activated ?? false,
          disabledAt: account.disabled ? daysAgo(1) : null,
        },
      });
      if (account.link) {
        await db().verification.create({
          data: {
            identifier: `reset-password:token-for-${created.studentNumber}`,
            value: user.id,
            createdAt: daysAgo(account.link.sentDaysAgo),
            expiresAt: new Date(
              NOW.getTime() + account.link.expiresInHours * 60 * 60 * 1000,
            ),
          },
        });
      }
      return created;
    };
    const withLink = await student("Arjun Mehta", 10, {
      link: { sentDaysAgo: 1, expiresInHours: 48 },
    });
    const expired = await student("Liam O'Connor", 9, {
      link: { sentDaysAgo: 4, expiresInHours: -24 },
    });
    const noLink = await student("Priya Nair", 8, {});
    const noAccount = await student("Kwame Mensah", 7, null);
    await student("Amelia Hart", 6, { activated: true });
    await student("Hannah Kowalski", 5, { disabled: true });
    await student("Tom Reid", 4, {}, "WITHDRAWN");

    const { awaitingActivation } = await getDashboard(await sessionFor(STAFF));

    expect(awaitingActivation).toEqual([
      {
        studentNumber: expired.studentNumber,
        fullName: "Liam O'Connor",
        enrolledAt: daysAgo(9),
        link: null,
      },
      {
        studentNumber: noLink.studentNumber,
        fullName: "Priya Nair",
        enrolledAt: daysAgo(8),
        link: null,
      },
      {
        studentNumber: noAccount.studentNumber,
        fullName: "Kwame Mensah",
        enrolledAt: daysAgo(7),
        link: null,
      },
      {
        studentNumber: withLink.studentNumber,
        fullName: "Arjun Mehta",
        enrolledAt: daysAgo(10),
        link: {
          sentAt: daysAgo(1),
          expiresAt: new Date(NOW.getTime() + 48 * 60 * 60 * 1000),
        },
      },
    ]);
  });

  it("lists enrolled students with credits to choose in their own academic year, most first", async () => {
    const programme = await createProgramme({ creditsPerYear: 120 });
    const core = await createModule({ programmeId: programme.id, credits: 90 });
    const option = await createModule({
      programmeId: programme.id,
      credits: 30,
      kind: "OPTIONAL",
    });
    const student = (
      fullName: string,
      overrides: { academicYear?: string; status?: "WITHDRAWN" } = {},
    ) => createStudent({ fullName, programmeId: programme.id, ...overrides });
    const full = await student("Oliver Bennett");
    const short = await student("Priya Nair");
    const none = await student("Kwame Mensah");
    const lastYear = await student("Liam O'Connor", {
      academicYear: "2025/26",
    });
    const withdrawn = await student("Hannah Kowalski", {
      status: "WITHDRAWN",
    });
    await registerStudents(core.id, [full.id, short.id, withdrawn.id]);
    await registerStudents(option.id, [full.id]);
    // Liam's session is 2025/26: a registration for 2026/27 doesn't count.
    await registerStudents(core.id, [lastYear.id], "2025/26");
    await registerStudents(option.id, [lastYear.id]);

    const { creditsToChoose } = await getDashboard(await sessionFor(STAFF));

    const listed = (
      { studentNumber }: { studentNumber: string },
      fullName: string,
      creditsLeft: number,
    ) => ({
      studentNumber,
      fullName,
      programmeCode: programme.code,
      yearOfStudy: 1,
      creditsLeft,
    });
    expect(creditsToChoose).toEqual([
      listed(none, "Kwame Mensah", 120),
      listed(short, "Priya Nair", 30),
      listed(lastYear, "Liam O'Connor", 30),
    ]);
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
