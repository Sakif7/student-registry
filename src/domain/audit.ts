// The audit trail's events: every kind of change the app records, with the
// details each keeps so that it can still be described later, whatever has
// changed since. src/lib/audit.ts turns them into sentences.
import { z } from "zod";

import type { CalendarDate } from "./college-time";
import type { ModuleKind } from "./curriculum";
import type { EnrolmentStatus } from "./enrolment";

/** The details each kind of event records. */
export interface AuditDetails {
  "student.enrolled": { studentNumber: string; status: EnrolmentStatus };
  /** Which details changed, by field name (see STUDENT_FIELD_LABELS). */
  "student.edited": { fields: string[] };
  "student.status_changed": {
    from: EnrolmentStatus;
    to: EnrolmentStatus;
    reason: string | null;
  };
  "fee.charged": { academicYear: string; amountPence: number };
  /** The charge as corrected, what it was before, and the note on it. */
  "fee.corrected": {
    academicYear: string;
    amountPence: number;
    dueDate: CalendarDate;
    /** Missing from events recorded before it was kept. */
    from?: { amountPence: number; dueDate: CalendarDate };
    note?: string | null;
  };
  "payment.recorded": { amountPence: number; reference: string };
  "payment.reversed": {
    amountPence: number;
    reference: string;
    reason: string;
  };
  "assessment.set": { assessmentId: string; title: string; moduleCode: string };
  /**
   * What changed, deadlines as college wall times ("2026-10-30T17:00").
   * Missing from events recorded before it was kept.
   */
  "assessment.edited": {
    assessmentId: string;
    title: string;
    changes?: {
      title?: { from: string; to: string };
      deadline?: { from: string; to: string };
    };
  };
  "assessment.closed": { assessmentId: string; title: string };
  "assessment.reopened": { assessmentId: string; title: string };
  /** A mark entered, changed (from a previous one) or removed (to null). */
  "mark.saved": {
    assessmentId: string;
    title: string;
    from: number | null;
    to: number | null;
  };
  "results.published": { marks: number };
  "results.withheld": { reason: string };
  "results.hold_lifted": Record<string, never>;
  "work.submitted": {
    assessmentId: string;
    title: string;
    fileName: string;
    late: boolean;
    /** 1 for the first upload, 2 for the first replacement, and so on. */
    attempt: number;
  };
  "sign_in.link_sent": { kind: "activation" | "reset" };
  /** Staff set the student's first password at enrolment, instead. */
  "sign_in.password_set": Record<string, never>;
  "sign_in.turned_off": Record<string, never>;
  "sign_in.turned_on": Record<string, never>;
  "programme.created": { code: string; title: string };
  /** Which details changed, by field name (see PROGRAMME_FIELD_LABELS). */
  "programme.edited": { code: string; fields: string[] };
  "programme.module_added": {
    code: string;
    moduleCode: string;
    yearOfStudy: number;
    kind: ModuleKind;
  };
  "programme.module_removed": { code: string; moduleCode: string };
  "module.created": { code: string; title: string };
  /** Which details changed, by field name (see MODULE_FIELD_LABELS). */
  "module.edited": { code: string; fields: string[] };
  /** An academic year's calendar set up (created) or changed. */
  "academic_year.saved": {
    year: string;
    created: boolean;
    studentsChooseModules: boolean;
  };
  /** Students let choose their own options in a year, or stopped. */
  "academic_year.choosing_changed": {
    year: string;
    studentsChooseModules: boolean;
  };
  "registration.added": {
    moduleCode: string;
    moduleTitle: string;
    academicYear: string;
  };
  "registration.dropped": {
    moduleCode: string;
    moduleTitle: string;
    academicYear: string;
  };
}

export type AuditAction = keyof AuditDetails;

/** An event to record: what happened, and the student it concerns. */
export type AuditEventInput = {
  [Action in AuditAction]: {
    action: Action;
    details: AuditDetails[Action];
    /** The student's internal ID, if the event concerns a student. */
    studentId?: string;
  };
}[AuditAction];

/** A student's details, by field name, as the edit event lists them. */
export const STUDENT_FIELD_LABELS: Record<string, string> = {
  fullName: "name",
  email: "email address",
  dateOfBirth: "date of birth",
  programmeCode: "programme",
  academicYear: "academic year",
  yearOfStudy: "year of study",
};

/** A programme's details, by field name, as the edit event lists them. */
export const PROGRAMME_FIELD_LABELS: Record<string, string> = {
  title: "title",
  annualFeePence: "annual fee",
  years: "length",
  creditsPerYear: "credits per year",
};

/** A module's details, by field name, as the edit event lists them. */
export const MODULE_FIELD_LABELS: Record<string, string> = {
  title: "title",
  credits: "credits",
  semester: "semester",
};

/** Events shown per page of the staff activity log. */
export const ACTIVITY_PAGE_SIZE = 50;

/** The activity log's query: which page. Anything odd shows the first. */
export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
