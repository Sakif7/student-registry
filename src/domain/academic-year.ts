// Academic years, written the UK way: "2026/27" runs from 1 September 2026 to
// 31 August 2027.
import { z } from "zod";

import { addDays, type CalendarDate, instantToWallTime } from "./college-time";

const ACADEMIC_YEAR = /^(\d{4})\/(\d{2})$/;

/** Month (1-12) in which a new academic year starts. */
export const ACADEMIC_YEAR_START_MONTH = 9;

/**
 * The start year of an academic year, e.g. 2026 for "2026/27".
 *
 * @returns null if the value is malformed or the two years aren't consecutive.
 */
export function academicYearStart(value: string): number | null {
  const match = ACADEMIC_YEAR.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === (start + 1) % 100 ? start : null;
}

/**
 * The start year of an academic year already known to be valid.
 *
 * @throws RangeError if the value is not a well-formed academic year.
 */
export function startYearOf(academicYear: string): number {
  const start = academicYearStart(academicYear);
  if (start === null) {
    throw new RangeError(`Not an academic year: "${academicYear}"`);
  }
  return start;
}

/** True for a well-formed academic year such as "2026/27". */
export function isAcademicYear(value: string): boolean {
  return academicYearStart(value) !== null;
}

/** Writes the academic year starting in `startYear`, e.g. 2026 → "2026/27". */
export function formatAcademicYear(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * The first and last days of an academic year, e.g. "2026/27" runs from
 * "2026-09-01" to "2027-08-31".
 *
 * @throws RangeError if the value is not a well-formed academic year.
 */
export function academicYearSpan(academicYear: string): {
  first: CalendarDate;
  last: CalendarDate;
} {
  const start = startYearOf(academicYear);
  const month = String(ACADEMIC_YEAR_START_MONTH).padStart(2, "0");
  const first = `${start}-${month}-01`;
  return { first, last: addDays(`${start + 1}-${month}-01`, -1) };
}

/**
 * The academic year an instant falls in, by the calendar of the given time
 * zone: an assessment belongs to the year of its deadline.
 */
export function academicYearAt(instant: Date, timeZone: string): string {
  return academicYearOn(instantToWallTime(instant, timeZone).slice(0, 10));
}

/** The academic year a calendar date falls in. */
export function academicYearOn(date: CalendarDate): string {
  const [year, month] = date.split("-").map(Number);
  return formatAcademicYear(
    month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1,
  );
}

/**
 * Consecutive academic years around a given one, oldest first, e.g. for a
 * select list.
 *
 * @param around - The academic year in the middle of the range.
 * @param before - How many earlier years to include.
 * @param after - How many later years to include.
 */
export function academicYearsAround(
  around: string,
  before: number,
  after: number,
): string[] {
  const start = academicYearStart(around);
  if (start === null) throw new RangeError(`Not an academic year: "${around}"`);
  return Array.from({ length: before + after + 1 }, (_, i) =>
    formatAcademicYear(start - before + i),
  );
}

/** Validates an academic year typed or chosen by a person. */
export const academicYearSchema = z
  .string({ error: "Choose an academic year" })
  .trim()
  .refine(isAcademicYear, {
    error: "Use the format 2026/27, with consecutive years",
  });

/** An academic year as a web address shows it: "2026/27" → "2026-27". */
export function academicYearSlug(academicYear: string): string {
  return academicYear.replace("/", "-");
}

/** The academic year a web address names: "2026-27" → "2026/27". */
export function academicYearFromSlug(slug: string): string {
  return slug.replace("-", "/");
}
