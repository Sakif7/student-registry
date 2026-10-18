// Students' submissions: the assessments a student can see with their own
// work, uploading work (and replacing it until the deadline), and
// downloading submitted files.
import "server-only";

import { fileTypeFromBuffer } from "file-type";

import { academicYearAt, yearEndedSince } from "@/domain/academic-year";
import type { EnrolmentStatus } from "@/domain/enrolment";
import {
  ACCEPTED_DOCUMENTS,
  type AssessmentState,
  assessmentState,
  checkSubmission,
  checkUploadedFile,
  compareAssessments,
  FILE_PROBLEM_MESSAGES,
  type FileProblem,
  isLate,
  safeFileName,
  SUBMISSION_REFUSAL_MESSAGES,
  type SubmissionRefusal,
} from "@/domain/submissions";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeTimeZone } from "../college";
import { db } from "../db";
import { AppError, type ErrorKind, violatedUniqueConstraint } from "../errors";
import { isId } from "../ids";
import {
  requireSession,
  requireStaffOrSelf,
  requireStudent,
  type Session,
} from "../session";
import { deleteStoredFile, readStoredFile, storeFile } from "../storage";

/** A student's own submission, as they see it. */
export interface OwnSubmission {
  id: string;
  fileName: string;
  sizeBytes: number;
  /** 1 for the first upload, then one more for each replacement. */
  attempt: number;
  submittedAt: Date;
  late: boolean;
}

/** Whether the student can upload now, and if not, why not. */
export type UploadPermission =
  | { allowed: true; late: boolean; resubmission: boolean }
  | { allowed: false; reason: SubmissionRefusal; message: string };

/** An assessment as a student sees it, with their own submission. */
export interface StudentAssessment {
  id: string;
  title: string;
  module: { code: string; title: string };
  deadline: Date;
  closedAt: Date | null;
  state: AssessmentState;
  submission: OwnSubmission | null;
  upload: UploadPermission;
}

const SUBMISSION_FIELDS = {
  id: true,
  fileName: true,
  sizeBytes: true,
  attempt: true,
  submittedAt: true,
} satisfies Prisma.SubmissionSelect;

/**
 * A student's assessments, with their own work, for staff or the student
 * themselves: those of the modules they were registered on, for the years
 * they were registered, and any others they submitted to. Being on a
 * module's programme isn't enough.
 *
 * @throws AppError: NOT_FOUND; UNAUTHENTICATED or FORBIDDEN.
 */
export async function listStudentAssessments(
  session: Session | null,
  studentNumber: string,
): Promise<StudentAssessment[]> {
  const number = studentNumber.toUpperCase();
  requireStaffOrSelf(session, number);
  const student = await findStudent(number);
  const assessments = await db().assessment.findMany({
    where: visibleTo(student),
    include: assessmentInclude(student),
  });
  const now = new Date();
  return assessments
    .filter((assessment) => takes(assessment))
    .map((assessment) => toStudentAssessment(assessment, student, now))
    .sort(compareAssessments);
}

/**
 * One assessment as the signed-in student sees it.
 *
 * @throws AppError: NOT_FOUND, including for an assessment that isn't the
 *   student's (see takes); UNAUTHENTICATED or FORBIDDEN.
 */
export async function getStudentAssessment(
  session: Session | null,
  assessmentId: string,
): Promise<StudentAssessment> {
  const { studentNumber } = requireStudent(session);
  const student = await findStudent(studentNumber);
  const assessment = isId(assessmentId)
    ? await db().assessment.findFirst({
        where: { id: assessmentId, ...visibleTo(student) },
        include: assessmentInclude(student),
      })
    : null;
  if (!assessment || !takes(assessment)) throw assessmentNotFound();
  return toStudentAssessment(assessment, student, new Date());
}

/**
 * Submits the signed-in student's work for an assessment: a first submission,
 * or a replacement until the deadline. The file is checked (type, content and
 * size) before anything is stored, and the rules are checked again at the
 * moment of saving, inside a transaction that locks the assessment and the
 * student's submission, so a concurrent close or upload can't slip past them.
 *
 * @returns The saved submission, and whether it replaced an earlier one.
 * @throws AppError: VALIDATION, PAYLOAD_TOO_LARGE or UNSUPPORTED_MEDIA_TYPE
 *   for the file; NOT_FOUND; FORBIDDEN for a student who isn't enrolled;
 *   CONFLICT once the assessment is closed, or for a replacement after the
 *   deadline.
 */
