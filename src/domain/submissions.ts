// Assessment submissions: who may submit and when, which files are accepted,
// and when work counts as late.
import { z } from "zod";

import { canSubmitWork, type EnrolmentStatus } from "./enrolment";
import { type SortDirection, sortDirectionSchema } from "./sorting";

/** Largest file accepted, in bytes (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The file types students may upload. */
export const ACCEPTED_DOCUMENTS = {
  pdf: { extension: ".pdf", mimeType: "application/pdf", label: "PDF" },
  docx: {
    extension: ".docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word (.docx)",
  },
} as const;

export type DocumentKind = keyof typeof ACCEPTED_DOCUMENTS;

/** The accepted document kind a file name's extension claims, if any. */
export function documentKindOf(fileName: string): DocumentKind | null {
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  for (const [kind, document] of Object.entries(ACCEPTED_DOCUMENTS)) {
    if (document.extension === extension) return kind as DocumentKind;
  }
  return null;
}

/**
 * A file name that is safe to show and to put in a download header: no
 * folders, control characters or quotes, and at most 120 characters (keeping
 * the extension).
 */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  // Control characters, quotes and other characters unsafe in file names.
  const cleaned = base
    .replace(/[\p{Cc}"*:<>?|]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 120) return cleaned || "submission";
  const extension = cleaned.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
  return cleaned.slice(0, 120 - extension.length) + extension;
}

/** Why an uploaded file is refused. */
export type FileProblem =
  | "EMPTY"
  | "TOO_LARGE"
  | "NOT_A_DOCUMENT"
  | "MACRO_ENABLED"
  | "CONTENT_MISMATCH";

export const FILE_PROBLEM_MESSAGES: Record<FileProblem, string> = {
  EMPTY: "The file is empty",
  TOO_LARGE: "The file is larger than 10 MB",
  NOT_A_DOCUMENT: "Upload a PDF or a Word document (.docx)",
  MACRO_ENABLED:
    "Macro-enabled Word documents can't be accepted. Save the document as .docx and upload that",
  CONTENT_MISMATCH:
    "This file isn't a valid PDF or Word document, whatever its name says",
};

// What browsers declare when they don't know a file's type.
const UNKNOWN_TYPES = new Set(["", "application/octet-stream"]);

/**
 * The checks that need only the file's name and size, so the upload form
 * can make them before sending anything.
 */
export function precheckFile(file: {
  name: string;
  size: number;
}): FileProblem | null {
  if (file.size === 0) return "EMPTY";
  if (file.size > MAX_UPLOAD_BYTES) return "TOO_LARGE";
  if (/\.docm$/i.test(file.name)) return "MACRO_ENABLED";
  return documentKindOf(file.name) ? null : "NOT_A_DOCUMENT";
}

/**
 * Checks an uploaded file. Its extension, the type the browser declared and
 * the type its content shows must all agree, so a renamed file is refused,
 * including a macro-enabled Word document renamed to .docx.
 *
 * @param file - The file's name, declared MIME type and size.
 * @param detected - The type its content shows (from file-type), if known.
 * @returns The kind of document, or why the file is refused.
 */
export function checkUploadedFile(
  file: { name: string; type: string; size: number },
  detected: { ext: string } | undefined,
): { kind: DocumentKind } | { problem: FileProblem } {
  const problem = precheckFile(file);
  if (problem) return { problem };
  if (detected?.ext === "docm") return { problem: "MACRO_ENABLED" };

  const kind = documentKindOf(file.name);
  if (!kind) return { problem: "NOT_A_DOCUMENT" };
  const declared = file.type.toLowerCase();
  const declaredOk =
    UNKNOWN_TYPES.has(declared) ||
    declared === ACCEPTED_DOCUMENTS[kind].mimeType;
  if (!declaredOk || detected?.ext !== kind) {
    return { problem: "CONTENT_MISMATCH" };
  }
  return { kind };
}

/**
 * Where an assessment stands for submissions: open before the deadline,
 * accepting late work after it, and closed once staff close it.
 */
export type AssessmentState = "OPEN" | "ACCEPTING_LATE" | "CLOSED";

export const ASSESSMENT_STATE_LABELS: Record<AssessmentState, string> = {
  OPEN: "Open",
  ACCEPTING_LATE: "Past deadline",
  CLOSED: "Closed",
};

export function assessmentState(
  assessment: { deadline: Date; closedAt: Date | null },
  now: Date,
): AssessmentState {
  if (assessment.closedAt) return "CLOSED";
  return now > assessment.deadline ? "ACCEPTING_LATE" : "OPEN";
}

const STATE_ORDER: Record<AssessmentState, number> = {
  OPEN: 0,
  ACCEPTING_LATE: 1,
  CLOSED: 2,
};

/**
 * Orders assessments for lists: open ones first, soonest deadline first, then
 * the rest, most recent deadline first.
 */
export function compareAssessments(
  a: { state: AssessmentState; deadline: Date; title: string },
  b: { state: AssessmentState; deadline: Date; title: string },
): number {
  const byDeadline = a.deadline.getTime() - b.deadline.getTime();
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    (a.state === "OPEN" ? byDeadline : -byDeadline) ||
    a.title.localeCompare(b.title)
  );
}

