// The Registry dashboard: students by programme and enrolment status, this
// academic year's fees and marks, the assessments taking work, what needs
// attention (marks to publish, work to mark, assessments past their
// deadline, accounts waiting for activation and options still to choose)
// and the overdue worklist.
import "server-only";

import {
  academicYearOn,
  academicYearSpan,
  yearQuerySchema,
} from "@/domain/academic-year";
import { type CalendarDate, fromDbDate, toDbDate } from "@/domain/college-time";
import { ENROLMENT_STATUSES, type EnrolmentStatus } from "@/domain/enrolment";
import { summariseYearFees, type YearFees } from "@/domain/fees";
import { type Classification, countByClassification } from "@/domain/results";

import { collegeTimeZone, collegeToday } from "../college";
import { db } from "../db";
import { passwordLinksOf } from "../password-links";
import { requireStaff, type Session } from "../session";

import { type AssessmentSummary, listAssessments } from "./assessments";
import { summariseAccounts } from "./fees";

/** A student whose fees are overdue, as listed on the dashboard. */
export interface OverdueAccount {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
  programmeTitle: string;
  overduePence: number;
  /** Due date of the oldest charge that is still unpaid. */
  overdueSince: CalendarDate;
  daysOverdue: number;
  /** Everything owed, including charges not yet due. */
  balancePence: number;
}

/** How many students a programme has in each enrolment status. */
export interface ProgrammeStudents {
  code: string;
  title: string;
  counts: Record<EnrolmentStatus, number>;
}

/** An assessment past its deadline with submissions not yet marked. */
export interface WorkToMark {
  assessmentId: string;
  title: string;
  moduleCode: string;
  deadline: Date;
  unmarked: number;
}

/** A student with marks waiting to be published, and no hold. */
export interface MarksToPublish {
  studentNumber: string;
  fullName: string;
  count: number;
  /** When the longest-waiting of those marks was saved. */
  waitingSince: Date;
}

/** An enrolled student who hasn't activated their account. */
export interface AwaitingActivation {
  studentNumber: string;
  fullName: string;
  enrolledAt: Date;
  /** The newest emailed link, while it can still be used. */
  link: { sentAt: Date; expiresAt: Date } | null;
}

/** An enrolled student whose modules don't yet make up their year. */
export interface CreditsToChoose {
  studentNumber: string;
  fullName: string;
  programmeCode: string;
  yearOfStudy: number;
  /** The credits still to choose in the student's academic year. */
  creditsLeft: number;
}

export interface Dashboard {
  /** The academic year the fees and marks are for, e.g. "2026/27". */
  academicYear: string;
  statusCounts: Record<EnrolmentStatus, number>;
  totalStudents: number;
  /** Every programme, by title. */
  programmes: ProgrammeStudents[];
  /** Longest overdue first. */
  overdueAccounts: OverdueAccount[];
  totalOverduePence: number;
  /** The academic year's charges. */
  fees: YearFees;
  /** Assessments open for submissions, soonest deadline first. */
  openAssessments: AssessmentSummary[];
  /**
   * Assessments past their deadline that still take late work, until staff
   * close them. Oldest deadline first.
   */
  pastDeadline: AssessmentSummary[];
  /** Oldest deadline first. */
  workToMark: WorkToMark[];
  /** Marks for the academic year's assessments, published or not. */
  marks: Record<Classification, number>;
  results: {
    /** Longest waiting first. */
    toPublish: MarksToPublish[];
    /** Students whose results are withheld. */
    withheld: number;
  };
  /** Students without a link that works first, then longest waiting. */
  awaitingActivation: AwaitingActivation[];
  /** Most credits left first. */
  creditsToChoose: CreditsToChoose[];
}

/**
 * The dashboard's figures, charts and worklists (staff only). The year's
 * fees and marks are this academic year's unless `year` asks for another,
 * so last year's stay in reach while its fees are chased and its resits
 * marked, after 1 September resets this year's.
 */
export async function getDashboard(
  session: Session | null,
  input: unknown = {},
): Promise<Dashboard> {
  requireStaff(session);
  const now = new Date();
  const today = collegeToday();
  const academicYear =
    yearQuerySchema.parse(input).year ?? academicYearOn(today);
  const [
    students,
    overdue,
    fees,
    assessments,
    workToMark,
    marks,
    results,
    awaitingActivation,
    creditsToChoose,
  ] = await Promise.all([
    studentCounts(),
    overdueAccounts(today),
    yearFees(academicYear, today),
    listAssessments(session),
    unmarkedWork(now),
    yearMarks(academicYear),
    resultsToPublish(),
    activationsAwaited(now),
    creditsStillToChoose(),
  ]);

  return {
    academicYear,
    ...students,
    ...overdue,
    fees,
    openAssessments: assessments.filter(({ state }) => state === "OPEN"),
    pastDeadline: assessments
      .filter(({ state }) => state === "ACCEPTING_LATE")
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime()),
    workToMark,
    marks,
    results,
    awaitingActivation,
    creditsToChoose,
  };
}