export async function submitWork(
  session: Session | null,
  assessmentId: string,
  file: File,
): Promise<{ submission: OwnSubmission; replaced: boolean }> {
  const me = requireStudent(session);
  const { studentNumber } = me;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkUploadedFile(
    { name: file.name, type: file.type, size: bytes.byteLength },
    await fileTypeFromBuffer(bytes),
  );
  if ("problem" in checked) throw fileRefused(checked.problem);
  const student = await findStudent(studentNumber);
  if (!isId(assessmentId)) throw assessmentNotFound();

  const storageKey = await storeFile(bytes);
  let saved: { submission: OwnSubmission; replacedKey: string | null };
  try {
    saved = await db().$transaction(async (tx) => {
      const [assessment] = await tx.$queryRaw<
        {
          title: string;
          deadline: Date;
          closed_at: Date | null;
          module_id: string;
        }[]
      >`
        SELECT title, deadline, closed_at, module_id
        FROM assessments
        WHERE id = ${assessmentId}::uuid
        FOR SHARE`;
      if (!assessment) throw assessmentNotFound();
      // On the module at the deadline: not left before it.
      const registration = await tx.moduleRegistration.findFirst({
        where: {
          studentId: student.id,
          moduleId: assessment.module_id,
          academicYear: academicYearAt(assessment.deadline, collegeTimeZone()),
          OR: [{ endedAt: null }, { endedAt: { gte: assessment.deadline } }],
        },
        select: { id: true },
      });
      const [existing] = await tx.$queryRaw<
        { id: string; storage_key: string; attempt: number }[]
      >`
        SELECT id, storage_key, attempt FROM submissions
        WHERE student_id = ${student.id}::uuid
          AND assessment_id = ${assessmentId}::uuid
        FOR UPDATE`;

      const now = new Date();
      const verdict = checkSubmission({
        status: student.status,
        registered: registration !== null,
        assessment: {
          deadline: assessment.deadline,
          closedAt: assessment.closed_at,
        },
        yearEnded: yearEndedSince(assessment.deadline, now, collegeTimeZone()),
        alreadySubmitted: existing !== undefined,
        now,
      });
      if (!verdict.allowed) throw submissionRefused(verdict.reason);

      const data = {
        fileName: safeFileName(file.name),
        storageKey,
        mimeType: ACCEPTED_DOCUMENTS[checked.kind].mimeType,
        sizeBytes: bytes.byteLength,
        submittedAt: now,
      };
      const row = existing
        ? await tx.submission.update({
            where: { id: existing.id },
            data: { ...data, attempt: existing.attempt + 1 },
            select: SUBMISSION_FIELDS,
          })
        : await tx.submission.create({
            data: { ...data, studentId: student.id, assessmentId },
            select: SUBMISSION_FIELDS,
          });
      const late = isLate(now, assessment.deadline);
      await recordEvent(tx, me, {
        action: "work.submitted",
        studentId: student.id,
        details: {
          assessmentId,
          title: assessment.title,
          fileName: data.fileName,
          late,
          attempt: existing ? existing.attempt + 1 : 1,
        },
      });
      return {
        submission: { ...row, late },
        replacedKey: existing?.storage_key ?? null,
      };
    });
  } catch (error) {
    await deleteStoredFile(storageKey);
    if (
      violatedUniqueConstraint(error) ===
      "submissions_student_id_assessment_id_key"
    ) {
      // Two first submissions at the same moment: the other one won.
      throw new AppError(
        "CONFLICT",
        "Another upload of your work finished at the same moment. Reload the page to see which file was kept.",
      );
    }
    throw error;
  }

  if (saved.replacedKey) {
    // The new file is saved either way; a leftover old file is only clutter.
    await deleteStoredFile(saved.replacedKey).catch((error: unknown) => {
      console.error(
        `Could not delete replaced file ${saved.replacedKey}:`,
        error,
      );
    });
  }
  return { submission: saved.submission, replaced: saved.replacedKey !== null };
}

/**
 * A submitted file, for staff or the student who submitted it.
 *
 * @throws AppError: NOT_FOUND (including a file missing from storage);
 *   UNAUTHENTICATED or FORBIDDEN.
 */
export async function getSubmissionFile(
  session: Session | null,
  submissionId: string,
): Promise<{ fileName: string; mimeType: string; bytes: Buffer }> {
  requireSession(session);
  const submission = isId(submissionId)
    ? await db().submission.findUnique({
        where: { id: submissionId },
        include: { student: { select: { studentNumber: true } } },
      })
    : null;
  if (!submission) {
    throw new AppError("NOT_FOUND", "There is no such submission.");
  }
  requireStaffOrSelf(session, submission.student.studentNumber);

  const bytes = await readStoredFile(submission.storageKey);
  if (!bytes) {
    console.error(
      `Submission ${submission.id} has no stored file (${submission.storageKey}).`,
    );
    throw new AppError("NOT_FOUND", "This file is no longer available.");
  }
  return {
    fileName: submission.fileName,
    mimeType: submission.mimeType,
    bytes,
  };
}

