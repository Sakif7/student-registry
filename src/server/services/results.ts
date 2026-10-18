// Students' results: publishing marks to a student, or an assessment's marks
// to all its students at once, withholding all of a student's results (e.g.
// for unpaid fees), and what each viewer may see. A student only ever
// receives marks that are published and not withheld; the filtering happens
// here, on the server, not in the page.
import "server-only";

import type { EnrolmentStatus } from "@/domain/enrolment";
import type { AccountStanding } from "@/domain/fees";
import {
  type Classification,
  classify,
  isVisibleToStudent,
  publishResultsSchema,
  withholdResultsSchema,
} from "@/domain/results";

import { recordEvent } from "../audit";
import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { isId } from "../ids";
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
 * stamped with the time it was published. Given the number the publisher
 * saw waiting, it publishes nothing if that number has changed.
 *
 * @returns How many marks were published, and the student's results.
 * @throws AppError: NOT_FOUND; CONFLICT while results are withheld, or if
 *   the marks waiting aren't the ones the publisher saw.
 */
export async function publishResults(
  session: Session | null,
  studentNumber: string,
  input: unknown = {},
): Promise<{ published: number; results: StudentResults }> {
  const staff = requireStaff(session);
  const { expected } = parseInput(publishResultsSchema, input);
  const student = await findStudent(studentNumber);
  const hold = holdOf(student);
  if (hold) {
    throw new AppError(
      "CONFLICT",
      `Results are withheld (${hold.reason}). Lift the hold before publishing.`,
    );
  }
  const count = await db().$transaction(async (tx) => {
    if (expected !== undefined) {
      const waiting = await tx.assessmentResult.count({
        where: { studentId: student.id, publishedAt: null },
      });
      if (waiting !== expected) throw waitingChanged(waiting);
    }
    const published = await tx.assessmentResult.updateMany({
      where: { studentId: student.id, publishedAt: null },
      data: { publishedAt: new Date() },
    });
    if (published.count > 0) {
      await recordEvent(tx, staff, {
        action: "results.published",
        studentId: student.id,
        details: { marks: published.count },
      });
    }
    return published.count;
  });
  return {
    published: count,
    results: await getResults(session, student.studentNumber),
  };
}

/**
 * Publishes an assessment's unpublished marks to all its students at once
 * (staff only), as a registry releases a cohort's marks together. The marks
 * of students whose results are withheld stay unpublished. Given the number
 * the publisher saw waiting, it publishes nothing if that number has
 * changed.
 *
 * @returns How many marks were published.
 * @throws AppError: NOT_FOUND; CONFLICT if the marks waiting aren't the ones
 *   the publisher saw.
 */
export async function publishAssessmentMarks(
  session: Session | null,
  assessmentId: string,
  input: unknown = {},
): Promise<{ published: number }> {
  const staff = requireStaff(session);
  const { expected } = parseInput(publishResultsSchema, input);
  const assessment = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true, title: true },
      })
    : null;
  if (!assessment) {
    throw new AppError("NOT_FOUND", "There is no such assessment.");
  }

  const published = await db().$transaction(async (tx) => {
    // The lock a marksheet save takes, so no mark can be saved between
    // counting the marks and publishing them.
    await tx.$queryRaw`
      SELECT id FROM assessments WHERE id = ${assessment.id}::uuid FOR UPDATE`;
    const waiting = await tx.assessmentResult.findMany({
      where: {
        assessmentId: assessment.id,
        publishedAt: null,
        student: { resultsWithheldAt: null },
      },
      select: { id: true, studentId: true },
    });
    if (expected !== undefined && waiting.length !== expected) {
      throw waitingChanged(waiting.length);
    }
    if (waiting.length === 0) return 0;
    await tx.assessmentResult.updateMany({
      where: { id: { in: waiting.map(({ id }) => id) } },
      data: { publishedAt: new Date() },
    });
    // On each student's own record, as publishing to one student is.
    for (const { studentId } of waiting) {
      await recordEvent(tx, staff, {
        action: "results.published",
        studentId,
        details: { marks: 1, title: assessment.title },
      });
    }
    return waiting.length;
  });
  return { published };
}

/** An assessment with marks waiting to be published, for the results page. */
export interface AssessmentToPublish {
  id: string;
  title: string;
  module: { code: string; title: string };
  deadline: Date;
  /** Saved marks not yet published, of students whose results aren't withheld. */
  waitingCount: number;
  /** Students with a mark waiting whose results are withheld, which stays unpublished. */
  withheldCount: number;
}

/**
 * The assessments with marks waiting to be published (staff only), the
 * longest waiting, by deadline, first.
 */
export async function listAssessmentsToPublish(
  session: Session | null,
): Promise<AssessmentToPublish[]> {
  requireStaff(session);
  const assessments = await db().assessment.findMany({
    where: {
      results: {
        some: { publishedAt: null, student: { resultsWithheldAt: null } },
      },
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      module: { select: { code: true, title: true } },
      results: {
        where: { publishedAt: null },
        select: { student: { select: { resultsWithheldAt: true } } },
      },
    },
    orderBy: [{ deadline: "asc" }, { title: "asc" }],
  });
  return assessments.map(({ results, ...assessment }) => {
    const withheldCount = results.filter(
      ({ student }) => student.resultsWithheldAt,
    ).length;
    return {
      ...assessment,
      waitingCount: results.length - withheldCount,
      withheldCount,
    };
  });
}

function waitingChanged(waiting: number): AppError {
  return new AppError(
    "CONFLICT",
    `The marks waiting to be published have changed since you looked: there ${waiting === 1 ? "is now 1" : `are now ${waiting}`}. Reload the page to check them, then publish again.`,
  );
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
  const staff = requireStaff(session);
  const { reason } = parseInput(withholdResultsSchema, input);
  const student = await findStudent(studentNumber);
  // Withholding again for the same reason changes nothing, so records
  // nothing.
  if (student.resultsWithheldAt && student.resultsWithheldReason === reason) {
    return getResults(session, student.studentNumber);
  }
  await db().$transaction(async (tx) => {
    await tx.student.update({
      where: { id: student.id },
      data: {
        resultsWithheldAt: student.resultsWithheldAt ?? new Date(),
        resultsWithheldReason: reason,
      },
    });
    await recordEvent(tx, staff, {
      action: "results.withheld",
      studentId: student.id,
      details: { reason },
    });
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
  const staff = requireStaff(session);
  const student = await findStudent(studentNumber);
  if (student.resultsWithheldAt) {
    await db().$transaction(async (tx) => {
      await tx.student.update({
        where: { id: student.id },
        data: { resultsWithheldAt: null, resultsWithheldReason: null },
      });
      await recordEvent(tx, staff, {
        action: "results.hold_lifted",
        studentId: student.id,
        details: {},
      });
    });
  }
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
