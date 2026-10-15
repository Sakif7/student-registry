// Assessments: staff set work for a module with a deadline, then can move the
// deadline, close the assessment to submissions or reopen it. Each assessment
// tracks who on the programme has submitted, and who submitted late.
import "server-only";

import {
  createAssessmentSchema,
  updateAssessmentSchema,
} from "@/domain/assessments";
import type { EnrolmentStatus } from "@/domain/enrolment";
import {
  type AssessmentState,
  assessmentState,
  compareAssessments,
  isLate,
} from "@/domain/submissions";
import type { Prisma } from "@/generated/prisma/client";

import { collegeTimeZone } from "../college";
import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { isId } from "../ids";
import { requireSession, requireStaff, type Session } from "../session";

/** A module, as offered when setting an assessment. */
export interface ModuleOption {
  code: string;
  title: string;
  programme: { code: string; title: string };
}

/** An assessment as staff see it in the list. */
export interface AssessmentSummary {
  id: string;
  title: string;
  module: { code: string; title: string };
  programme: { code: string; title: string };
  deadline: Date;
  closedAt: Date | null;
  state: AssessmentState;
  /** Students expected to submit: those now enrolled on the programme. */
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

/** One student's line in an assessment's submission tracker. */
export interface TrackerRow {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
  submission: SubmissionView | null;
}

/** An assessment, with every student who should submit or did. */
export interface AssessmentDetail extends AssessmentSummary {
  createdAt: Date;
  /**
   * The students enrolled on the programme, plus anyone else who submitted
   * (e.g. a student who withdrew afterwards), by name.
   */
  students: TrackerRow[];
}

const summaryInclude = {
  module: { include: { programme: true } },
  submissions: {
    select: {
      submittedAt: true,
      student: { select: { status: true, programmeId: true } },
    },
  },
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
    select: {
      code: true,
      title: true,
      programme: { select: { code: true, title: true } },
    },
    orderBy: [{ programme: { title: "asc" } }, { code: "asc" }],
  });
}

/** Every assessment, with submission counts (staff only). */
export async function listAssessments(
  session: Session | null,
): Promise<AssessmentSummary[]> {
  requireStaff(session);
  const now = new Date();
  const [assessments, enrolled] = await Promise.all([
    db().assessment.findMany({ include: summaryInclude }),
    db().student.groupBy({
      by: ["programmeId"],
      where: { status: "ENROLLED" },
      _count: { _all: true },
    }),
  ]);
  const expected = new Map(
    enrolled.map((group) => [group.programmeId, group._count._all]),
  );

  return assessments
    .map((assessment) =>
      toSummary(
        assessment,
        expected.get(assessment.module.programmeId) ?? 0,
        now,
      ),
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

  const programmeId = assessment.module.programmeId;
  const [expectedCount, students] = await Promise.all([
    db().student.count({ where: { programmeId, status: "ENROLLED" } }),
    db().student.findMany({
      where: {
        OR: [
          { programmeId, status: "ENROLLED" },
          { submissions: { some: { assessmentId: assessment.id } } },
        ],
      },
      select: {
        studentNumber: true,
        fullName: true,
        status: true,
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
    }),
  ]);

  return {
    ...toSummary(assessment, expectedCount, new Date()),
    createdAt: assessment.createdAt,
    students: students.map(({ submissions: [submission], ...student }) => ({
      ...student,
      submission: submission
        ? {
            ...submission,
            late: isLate(submission.submittedAt, assessment.deadline),
          }
        : null,
    })),
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
  requireStaff(session);
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

  const assessment = await db().assessment.create({
    data: {
      moduleId: moduleRow.id,
      title: details.title,
      deadline: details.deadline,
    },
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
  requireStaff(session);
  const now = new Date();
  const changes = parseInput(
    updateAssessmentSchema(collegeTimeZone(), now),
    input,
  );
  const assessment = isId(assessmentId)
    ? await db().assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true, closedAt: true },
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
  await db().assessment.update({
    where: { id: assessment.id },
    data: { title: changes.title, deadline: changes.deadline, closedAt },
  });
  return getAssessment(session, assessment.id);
}

function assessmentNotFound(): AppError {
  return new AppError("NOT_FOUND", "There is no such assessment.");
}

function toSummary(
  assessment: AssessmentWithSubmissions,
  expectedCount: number,
  now: Date,
): AssessmentSummary {
  const { deadline, module: moduleRow } = assessment;
  const fromExpected = assessment.submissions.filter(
    ({ student }) =>
      student.status === "ENROLLED" &&
      student.programmeId === moduleRow.programmeId,
  );
  return {
    id: assessment.id,
    title: assessment.title,
    module: { code: moduleRow.code, title: moduleRow.title },
    programme: {
      code: moduleRow.programme.code,
      title: moduleRow.programme.title,
    },
    deadline,
    closedAt: assessment.closedAt,
    state: assessmentState(assessment, now),
    expectedCount,
    submittedCount: fromExpected.length,
    lateCount: fromExpected.filter(({ submittedAt }) =>
      isLate(submittedAt, deadline),
    ).length,
  };
}
