// Assessments: staff set work for a module with a deadline, then can move the
// deadline, close the assessment to submissions or reopen it. An assessment
// belongs to the academic year of its deadline, and is for the students
// registered on its module that year. Each assessment has a marksheet: who
// has submitted (and who late), and their marks. Who counts as expected to
// submit is decided at the deadline (see expectedToSubmit).
import "server-only";

import {
  createAssessmentSchema,
  updateAssessmentSchema,
} from "@/domain/assessments";
import {
  academicYearAt,
  academicYearOn,
  academicYearSpan,
  academicYearsAround,
  yearEndedSince,
} from "@/domain/academic-year";
import { instantToWallTime } from "@/domain/college-time";
import type { ModuleKind, Semester } from "@/domain/curriculum";
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
  expectedToSubmit,
  isLate,
} from "@/domain/submissions";
import type { Prisma } from "@/generated/prisma/client";
import type { RegisteredByModule } from "@/lib/deadline-notes";
import { formatDate } from "@/lib/format";

import { recordEvent } from "../audit";
import { collegeTimeZone, collegeToday } from "../college";
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
   * academic year and enrolled, at the deadline once it has passed.
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
  /** Counted in "submitted of expected" (see expectedToSubmit). */
  expected: boolean;
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

/** A programme and its modules, as offered when setting an assessment. */
export interface ProgrammeModules {
  code: string;
  title: string;
  /** Year by year, then by code. */
  modules: (ModuleOption & { yearOfStudy: number; kind: ModuleKind })[];
}

/**
 * Every programme with its modules, for choosing a module by programme when
 * setting an assessment (staff only). A module shared by programmes is
 * under each.
 */
export async function listProgrammeModules(
  session: Session | null,
): Promise<ProgrammeModules[]> {
  requireStaff(session);
  const programmes = await db().programme.findMany({
    select: {
      code: true,
      title: true,
      modules: {
        select: {
          yearOfStudy: true,
          kind: true,
          module: { select: { code: true, title: true, semester: true } },
        },
        orderBy: [{ yearOfStudy: "asc" }, { module: { code: "asc" } }],
      },
    },
    orderBy: { title: "asc" },
  });
  return programmes.map(({ modules, ...programme }) => ({
    ...programme,
    modules: modules.map(({ module, ...place }) => ({ ...module, ...place })),
  }));
}

/**
 * How many enrolled students are registered on each module, this academic
 * year and next: who a deadline set or moved into one of those years
 * reaches (staff only).
 */
