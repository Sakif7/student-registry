// Assessments: staff set work for a module with a deadline, then can move the
// deadline, close the assessment to submissions or reopen it. An assessment
// belongs to the academic year of its deadline, and is for the students
// registered on its module that year. Each assessment has a marksheet: who
// has submitted (and who late), and their marks.
import "server-only";

import {
  createAssessmentSchema,
  updateAssessmentSchema,
} from "@/domain/assessments";
import { academicYearAt } from "@/domain/academic-year";
import type { Semester } from "@/domain/curriculum";
import type { EnrolmentStatus } from "@/domain/enrolment";
import {
  canEnterMarks,
  type Classification,
  classify,
  MARKS_NOT_YET_MESSAGE,
  marksheetSchema,
} from "@/domain/results";
import {
  type AssessmentState,
  assessmentState,
  compareAssessments,
  isLate,
} from "@/domain/submissions";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeTimeZone } from "../college";
import { db } from "../db";
import {
  AppError,
  type FieldErrors,
  parseInput,
  violatedUniqueConstraint,
} from "../errors";
import { isId } from "../ids";
import { requireSession, requireStaff, type Session } from "../session";

/** A module, as offered when setting an assessment. */
export interface ModuleOption {
  code: string;
  title: string;
  semester: Semester;
}

/** An assessment as staff see it in the list. */
export interface AssessmentSummary {
  id: string;
  title: string;
  module: { code: string; title: string; semester: Semester };
  /** The academic year of its deadline, e.g. "2026/27". */
  academicYear: string;
  deadline: Date;
  closedAt: Date | null;
  state: AssessmentState;
  /**
   * Students expected to submit: those registered on the module for the
   * academic year, and now enrolled.
   */
  expectedCount: number;
  /** How many of the expected students have submitted. */
  submittedCount: number;
  /** How many of those submissions were late. */
  lateCount: number;
}

/** A student's submission, as staff see it. */
export interface SubmissionView {
  id: string;
  fileName: string;
  sizeBytes: number;
  /** 1 for the first upload, then one more for each replacement. */
  attempt: number;
  submittedAt: Date;
  late: boolean;
}

/** A student's mark for an assessment, as staff see it. */
export interface ResultView {
  mark: number;
  classification: Classification;
  /** Null until staff publish it to the student. */
  publishedAt: Date | null;
}

/** One student's line in an assessment's marksheet. */
export interface TrackerRow {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
  /** Staff have withheld this student's results. */
  resultsWithheld: boolean;
  submission: SubmissionView | null;
  result: ResultView | null;
}

/** An assessment, with every student who should submit or did. */
export interface AssessmentDetail extends AssessmentSummary {
  createdAt: Date;
  /**
   * The students expected to submit, plus anyone else who submitted or has
   * a mark (e.g. a student who withdrew afterwards), by name.
   */
  students: TrackerRow[];
}

const summaryInclude = {
  module: true,
  submissions: { select: { submittedAt: true, studentId: true } },
} satisfies Prisma.AssessmentInclude;

type AssessmentWithSubmissions = Prisma.AssessmentGetPayload<{
  include: typeof summaryInclude;
}>;

/** Every module, for choosing one when setting an assessment. */
export async function listModules(
  session: Session | null,
): Promise<ModuleOption[]> {
  requireSession(session);
  return db().module.findMany({
    select: { code: true, title: true, semester: true },
    orderBy: { code: "asc" },
  });
}

/** Every assessment, with submission counts (staff only). */
export async function listAssessments(
  session: Session | null,
): Promise<AssessmentSummary[]> {
  requireStaff(session);
  const now = new Date();
  const timeZone = collegeTimeZone();
  const assessments = await db().assessment.findMany({
    include: summaryInclude,
  });
  const expected = await expectedStudents(
    assessments.map((assessment) => ({
      moduleId: assessment.moduleId,
      academicYear: academicYearAt(assessment.deadline, timeZone),
    })),
  );

  return assessments
    .map((assessment) => {
      const academicYear = academicYearAt(assessment.deadline, timeZone);
      return toSummary(
        assessment,
        expected.get(cohortKey(assessment.moduleId, academicYear)),
        now,
        timeZone,
      );
    })
    .sort(compareAssessments);
}

/**
 * One assessment with its submission tracker (staff only).
 *
 * @throws AppError: NOT_FOUND; UNAUTHENTICATED or FORBIDDEN.
 */
