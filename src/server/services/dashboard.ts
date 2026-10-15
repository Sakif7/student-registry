// The Registry dashboard: how many students are in each enrolment status, and
// the overdue worklist of every student with fees unpaid after the due date.
import "server-only";

import { type CalendarDate, toDbDate } from "@/domain/college-time";
import { ENROLMENT_STATUSES, type EnrolmentStatus } from "@/domain/enrolment";

import { collegeToday } from "../college";
import { db } from "../db";
import { requireStaff, type Session } from "../session";

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

export interface Dashboard {
  statusCounts: Record<EnrolmentStatus, number>;
  totalStudents: number;
  /** Longest overdue first. */
  overdueAccounts: OverdueAccount[];
  totalOverduePence: number;
}

/**
 * The dashboard figures (staff only). Overdue accounts include withdrawn and
 * completed students, whose debts still need chasing.
 */
export async function getDashboard(
  session: Session | null,
): Promise<Dashboard> {
  requireStaff(session);
  const today = collegeToday();
  const [groups, candidates] = await Promise.all([
    db().student.groupBy({ by: ["status"], _count: { _all: true } }),
    // Only a student with a charge already past its due date can be overdue.
    db().student.findMany({
      where: { feeCharges: { some: { dueDate: { lt: toDbDate(today) } } } },
      select: {
        id: true,
        studentNumber: true,
        fullName: true,
        status: true,
        programme: { select: { title: true } },
      },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    ENROLMENT_STATUSES.map((status) => [
      status,
      groups.find((group) => group.status === status)?._count._all ?? 0,
    ]),
  ) as Record<EnrolmentStatus, number>;

  const accounts = await summariseAccounts(
    candidates.map((student) => student.id),
    today,
  );
  const overdueAccounts = candidates
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
    statusCounts,
    totalStudents: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    overdueAccounts,
    totalOverduePence: overdueAccounts.reduce(
      (total, account) => total + account.overduePence,
      0,
    ),
  };
}