async function studentCounts(): Promise<
  Pick<Dashboard, "statusCounts" | "totalStudents" | "programmes">
> {
  const [programmes, groups] = await Promise.all([
    db().programme.findMany({
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
    db().student.groupBy({
      by: ["programmeId", "status"],
      _count: { _all: true },
    }),
  ]);
  const countsOf = (programmeId?: string) =>
    Object.fromEntries(
      ENROLMENT_STATUSES.map((status) => [
        status,
        groups
          .filter(
            (group) =>
              group.status === status &&
              (programmeId === undefined || group.programmeId === programmeId),
          )
          .reduce((total, group) => total + group._count._all, 0),
      ]),
    ) as Record<EnrolmentStatus, number>;

  const statusCounts = countsOf();
  return {
    statusCounts,
    totalStudents: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    programmes: programmes.map(({ id, code, title }) => ({
      code,
      title,
      counts: countsOf(id),
    })),
  };
}

/**
 * Every student with fees unpaid after the due date. Withdrawn and completed
 * students are included: their debts still need chasing.
 */
async function overdueAccounts(
  today: CalendarDate,
): Promise<Pick<Dashboard, "overdueAccounts" | "totalOverduePence">> {
  // Only a student with a charge already past its due date can be overdue.
  const candidates = await db().student.findMany({
    where: { feeCharges: { some: { dueDate: { lt: toDbDate(today) } } } },
    select: {
      id: true,
      studentNumber: true,
      fullName: true,
      status: true,
      programme: { select: { title: true } },
    },
  });
  const accounts = await summariseAccounts(
    candidates.map((student) => student.id),
    today,
  );
  const overdue = candidates
    .flatMap((student): OverdueAccount[] => {
      const summary = accounts.get(student.id)?.summary;
      if (!summary?.overdueSince) return [];
      return [
        {
          studentNumber: student.studentNumber,
          fullName: student.fullName,
          status: student.status,
          programmeTitle: student.programme.title,
          overduePence: summary.overduePence,
          overdueSince: summary.overdueSince,
          daysOverdue: summary.daysOverdue,
          balancePence: summary.balancePence,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        b.overduePence - a.overduePence ||
        a.studentNumber.localeCompare(b.studentNumber),
    );
  return {
    overdueAccounts: overdue,
    totalOverduePence: overdue.reduce(
      (total, account) => total + account.overduePence,
      0,
    ),
  };
}

/** The year's charges: paid, overdue and not yet due. */
async function yearFees(
  academicYear: string,
  today: CalendarDate,
): Promise<YearFees> {
  // All of each student's charges, not just the year's: payments clear
  // older charges first.
  const students = await db().student.findMany({
    where: { feeCharges: { some: { academicYear } } },
    select: {
      feeCharges: {
        select: { academicYear: true, amountPence: true, dueDate: true },
      },
      payments: {
        select: { amountPence: true, reversal: { select: { id: true } } },
      },
    },
  });
  return summariseYearFees(
    students.map((student) => ({
      charges: student.feeCharges.map((charge) => ({
        ...charge,
        dueDate: fromDbDate(charge.dueDate),
      })),
      payments: student.payments.map((payment) => ({
        amountPence: payment.amountPence,
        reversed: payment.reversal !== null,
      })),
    })),
    academicYear,
    today,
  );
}

/**
 * Submissions without a mark, for each assessment past its deadline. Before
 * the deadline a student can still replace their work, so it waits.
 */
async function unmarkedWork(now: Date): Promise<WorkToMark[]> {
  // Submissions and marks are matched on student and assessment, which
  // Prisma's relation filters can't express. The instant goes as ISO text:
  // a Date would go without its offset, to be read in the session's zone.
  const rows = await db().$queryRaw<
    {
      id: string;
      title: string;
      module_code: string;
      deadline: Date;
      unmarked: number;
    }[]
  >`
    SELECT a.id, a.title, m.code AS module_code, a.deadline,
      count(*)::int AS unmarked
    FROM submissions s
    JOIN assessments a ON a.id = s.assessment_id
    JOIN modules m ON m.id = a.module_id
    WHERE a.deadline < ${now.toISOString()}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM assessment_results r
        WHERE r.assessment_id = s.assessment_id
          AND r.student_id = s.student_id
      )
    GROUP BY a.id, m.code
    ORDER BY a.deadline, a.id`;
  return rows.map((row) => ({
    assessmentId: row.id,
    title: row.title,
    moduleCode: row.module_code,
    deadline: row.deadline,
    unmarked: row.unmarked,
  }));
}

/**
 * Marks for the assessments whose deadline falls in the academic year, by
 * the college's calendar, by classification.
 */
async function yearMarks(
  academicYear: string,
): Promise<Record<Classification, number>> {
  const { first, last } = academicYearSpan(academicYear);
  const rows = await db().$queryRaw<{ mark: number }[]>`
    SELECT r.mark
    FROM assessment_results r
    JOIN assessments a ON a.id = r.assessment_id
    WHERE (a.deadline AT TIME ZONE ${collegeTimeZone()})::date
      BETWEEN ${first}::date AND ${last}::date`;
  return countByClassification(rows.map((row) => row.mark));
}

async function resultsToPublish(): Promise<Dashboard["results"]> {
  const [students, withheld] = await Promise.all([
    db().student.findMany({
      where: {
        resultsWithheldAt: null,
        results: { some: { publishedAt: null } },
      },
      select: {
        studentNumber: true,
        fullName: true,
        results: {
          where: { publishedAt: null },
          select: { updatedAt: true },
        },
      },
    }),
    db().student.count({ where: { resultsWithheldAt: { not: null } } }),
  ]);
  const toPublish = students
    .map(({ results, ...student }) => ({
      ...student,
      count: results.length,
      // A changed mark is unpublished again, so it waits from its last save.
      waitingSince: new Date(
        Math.min(...results.map((result) => result.updatedAt.getTime())),
      ),
    }))
    .sort(
      (a, b) =>
        a.waitingSince.getTime() - b.waitingSince.getTime() ||
        a.studentNumber.localeCompare(b.studentNumber),
    );
  return { toPublish, withheld };
}

/**
 * Enrolled students who haven't set a password yet, with the link they
 * were sent if it still works.
 */
async function activationsAwaited(now: Date): Promise<AwaitingActivation[]> {
  const students = await db().student.findMany({
    where: {
      status: "ENROLLED",
      OR: [
        { user: { is: null } },
        { user: { is: { emailVerified: false, disabledAt: null } } },
      ],
    },
    select: {
      studentNumber: true,
      fullName: true,
      createdAt: true,
      user: { select: { id: true } },
    },
    orderBy: [{ createdAt: "asc" }, { studentNumber: "asc" }],
  });
  const userIds = students.flatMap(({ user }) => (user ? [user.id] : []));
  const links = await db().verification.findMany({
    where: { ...passwordLinksOf(userIds), expiresAt: { gt: now } },
    select: { value: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  // The newest link of each account.
  const newest = new Map<string, { sentAt: Date; expiresAt: Date }>();
  for (const link of links) {
    if (!newest.has(link.value)) {
      newest.set(link.value, {
        sentAt: link.createdAt,
        expiresAt: link.expiresAt,
      });
    }
  }

  const awaiting = students.map((student) => ({
    studentNumber: student.studentNumber,
    fullName: student.fullName,
    enrolledAt: student.createdAt,
    link: (student.user && newest.get(student.user.id)) ?? null,
  }));
  // Those who need a new link first; the sort keeps enrolment order.
  return awaiting.sort(
    (a, b) => Number(a.link !== null) - Number(b.link !== null),
  );
}

/**
 * Enrolled students whose modules come to fewer credits than their
 * programme's year carries, in the student's own academic year.
 */
async function creditsStillToChoose(): Promise<CreditsToChoose[]> {
  // Registrations are matched on the student's own academic year, which
  // Prisma's relation filters can't express.
  const rows = await db().$queryRaw<
    {
      student_number: string;
      full_name: string;
      programme_code: string;
      year_of_study: number;
      credits_left: number;
    }[]
  >`
    SELECT s.student_number, s.full_name, p.code AS programme_code,
      s.year_of_study,
      (p.credits_per_year - COALESCE(sum(m.credits), 0))::int AS credits_left
    FROM students s
    JOIN programmes p ON p.id = s.programme_id
    LEFT JOIN module_registrations r
      ON r.student_id = s.id AND r.academic_year = s.academic_year
      AND r.ended_at IS NULL
    LEFT JOIN modules m ON m.id = r.module_id
    WHERE s.status = 'ENROLLED'
    GROUP BY s.id, p.id
    HAVING COALESCE(sum(m.credits), 0) < p.credits_per_year
    ORDER BY credits_left DESC, s.student_number`;
  return rows.map((row) => ({
    studentNumber: row.student_number,
    fullName: row.full_name,
    programmeCode: row.programme_code,
    yearOfStudy: row.year_of_study,
    creditsLeft: row.credits_left,
  }));
}