export async function getAssessment(
  session: Session | null,
  assessmentId: string,
): Promise<AssessmentDetail> {
  requireStaff(session);
  const assessment = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        include: summaryInclude,
      })
    : null;
  if (!assessment) throw assessmentNotFound();

  const timeZone = collegeTimeZone();
  const academicYear = academicYearAt(assessment.deadline, timeZone);
  const expected =
    (
      await expectedStudents([{ moduleId: assessment.moduleId, academicYear }])
    ).get(cohortKey(assessment.moduleId, academicYear)) ?? new Set<string>();
  const students = await db().student.findMany({
    where: {
      OR: [
        { id: { in: [...expected] } },
        { submissions: { some: { assessmentId: assessment.id } } },
        { results: { some: { assessmentId: assessment.id } } },
      ],
    },
    select: {
      studentNumber: true,
      fullName: true,
      status: true,
      resultsWithheldAt: true,
      results: {
        where: { assessmentId: assessment.id },
        select: { mark: true, publishedAt: true },
      },
      submissions: {
        where: { assessmentId: assessment.id },
        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
          attempt: true,
          submittedAt: true,
        },
      },
    },
    orderBy: [{ fullName: "asc" }, { studentNumber: "asc" }],
  });

  return {
    ...toSummary(assessment, expected, new Date(), timeZone),
    createdAt: assessment.createdAt,
    students: students.map(
      ({
        submissions: [submission],
        results: [result],
        resultsWithheldAt,
        ...student
      }) => ({
        ...student,
        resultsWithheld: resultsWithheldAt !== null,
        submission: submission
          ? {
              ...submission,
              late: isLate(submission.submittedAt, assessment.deadline),
            }
          : null,
        result: result
          ? { ...result, classification: classify(result.mark) }
          : null,
      }),
    ),
  };
}

/**
 * Sets an assessment for a module (staff only). The deadline is a wall-clock
 * time in the college's time zone and must be in the future.
 *
 * @throws AppError: VALIDATION, including an unknown module.
 */
export async function createAssessment(
  session: Session | null,
  input: unknown,
): Promise<AssessmentDetail> {
  const staff = requireStaff(session);
  const details = parseInput(
    createAssessmentSchema(collegeTimeZone(), new Date()),
    input,
  );
  const moduleRow = await db().module.findUnique({
    where: { code: details.moduleCode },
    select: { id: true },
  });
  if (!moduleRow) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      moduleCode: ["Choose a module from the list"],
    });
  }

  const assessment = await db().$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        moduleId: moduleRow.id,
        title: details.title,
        deadline: details.deadline,
      },
    });
    await recordEvent(tx, staff, {
      action: "assessment.set",
      details: {
        assessmentId: created.id,
        title: created.title,
        moduleCode: details.moduleCode,
      },
    });
    return created;
  });
  return getAssessment(session, assessment.id);
}

/**
 * Changes an assessment's title or deadline, or closes or reopens it to
 * submissions (staff only). Late flags follow the new deadline at once,
 * because lateness is worked out when read.
 *
 * @throws AppError: VALIDATION, NOT_FOUND.
 */
export async function updateAssessment(
  session: Session | null,
  assessmentId: string,
  input: unknown,
): Promise<AssessmentDetail> {
  const staff = requireStaff(session);
  const now = new Date();
  const changes = parseInput(
    updateAssessmentSchema(collegeTimeZone(), now),
    input,
  );
  const assessment = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true, title: true, deadline: true, closedAt: true },
      })
    : null;
  if (!assessment) throw assessmentNotFound();

  let closedAt: Date | null | undefined;
  if (changes.closed === true) {
    // Closing an assessment that is already closed keeps the original time.
    closedAt = assessment.closedAt ?? now;
  } else if (changes.closed === false) {
    closedAt = null;
  }
  await db().$transaction(async (tx) => {
    const updated = await tx.assessment.update({
      where: { id: assessment.id },
      data: { title: changes.title, deadline: changes.deadline, closedAt },
    });
    const details = { assessmentId: updated.id, title: updated.title };
    if (
      updated.title !== assessment.title ||
      updated.deadline.getTime() !== assessment.deadline.getTime()
    ) {
      await recordEvent(tx, staff, { action: "assessment.edited", details });
    }
    if (!assessment.closedAt && updated.closedAt) {
      await recordEvent(tx, staff, { action: "assessment.closed", details });
    } else if (assessment.closedAt && !updated.closedAt) {
      await recordEvent(tx, staff, { action: "assessment.reopened", details });
    }
  });
  return getAssessment(session, assessment.id);
}

/**
 * Saves marks from an assessment's marksheet (staff only): the marks that
 * changed, keyed by student ID, with null removing a mark. A changed mark is
 * unpublished again, so a student never sees a mark staff haven't released.
 * Marks can be given with or without a submission.
 *
 * @throws AppError: VALIDATION, with an error per student ID that is unknown
 *   or not on the assessment's programme; NOT_FOUND; CONFLICT if someone else
 *   saved a mark for the same student at the same moment.
 */