interface StudentForSubmissions {
  id: string;
  status: EnrolmentStatus;
}

async function findStudent(
  studentNumber: string,
): Promise<StudentForSubmissions> {
  const student = await db().student.findUnique({
    where: { studentNumber },
    select: { id: true, status: true },
  });
  if (!student) {
    throw new AppError(
      "NOT_FOUND",
      `There is no student with ID ${studentNumber}.`,
    );
  }
  return student;
}

/**
 * Assessments on modules the student has ever been registered on, and any
 * they submitted to. takes() then keeps those of the right academic year.
 */
function visibleTo(
  student: StudentForSubmissions,
): Prisma.AssessmentWhereInput {
  return {
    OR: [
      { module: { registrations: { some: { studentId: student.id } } } },
      { submissions: { some: { studentId: student.id } } },
    ],
  };
}

/** An assessment, with the student's own work and registrations. */
function assessmentInclude(student: StudentForSubmissions) {
  return {
    module: {
      include: {
        registrations: {
          where: { studentId: student.id },
          select: { academicYear: true, endedAt: true },
        },
      },
    },
    submissions: {
      where: { studentId: student.id },
      select: SUBMISSION_FIELDS,
    },
  } satisfies Prisma.AssessmentInclude;
}

type AssessmentForStudent = Prisma.AssessmentGetPayload<{
  include: ReturnType<typeof assessmentInclude>;
}>;

/**
 * The student was registered on the module for the assessment's year, and
 * hadn't left it before the deadline.
 */
function registeredFor(assessment: AssessmentForStudent): boolean {
  const year = academicYearAt(assessment.deadline, collegeTimeZone());
  return assessment.module.registrations.some(
    (registration) =>
      registration.academicYear === year &&
      (!registration.endedAt || registration.endedAt >= assessment.deadline),
  );
}

/**
 * Whether the assessment is the student's: they are registered on its
 * module for its year, or they submitted work for it (which they keep
 * seeing, even after dropping the module).
 */
function takes(assessment: AssessmentForStudent): boolean {
  return registeredFor(assessment) || assessment.submissions.length > 0;
}

function toStudentAssessment(
  assessment: AssessmentForStudent,
  student: StudentForSubmissions,
  now: Date,
): StudentAssessment {
  const [submission] = assessment.submissions;
  const yearEnded = yearEndedSince(assessment.deadline, now, collegeTimeZone());
  const verdict = checkSubmission({
    status: student.status,
    registered: registeredFor(assessment),
    assessment,
    yearEnded,
    alreadySubmitted: submission !== undefined,
    now,
  });
  return {
    id: assessment.id,
    title: assessment.title,
    module: { code: assessment.module.code, title: assessment.module.title },
    deadline: assessment.deadline,
    closedAt: assessment.closedAt,
    state: assessmentState(assessment, now, yearEnded),
    submission: submission
      ? {
          ...submission,
          late: isLate(submission.submittedAt, assessment.deadline),
        }
      : null,
    upload: verdict.allowed
      ? verdict
      : {
          allowed: false,
          reason: verdict.reason,
          message: SUBMISSION_REFUSAL_MESSAGES[verdict.reason],
        },
  };
}

function assessmentNotFound(): AppError {
  return new AppError("NOT_FOUND", "There is no such assessment.");
}

const FILE_PROBLEM_KINDS: Record<FileProblem, ErrorKind> = {
  EMPTY: "VALIDATION",
  TOO_LARGE: "PAYLOAD_TOO_LARGE",
  NOT_A_DOCUMENT: "UNSUPPORTED_MEDIA_TYPE",
  MACRO_ENABLED: "UNSUPPORTED_MEDIA_TYPE",
  CONTENT_MISMATCH: "UNSUPPORTED_MEDIA_TYPE",
};

function fileRefused(problem: FileProblem): AppError {
  const message = FILE_PROBLEM_MESSAGES[problem];
  return new AppError(FILE_PROBLEM_KINDS[problem], `${message}.`, {
    file: [message],
  });
}

function submissionRefused(reason: SubmissionRefusal): AppError {
  switch (reason) {
    case "NOT_REGISTERED":
      // An assessment on a module the student doesn't take is none of their
      // business.
      return assessmentNotFound();
    case "NOT_ENROLLED":
      return new AppError("FORBIDDEN", SUBMISSION_REFUSAL_MESSAGES[reason]);
    case "CLOSED":
    case "YEAR_ENDED":
    case "DEADLINE_PASSED":
      return new AppError("CONFLICT", SUBMISSION_REFUSAL_MESSAGES[reason]);
  }
}
