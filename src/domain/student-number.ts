// Student IDs: "SMS-{intake year}-{sequence}", e.g. SMS-2026-0001. The intake
// year is the start year of the academic year the student first enrols into.

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