export async function saveMarks(
  session: Session | null,
  assessmentId: string,
  input: unknown,
): Promise<AssessmentDetail> {
  const staff = requireStaff(session);
  const { marks } = parseInput(marksheetSchema, input);
  const assessment = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        select: {
          id: true,
          title: true,
          moduleId: true,
          deadline: true,
          closedAt: true,
        },
      })
    : null;
  if (!assessment) throw assessmentNotFound();
  if (!canEnterMarks(assessment, new Date())) {
    throw new AppError("CONFLICT", MARKS_NOT_YET_MESSAGE);
  }
  const academicYear = academicYearAt(assessment.deadline, collegeTimeZone());

  const students = await db().student.findMany({
    where: { studentNumber: { in: Object.keys(marks) } },
    select: {
      id: true,
      studentNumber: true,
      registrations: {
        where: { moduleId: assessment.moduleId, academicYear },
        select: { id: true },
      },
      submissions: { where: { assessmentId }, select: { id: true } },
      results: { where: { assessmentId }, select: { id: true, mark: true } },
    },
  });
  const fieldErrors: FieldErrors = {};
  for (const studentNumber of Object.keys(marks)) {
    const student = students.find((s) => s.studentNumber === studentNumber);
    if (!student) {
      fieldErrors[`marks.${studentNumber}`] = ["There is no such student"];
    } else if (
      student.registrations.length === 0 &&
      student.submissions.length === 0 &&
      student.results.length === 0
    ) {
      fieldErrors[`marks.${studentNumber}`] = [
        "This student isn't registered on the assessment's module",
      ];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError("VALIDATION", "Some marks can't be saved.", fieldErrors);
  }

  try {
    await db().$transaction(async (tx) => {
      // One marksheet save at a time for an assessment: each then reads the
      // marks as the last one left them, so it never updates or removes a
      // mark that has just gone, and its audit trail says what really
      // changed.
      await tx.$queryRaw`
        SELECT id FROM assessments WHERE id = ${assessment.id}::uuid FOR UPDATE`;
      const current = new Map(
        (
          await tx.assessmentResult.findMany({
            where: {
              assessmentId,
              studentId: { in: students.map(({ id }) => id) },
            },
            select: { id: true, studentId: true, mark: true },
          })
        ).map((result) => [result.studentId, result]),
      );
      for (const student of students) {
        const mark = marks[student.studentNumber] ?? null;
        const existing = current.get(student.id);
        if (mark === null) {
          if (!existing) continue;
          await tx.assessmentResult.delete({ where: { id: existing.id } });
        } else if (!existing) {
          await tx.assessmentResult.create({
            data: { studentId: student.id, assessmentId, mark },
          });
        } else if (existing.mark !== mark) {
          await tx.assessmentResult.update({
            where: { id: existing.id },
            data: { mark, publishedAt: null },
          });
        } else {
          continue;
        }
        await recordEvent(tx, staff, {
          action: "mark.saved",
          studentId: student.id,
          details: {
            assessmentId,
            title: assessment.title,
            from: existing?.mark ?? null,
            to: mark,
          },
        });
      }
    });
  } catch (error) {
    if (
      violatedUniqueConstraint(error) ===
      "assessment_results_student_id_assessment_id_key"
    ) {
      throw new AppError(
        "CONFLICT",
        "Someone else saved marks for this assessment just now. Reload the page and try again.",
      );
    }
    throw error;
  }
  return getAssessment(session, assessmentId);
}

function assessmentNotFound(): AppError {
  return new AppError("NOT_FOUND", "There is no such assessment.");
}

/** The key of a module's students in an academic year. */
function cohortKey(moduleId: string, academicYear: string): string {
  return `${moduleId} ${academicYear}`;
}

/**
 * The students expected to submit for modules in academic years: those
 * registered on the module for the year who are now enrolled, by cohortKey.
 */
async function expectedStudents(
  cohorts: readonly { moduleId: string; academicYear: string }[],
): Promise<Map<string, Set<string>>> {
  const expected = new Map<string, Set<string>>();
  if (cohorts.length === 0) return expected;
  const registrations = await db().moduleRegistration.findMany({
    where: {
      moduleId: { in: [...new Set(cohorts.map((c) => c.moduleId))] },
      academicYear: { in: [...new Set(cohorts.map((c) => c.academicYear))] },
      student: { status: "ENROLLED" },
    },
    select: { moduleId: true, academicYear: true, studentId: true },
  });
  for (const { moduleId, academicYear, studentId } of registrations) {
    const key = cohortKey(moduleId, academicYear);
    expected.set(key, (expected.get(key) ?? new Set()).add(studentId));
  }
  return expected;
}

function toSummary(
  assessment: AssessmentWithSubmissions,
  expected: ReadonlySet<string> | undefined,
  now: Date,
  timeZone: string,
): AssessmentSummary {
  const { deadline, module: moduleRow } = assessment;
  const fromExpected = assessment.submissions.filter(({ studentId }) =>
    expected?.has(studentId),
  );
  return {
    id: assessment.id,
    title: assessment.title,
    module: {
      code: moduleRow.code,
      title: moduleRow.title,
      semester: moduleRow.semester,
    },
    academicYear: academicYearAt(deadline, timeZone),
    deadline,
    closedAt: assessment.closedAt,
    state: assessmentState(assessment, now),
    expectedCount: expected?.size ?? 0,
    submittedCount: fromExpected.length,
    lateCount: fromExpected.filter(({ submittedAt }) =>
      isLate(submittedAt, deadline),
    ).length,
  };
}
