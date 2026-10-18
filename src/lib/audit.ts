// Sentences for the audit trail's events, such as "Recorded a payment of
// £500.00 (BACS 0042)". Who did it and when are shown beside them.
import {
  type AuditAction,
  type AuditDetails,
  MODULE_FIELD_LABELS,
  PROGRAMME_FIELD_LABELS,
  STUDENT_FIELD_LABELS,
} from "@/domain/audit";
import {
  MODULE_KIND_LABELS,
  SEMESTER_DATE_LABELS,
  SEMESTER_DATES,
} from "@/domain/curriculum";
import { ENROLMENT_STATUS_LABELS } from "@/domain/enrolment";

import { formatDate, formatMoney } from "./format";

type Describe = {
  [Action in AuditAction]: (details: AuditDetails[Action]) => string;
};

const DESCRIBE: Describe = {
  "student.enrolled": ({ studentNumber, status }) =>
    `Enrolled as ${studentNumber}, ${ENROLMENT_STATUS_LABELS[status]}`,
  "student.edited": ({ fields, changes }) => {
    const what = [
      changes?.programmeCode &&
        `programme from ${changes.programmeCode.from} to ${changes.programmeCode.to}`,
      changes?.yearOfStudy &&
        `year ${changes.yearOfStudy.from} to year ${changes.yearOfStudy.to}`,
      changes?.academicYear &&
        `${changes.academicYear.from} to ${changes.academicYear.to}`,
    ].filter(Boolean);
    return `Edited the ${list(fields.map((field) => STUDENT_FIELD_LABELS[field] ?? field))}${what.length > 0 ? `: ${what.join("; ")}` : ""}`;
  },
  "student.status_changed": ({ from, to, reason }) =>
    `Changed the status from ${ENROLMENT_STATUS_LABELS[from]} to ${ENROLMENT_STATUS_LABELS[to]}${reason ? `: ${reason}` : ""}`,
  "fee.charged": ({ academicYear, amountPence }) =>
    `Charged the ${academicYear} fee of ${formatMoney(amountPence)}`,
  "fee.corrected": ({ academicYear, amountPence, dueDate, from, note }) =>
    `Corrected the ${academicYear} fee ${from ? `from ${formatMoney(from.amountPence)}, due ${formatDate(from.dueDate)}, ` : ""}to ${formatMoney(amountPence)}, due ${formatDate(dueDate)}${note ? `: ${note}` : ""}`,
  "payment.recorded": ({ amountPence, reference }) =>
    `Recorded a payment of ${formatMoney(amountPence)} (${reference})`,
  "payment.reversed": ({ amountPence, reference, reason }) =>
    `Reversed the payment of ${formatMoney(amountPence)} (${reference}): ${reason}`,
  "assessment.set": ({ title, moduleCode }) =>
    `Set the assessment “${title}” for ${moduleCode}`,
  "assessment.edited": ({ title, changes }) => {
    const what = [
      changes?.title && `renamed from “${changes.title.from}”`,
      changes?.deadline &&
        `deadline moved from ${formatWallTime(changes.deadline.from)} to ${formatWallTime(changes.deadline.to)}`,
    ].filter(Boolean);
    return `Edited the assessment “${title}”${what.length > 0 ? `: ${what.join("; ")}` : ""}`;
  },
  "assessment.closed": ({ title }) => `Closed “${title}” to submissions`,
  "assessment.reopened": ({ title }) => `Reopened “${title}” to submissions`,
  "mark.saved": ({ title, from, to }) =>
    to === null
      ? `Removed the mark of ${from ?? "?"} for “${title}”`
      : from === null
        ? `Entered a mark of ${to} for “${title}”`
        : `Changed the mark for “${title}” from ${from} to ${to}`,
  "results.published": ({ marks, title }) =>
    `Published ${marks} ${marks === 1 ? "mark" : "marks"}${title ? ` for “${title}”` : ""}`,
  "results.withheld": ({ reason }) => `Withheld the results: ${reason}`,
  "results.hold_lifted": () => "Lifted the hold on the results",
  "work.submitted": ({ title, fileName, late, attempt }) =>
    `${attempt > 1 ? "Replaced the work for" : "Submitted work for"} “${title}”: ${fileName}${late ? ", late" : ""}`,
  "sign_in.link_sent": ({ kind }) =>
    kind === "activation"
      ? "Emailed a link to activate the account"
      : "Emailed a password reset link",
  "sign_in.password_set": () => "Set a password for the account",
  "sign_in.turned_off": () => "Turned sign-in off",
  "sign_in.turned_on": () => "Turned sign-in back on",
  "programme.created": ({ code, title }) =>
    `Set up the programme ${code} ${title}`,
  "programme.edited": ({ code, fields }) =>
    `Edited ${code}’s ${list(fields.map((field) => PROGRAMME_FIELD_LABELS[field] ?? field))}`,
  "programme.module_added": ({ code, moduleCode, yearOfStudy, kind }) =>
    `Added ${moduleCode} to ${code}, year ${yearOfStudy}, as ${MODULE_KIND_LABELS[kind].toLowerCase()}`,
  "programme.module_removed": ({ code, moduleCode }) =>
    `Removed ${moduleCode} from ${code}`,
  "module.created": ({ code, title }) => `Set up the module ${code} ${title}`,
  "module.edited": ({ code, fields }) =>
    `Edited ${code}’s ${list(fields.map((field) => MODULE_FIELD_LABELS[field] ?? field))}`,
  "academic_year.saved": ({
    year,
    created,
    studentsChooseModules,
    changes,
  }) => {
    const moved = SEMESTER_DATES.flatMap((field) => {
      const change = changes?.[field];
      return change
        ? [
            `the ${SEMESTER_DATE_LABELS[field]} from ${formatDate(change.from)} to ${formatDate(change.to)}`,
          ]
        : [];
    });
    return `${created ? "Set up" : "Changed"} ${year}’s semesters${moved.length > 0 ? `, moving ${list(moved)}` : ""}; students ${studentsChooseModules ? "may" : "may not"} choose their optional modules`;
  },
  "academic_year.choosing_changed": ({ year, studentsChooseModules }) =>
    studentsChooseModules
      ? `Let students choose their optional modules for ${year}`
      : `Stopped students choosing their optional modules for ${year}`,
  "registration.added": ({ moduleCode, moduleTitle, academicYear }) =>
    `Registered on ${moduleCode} ${moduleTitle} for ${academicYear}`,
  "registration.dropped": ({ moduleCode, moduleTitle, academicYear }) =>
    `Dropped ${moduleCode} ${moduleTitle} for ${academicYear}`,
  "registration.ended": ({ moduleCode, moduleTitle, academicYear }) =>
    `Ended ${moduleCode} ${moduleTitle} for ${academicYear}, keeping its work`,
};

/** Every kind of event the trail records. */
export const AUDIT_ACTIONS = Object.keys(DESCRIBE) as AuditAction[];

/**
 * A sentence for an event, given its action and details as stored. An
 * action this version doesn't know is shown as it is.
 */
export function describeEvent(action: string, details: unknown): string {
  if (!(action in DESCRIBE)) return action;
  const describe = DESCRIBE[action as AuditAction] as (
    details: unknown,
  ) => string;
  return describe(details);
}

/** A college wall time, "2026-10-30T17:00", as "30 Oct 2026, 17:00". */
function formatWallTime(wallTime: string): string {
  return `${formatDate(wallTime.slice(0, 10))}, ${wallTime.slice(11, 16)}`;
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