export async function registeredByModule(
  session: Session | null,
): Promise<RegisteredByModule> {
  requireStaff(session);
  const years = academicYearsAround(academicYearOn(collegeToday()), 0, 1);
  const rows = await db().moduleRegistration.findMany({
    where: {
      academicYear: { in: years },
      endedAt: null,
      student: { status: "ENROLLED" },
    },
    select: { academicYear: true, module: { select: { code: true } } },
  });
  const byModule: Record<string, Record<string, number>> = {};
  for (const { academicYear, module } of rows) {
    const byYear = (byModule[module.code] ??= {});
    byYear[academicYear] = (byYear[academicYear] ?? 0) + 1;
  }
  return { years, byModule };
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
  const expected = await expectedStudents(assessments, now, timeZone);

  return assessments
    .map((assessment) =>
      toSummary(assessment, expected.get(assessment.id), now, timeZone),
    )
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

  const now = new Date();
  const timeZone = collegeTimeZone();
  const expected =
    (await expectedStudents([assessment], now, timeZone)).get(assessment.id) ??
    new Set<string>();
  const students = await db().student.findMany({
    where: {
      OR: [
        { id: { in: [...expected] } },
        { submissions: { some: { assessmentId: assessment.id } } },
        { results: { some: { assessmentId: assessment.id } } },
      ],
    },
    select: {
      id: true,
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
    ...toSummary(assessment, expected, now, timeZone),
    createdAt: assessment.createdAt,
    students: students.map(
      ({
        id,
        submissions: [submission],
        results: [result],
        resultsWithheldAt,
        ...student
      }) => ({
        ...student,
        resultsWithheld: resultsWithheldAt !== null,
        expected: expected.has(id),
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
 * because lateness is worked out when read. A deadline moves to another
 * academic year, and so to that year's students, only while it is still to
 * come and nothing has been submitted or marked: once it has passed, its
 * students were due then, and moving it would erase the work they missed.
 *
 * @throws AppError: VALIDATION, NOT_FOUND; CONFLICT for reopening an
 *   assessment whose academic year has ended.
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
  const timeZone = collegeTimeZone();
  const academicYear = academicYearAt(assessment.deadline, timeZone);
  const changesYear =
    changes.deadline !== undefined &&
    academicYearAt(changes.deadline, timeZone) !== academicYear;
  const lastDay = formatDate(academicYearSpan(academicYear).last);
  if (changesYear && assessment.deadline <= now) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      deadline: [
        `The deadline has passed, so keep it within ${academicYear}, by ${lastDay}: its students were due then. For another year, set a new assessment.`,
      ],
    });
  }

  let closedAt: Date | null | undefined;
  if (changes.closed === true) {
    // Closing an assessment that is already closed keeps the original time.
    closedAt = assessment.closedAt ?? now;
  } else if (changes.closed === false) {
    // An assessment closes on its own when its academic year ends.
    if (yearEndedSince(assessment.deadline, now, timeZone)) {
      throw new AppError(
        "CONFLICT",
        `${academicYear} has ended, so the assessment takes no more work.`,
      );
    }
    closedAt = null;
  }
  await db().$transaction(async (tx) => {
    if (changesYear) {
      // Its students are those registered on the module for the year of
      // its deadline, so another year hands it to another cohort. That's
      // how a year typed wrongly is put right, but not once there is work:
      // the work would go with it. Locked, as submitting work shares the
      // lock, so none can arrive while it moves.
      await tx.$queryRaw`
        SELECT id FROM assessments WHERE id = ${assessment.id}::uuid FOR UPDATE`;
      const [submissions, marks] = await Promise.all([
        tx.submission.count({ where: { assessmentId: assessment.id } }),
        tx.assessmentResult.count({ where: { assessmentId: assessment.id } }),
      ]);
      if (submissions + marks > 0) {
        throw new AppError("VALIDATION", "Some fields need correcting.", {
          deadline: [
            `Work has been submitted or marked, so keep the deadline within ${academicYear}, by ${lastDay}: it is that year's students' work. For another year, set a new assessment.`,
          ],
        });
      }
    }
    const updated = await tx.assessment.update({
      where: { id: assessment.id },
      data: { title: changes.title, deadline: changes.deadline, closedAt },
    });
    const details = { assessmentId: updated.id, title: updated.title };
    const renamed = updated.title !== assessment.title;
    const moved = updated.deadline.getTime() !== assessment.deadline.getTime();
    if (renamed || moved) {
      // Deadlines as college wall times, as staff typed them: an appeal
      // about lateness needs the deadline before and after.
      const wallTime = (instant: Date) =>
        instantToWallTime(instant, timeZone).slice(0, 16);
      await recordEvent(tx, staff, {
        action: "assessment.edited",
        details: {
          ...details,
          changes: {
            ...(renamed && {
              title: { from: assessment.title, to: updated.title },
            }),
            ...(moved && {
              deadline: {
                from: wallTime(assessment.deadline),
                to: wallTime(updated.deadline),
              },
            }),
          },
        },
      });
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
  const found = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true },
      })
    : null;
  if (!found) throw assessmentNotFound();

  try {
    await db().$transaction(async (tx) => {
      // One marksheet save at a time for an assessment: each then reads the
      // marks as the last one left them, so it never updates or removes a
      // mark that has just gone, and its audit trail says what really
      // changed. The assessment is read under the same lock, which moving
      // its deadline takes too: a deadline moved to another year meanwhile
      // would change whose marks these can be.
      await tx.$queryRaw`
        SELECT id FROM assessments WHERE id = ${found.id}::uuid FOR UPDATE`;
      const assessment = await tx.assessment.findUniqueOrThrow({
        where: { id: found.id },
        select: {
          id: true,
          title: true,
          moduleId: true,
          deadline: true,
          closedAt: true,
        },
      });
      if (!canEnterMarks(assessment, new Date())) {
        throw new AppError("CONFLICT", MARKS_NOT_YET_MESSAGE);
      }
      const students = await studentsToMark(tx, assessment, Object.keys(marks));
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

/**
 * The students named on a marksheet, each of whom must be on the
 * assessment's module at its deadline, or already have work or a mark for
 * it.
 *
 * @throws AppError: VALIDATION, with an error per student ID that is unknown
 *   or not on the module.
 */
async function studentsToMark(
  tx: Prisma.TransactionClient,
  assessment: { id: string; moduleId: string; deadline: Date },
  studentNumbers: readonly string[],
) {
  const academicYear = academicYearAt(assessment.deadline, collegeTimeZone());
  const students = await tx.student.findMany({
    where: { studentNumber: { in: [...studentNumbers] } },
    select: {
      id: true,
      studentNumber: true,
      // On the module at the deadline: not left before it.
      registrations: {
        where: {
          moduleId: assessment.moduleId,
          academicYear,
          OR: [{ endedAt: null }, { endedAt: { gte: assessment.deadline } }],
        },
        select: { id: true },
      },
      submissions: {
        where: { assessmentId: assessment.id },
        select: { id: true },
      },
      results: { where: { assessmentId: assessment.id }, select: { id: true } },
    },
  });
  const fieldErrors: FieldErrors = {};
  for (const studentNumber of studentNumbers) {
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
  return students;
}

function assessmentNotFound(): AppError {
  return new AppError("NOT_FOUND", "There is no such assessment.");
}

/** The key of a module's students in an academic year. */
function cohortKey(moduleId: string, academicYear: string): string {
  return `${moduleId} ${academicYear}`;
}

/**
 * The students expected to submit for each assessment, by assessment ID:
 * those registered on its module for the academic year of its deadline whom
 * expectedToSubmit counts.
 */
async function expectedStudents(
  assessments: readonly { id: string; moduleId: string; deadline: Date }[],
  now: Date,
  timeZone: string,
): Promise<Map<string, Set<string>>> {
  const expected = new Map<string, Set<string>>();
  if (assessments.length === 0) return expected;
  const cohorts = assessments.map((assessment) => ({
    ...assessment,
    academicYear: academicYearAt(assessment.deadline, timeZone),
  }));
  const registrations = await db().moduleRegistration.findMany({
    where: {
      moduleId: { in: [...new Set(cohorts.map((c) => c.moduleId))] },
      academicYear: { in: [...new Set(cohorts.map((c) => c.academicYear))] },
    },
    select: {
      moduleId: true,
      academicYear: true,
      studentId: true,
      registeredAt: true,
      endedAt: true,
      student: {
        select: {
          status: true,
          statusChanges: { select: { toStatus: true, changedAt: true } },
        },
      },
    },
  });
  const byCohort = Map.groupBy(registrations, (registration) =>
    cohortKey(registration.moduleId, registration.academicYear),
  );
  for (const cohort of cohorts) {
    const registered =
      byCohort.get(cohortKey(cohort.moduleId, cohort.academicYear)) ?? [];
    expected.set(
      cohort.id,
      new Set(
        registered
          .filter(({ registeredAt, endedAt, student }) =>
            expectedToSubmit(
              {
                registeredAt,
                endedAt,
                status: student.status,
                history: student.statusChanges,
              },
              cohort.deadline,
              now,
            ),
          )
          .map(({ studentId }) => studentId),
      ),
    );
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
    state: assessmentState(
      assessment,
      now,
      yearEndedSince(deadline, now, timeZone),
    ),
    expectedCount: expected?.size ?? 0,
    submittedCount: fromExpected.length,
    lateCount: fromExpected.filter(({ submittedAt }) =>
      isLate(submittedAt, deadline),
    ).length,
  };
}
