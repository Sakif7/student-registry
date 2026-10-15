// Assessment submissions: who may submit and when, which files are accepted,
// and when work counts as late.
import { canSubmitWork, type EnrolmentStatus } from "./enrolment";

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

/** Work is late if it was submitted after the deadline (to the millisecond). */
export function isLate(submittedAt: Date, deadline: Date): boolean {
  return submittedAt > deadline;
}

export type SubmissionRefusal =
  "NOT_ON_PROGRAMME" | "NOT_ENROLLED" | "CLOSED" | "DEADLINE_PASSED";

export const SUBMISSION_REFUSAL_MESSAGES: Record<SubmissionRefusal, string> = {
  NOT_ON_PROGRAMME: "This assessment isn't part of your programme.",
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
  onProgramme: boolean;
  assessment: { deadline: Date; closedAt: Date | null };
  alreadySubmitted: boolean;
  now: Date;
}): SubmissionCheck {
  if (!input.onProgramme) return { allowed: false, reason: "NOT_ON_PROGRAMME" };
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
