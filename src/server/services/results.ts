// Students' results: publishing marks to a student, withholding all of a
// student's results (e.g. for unpaid fees), and what each viewer may see. A
// student only ever receives marks that are published and not withheld; the
// filtering happens here, on the server, not in the page.
import "server-only";

import type { EnrolmentStatus } from "@/domain/enrolment";
import type { AccountStanding } from "@/domain/fees";
import {
  type Classification,
  classify,
  isVisibleToStudent,
  withholdResultsSchema,
} from "@/domain/results";

import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { requireStaff, requireStaffOrSelf, type Session } from "../session";

import { summariseAccounts } from "./fees";

/** One mark, with the assessment it is for. */
export interface StudentResult {
  assessment: { id: string; title: string; deadline: Date };
  module: { code: string; title: string };
  mark: number;
  classification: Classification;
  /** Null until staff publish it. Students only ever see published marks. */
  publishedAt: Date | null;
}

/** A student's results, as the viewer may see them. */
export interface StudentResults {
  studentNumber: string;
  /** Set while staff withhold the student's results. */
  withheld: { since: Date; reason: string } | null;
  /**
   * For staff, every mark. For the student, only published marks, and none
   * while results are withheld.
   */
  results: StudentResult[];
}

/** A student who has marks or a hold, for the staff results worklist. */
export interface ResultsWorklistItem {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
  programmeTitle: string;
  publishedCount: number;
  unpublishedCount: number;
  withheld: { since: Date; reason: string } | null;
  account: { standing: AccountStanding; overduePence: number };
}

/**
 * A student's results, for staff or the student themselves.
 *
 * @throws AppError: NOT_FOUND; UNAUTHENTICATED or FORBIDDEN.
 */
export async function getResults(
  session: Session | null,
  studentNumber: string,
): Promise<StudentResults> {
  const number = studentNumber.toUpperCase();
  const viewer = requireStaffOrSelf(session, number);
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: {
      studentNumber: true,
      resultsWithheldAt: true,
      resultsWithheldReason: true,
      results: {
        select: {
          mark: true,
          publishedAt: true,
          assessment: {
            select: {
              id: true,
              title: true,
              deadline: true,
              module: { select: { code: true, title: true } },
            },
          },
        },
        orderBy: { assessment: { deadline: "desc" } },
      },
    },
  });
  if (!student) throw studentNotFound(number);

  const withheld = holdOf(student);
  const results = student.results
    .filter(
      (result) =>
        viewer.role === "staff" || isVisibleToStudent(result, !!withheld),
    )
    .map(({ assessment: { module, ...assessment }, ...result }) => ({
      assessment,
      module,
      mark: result.mark,
      classification: classify(result.mark),
      publishedAt: result.publishedAt,
    }));
  return { studentNumber: student.studentNumber, withheld, results };
}

/**
 * Publishes all of a student's unpublished marks at once (staff only), each
 * stamped with the time it was published.
 *
 * @returns How many marks were published, and the student's results.
 * @throws AppError: NOT_FOUND; CONFLICT while results are withheld.
 */
export async function publishResults(
  session: Session | null,
  studentNumber: string,
): Promise<{ published: number; results: StudentResults }> {
  requireStaff(session);
  const student = await findStudent(studentNumber);
  const hold = holdOf(student);
  if (hold) {
    throw new AppError(
      "CONFLICT",
      `Results are withheld (${hold.reason}). Lift the hold before publishing.`,
    );
  }
  const { count } = await db().assessmentResult.updateMany({
    where: { studentId: student.id, publishedAt: null },
    data: { publishedAt: new Date() },
  });
  return {
    published: count,
    results: await getResults(session, student.studentNumber),
  };
}

/**
 * Withholds all of a student's results, published ones included, with a
 * reason the student is shown (staff only). Withholding again changes the
 * reason but keeps the original date.
 *
 * @throws AppError: VALIDATION, NOT_FOUND.
 */
export async function withholdResults(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<StudentResults> {
  requireStaff(session);
  const { reason } = parseInput(withholdResultsSchema, input);
  const student = await findStudent(studentNumber);
  await db().student.update({
    where: { id: student.id },
    data: {
      resultsWithheldAt: student.resultsWithheldAt ?? new Date(),
      resultsWithheldReason: reason,
    },
  });
  return getResults(session, student.studentNumber);
}

/**
 * Lifts a hold on a student's results (staff only). Marks published before
 * the hold become visible again; unpublished ones still need publishing.
 *
 * @throws AppError: NOT_FOUND.
 */
export async function liftResultsHold(
  session: Session | null,
  studentNumber: string,
): Promise<StudentResults> {
  requireStaff(session);
  const student = await findStudent(studentNumber);
  await db().student.update({
    where: { id: student.id },
    data: { resultsWithheldAt: null, resultsWithheldReason: null },
  });
  return getResults(session, student.studentNumber);
}

/**
 * Every student with marks or a hold, for the staff results worklist:
 * students with marks to publish first, then held results, by name.
 */
export async function listResultsWorklist(
  session: Session | null,
): Promise<ResultsWorklistItem[]> {
  requireStaff(session);
  const students = await db().student.findMany({
    where: {
      OR: [{ results: { some: {} } }, { resultsWithheldAt: { not: null } }],
    },
    select: {
      id: true,
      studentNumber: true,
      fullName: true,
      status: true,
      resultsWithheldAt: true,
      resultsWithheldReason: true,
      programme: { select: { title: true } },
      results: { select: { publishedAt: true } },
    },
    orderBy: [{ fullName: "asc" }, { studentNumber: "asc" }],
  });
  const accounts = await summariseAccounts(
    students.map((student) => student.id),
    collegeToday(),
  );

  const items = students.map((student) => {
    const published = student.results.filter((r) => r.publishedAt).length;
    const brief = accounts.get(student.id);
    return {
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      status: student.status,
      programmeTitle: student.programme.title,
      publishedCount: published,
      unpublishedCount: student.results.length - published,
      withheld: holdOf(student),
      account: {
        standing: brief?.standing ?? "NONE",
        overduePence: brief?.summary.overduePence ?? 0,
      },
    } satisfies ResultsWorklistItem;
  });
  // Marks waiting to be published first: that is the work to do.
  const rank = (item: ResultsWorklistItem) =>
    item.unpublishedCount > 0 && !item.withheld ? 0 : item.withheld ? 1 : 2;
  return items.sort((a, b) => rank(a) - rank(b));
}

async function findStudent(studentNumber: string) {
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: {
      id: true,
      studentNumber: true,
      resultsWithheldAt: true,
      resultsWithheldReason: true,
    },
  });
  if (!student) throw studentNotFound(number);
  return student;
}

function holdOf(student: {
  resultsWithheldAt: Date | null;
  resultsWithheldReason: string | null;
}): { since: Date; reason: string } | null {
  return student.resultsWithheldAt && student.resultsWithheldReason
    ? {
        since: student.resultsWithheldAt,
        reason: student.resultsWithheldReason,
      }
    : null;
}

function studentNotFound(studentNumber: string): AppError {
  return new AppError(
    "NOT_FOUND",
    `There is no student with ID ${studentNumber}.`,
  );
}