/** The columns the staff list of assessments can be sorted by. */
export const ASSESSMENT_SORTS = [
  "title",
  "module",
  "deadline",
  "state",
  "submitted",
] as const;
export type AssessmentSort = (typeof ASSESSMENT_SORTS)[number];

/** The list's order, read from the URL. Unknown values are ignored. */
export const assessmentOrderSchema = z.object({
  sort: z.enum(ASSESSMENT_SORTS).optional().catch(undefined),
  dir: sortDirectionSchema,
});
export type AssessmentOrder = z.infer<typeof assessmentOrderSchema>;

/** An assessment as the staff list shows it. */
interface ListedAssessment {
  title: string;
  module: { code: string };
  deadline: Date;
  state: AssessmentState;
  submittedCount: number;
  expectedCount: number;
}

const COLUMN_ORDERS: Record<
  AssessmentSort,
  (a: ListedAssessment, b: ListedAssessment) => number
> = {
  title: (a, b) => a.title.localeCompare(b.title),
  module: (a, b) => a.module.code.localeCompare(b.module.code),
  deadline: (a, b) => a.deadline.getTime() - b.deadline.getTime(),
  state: (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state],
  // By the share of the students expected who have submitted.
  submitted: (a, b) => submittedShare(a) - submittedShare(b),
};

/**
 * Sorts the staff list of assessments by a column, either way. Ties keep the
 * usual order (compareAssessments), so sorting by state, the default, is
 * the usual order itself.
 */
export function sortAssessments<Assessment extends ListedAssessment>(
  assessments: readonly Assessment[],
  sort: AssessmentSort = "state",
  dir: SortDirection = "asc",
): Assessment[] {
  const byColumn = COLUMN_ORDERS[sort];
  const sign = dir === "asc" ? 1 : -1;
  return [...assessments].sort(
    (a, b) => sign * byColumn(a, b) || compareAssessments(a, b),
  );
}

function submittedShare(assessment: ListedAssessment): number {
  return assessment.expectedCount > 0
    ? assessment.submittedCount / assessment.expectedCount
    : 0;
}

/** Work is late if it was submitted after the deadline (to the millisecond). */
export function isLate(submittedAt: Date, deadline: Date): boolean {
  return submittedAt > deadline;
}

export type SubmissionRefusal =
  "NOT_REGISTERED" | "NOT_ENROLLED" | "CLOSED" | "DEADLINE_PASSED";

export const SUBMISSION_REFUSAL_MESSAGES: Record<SubmissionRefusal, string> = {
  NOT_REGISTERED:
    "You aren't registered on this assessment's module this year.",
  NOT_ENROLLED: "Only enrolled students can submit work.",
  CLOSED: "This assessment is closed to submissions.",
  DEADLINE_PASSED:
    "The deadline has passed, so your submission can no longer be replaced.",
};

export type SubmissionCheck =
  | { allowed: true; late: boolean; resubmission: boolean }
  | { allowed: false; reason: SubmissionRefusal };

/**
 * Decides whether a student may submit (or resubmit) work now. A first
 * submission after the deadline is accepted and flagged late; replacing a
 * submission is only possible before the deadline.
 */
export function checkSubmission(input: {
  status: EnrolmentStatus;
  /** Registered on the module for the academic year of the deadline. */
  registered: boolean;
  assessment: { deadline: Date; closedAt: Date | null };
  alreadySubmitted: boolean;
  now: Date;
}): SubmissionCheck {
  if (!input.registered) return { allowed: false, reason: "NOT_REGISTERED" };
  if (!canSubmitWork(input.status))
    return { allowed: false, reason: "NOT_ENROLLED" };
  const state = assessmentState(input.assessment, input.now);
  if (state === "CLOSED") return { allowed: false, reason: "CLOSED" };
  if (state === "ACCEPTING_LATE" && input.alreadySubmitted) {
    return { allowed: false, reason: "DEADLINE_PASSED" };
  }
  return {
    allowed: true,
    late: state === "ACCEPTING_LATE",
    resubmission: input.alreadySubmitted,
  };
}
