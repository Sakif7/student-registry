// Student IDs: "SMS-{intake year}-{sequence}", e.g. SMS-2026-0001. The intake
// year is the start year of the academic year the student first enrols into.

import { formatAcademicYear } from "./academic-year";

const STUDENT_NUMBER = /^SMS-\d{4}-\d{4,}$/;

/**
 * Formats a student ID. The sequence is padded to four digits and simply grows
 * past 9999 rather than failing.
 *
 * @throws RangeError for a year that isn't four digits or a sequence below 1.
 */
export function formatStudentNumber(
  intakeYear: number,
  sequence: number,
): string {
  if (!Number.isInteger(intakeYear) || intakeYear < 1000 || intakeYear > 9999) {
    throw new RangeError(`Invalid intake year: ${intakeYear}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Invalid sequence: ${sequence}`);
  }
  return `SMS-${intakeYear}-${String(sequence).padStart(4, "0")}`;
}

/** True for a well-formed student ID, such as "SMS-2026-0001". */
export function isStudentNumber(value: string): boolean {
  return STUDENT_NUMBER.test(value);
}

/**
 * The intake a student ID records: the academic year the student was first
 * enrolled into, written into the ID when it was issued, e.g. "2023/24" for
 * SMS-2023-0001. An ID never changes, so it stays a record of the intake
 * whatever the student's current year; null for a malformed ID.
 */
export function intakeOf(studentNumber: string): string | null {
  const match = /^SMS-(\d{4})-\d{4,}$/.exec(studentNumber);
  return match ? formatAcademicYear(Number(match[1])) : null;
}
