// Enrolment statuses: which changes are allowed, which need a reason, and what
// each status lets a student do.
import { EnrolmentStatus } from "@/generated/prisma/enums";

export { EnrolmentStatus };

/** Every status, in the order the Registry thinks about them. */
export const ENROLMENT_STATUSES = [
  EnrolmentStatus.ENROLLED,
  EnrolmentStatus.DEFERRED,
  EnrolmentStatus.WITHDRAWN,
  EnrolmentStatus.COMPLETED,
] as const;

export const ENROLMENT_STATUS_LABELS: Record<EnrolmentStatus, string> = {
  ENROLLED: "Enrolled",
  DEFERRED: "Deferred",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Completed",
};

/** A new record starts Enrolled, or Deferred for a deferred entry. */
export const INITIAL_STATUSES = [
  EnrolmentStatus.ENROLLED,
  EnrolmentStatus.DEFERRED,
] as const;

const ALLOWED_CHANGES: Record<EnrolmentStatus, readonly EnrolmentStatus[]> = {
  ENROLLED: ["DEFERRED", "WITHDRAWN", "COMPLETED"],
  DEFERRED: ["ENROLLED", "WITHDRAWN"],
  // Re-admission after withdrawal.
  WITHDRAWN: ["ENROLLED"],
  COMPLETED: [],
};

/**
 * The statuses a record in `from` can move to. Completed is final, and only
 * a student in the final year of their programme completes it.
 *
 * @param finalYear - Whether the student is in their programme's last year
 *   of study.
 */
export function allowedStatusChanges(
  from: EnrolmentStatus,
  finalYear: boolean,
): readonly EnrolmentStatus[] {
  return ALLOWED_CHANGES[from].filter(
    (to) => to !== EnrolmentStatus.COMPLETED || finalYear,
  );
}

/** True if a record may move from one status to another. */
export function canChangeStatus(
  from: EnrolmentStatus,
  to: EnrolmentStatus,
  finalYear: boolean,
): boolean {
  return allowedStatusChanges(from, finalYear).includes(to);
}

/** Deferral and withdrawal must be explained; the reason is kept on record. */
export function statusChangeNeedsReason(to: EnrolmentStatus): boolean {
  return to === EnrolmentStatus.DEFERRED || to === EnrolmentStatus.WITHDRAWN;
}

/** Only enrolled students can submit work. */
export function canSubmitWork(status: EnrolmentStatus): boolean {
  return status === EnrolmentStatus.ENROLLED;
}

/** One entry in a student's status history. */
export interface StatusChangeLine {
  toStatus: EnrolmentStatus;
  changedAt: Date;
}

/**
 * A student's status at a moment: the last change made by then, or null if
 * the record didn't exist yet.
 *
 * @param history - The student's status changes, in any order. The first
 *   one is the status the record was created with.
 */
export function statusAt(
  history: readonly StatusChangeLine[],
  at: Date,
): EnrolmentStatus | null {
  let latest: StatusChangeLine | null = null;
  for (const change of history) {
    if (change.changedAt > at) continue;
    if (!latest || change.changedAt >= latest.changedAt) latest = change;
  }
  return latest?.toStatus ?? null;
}
