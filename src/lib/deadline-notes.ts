// What staff are told about a deadline while they type it: the academic year
// it falls in, so a year typed wrongly shows at once, how many students that
// reaches, and when it falls outside the semester the module is taught in.
import { academicYearOn } from "@/domain/academic-year";
import { isCalendarDate } from "@/domain/college-time";
import {
  type Semester,
  SEMESTER_LABELS,
  type SemesterDates,
  semesterOn,
} from "@/domain/curriculum";

import { formatCount, formatDate } from "./format";

/** Enrolled students registered on modules, in the years counted. */
export interface RegisteredByModule {
  /** This academic year and next. */
  years: string[];
  /** By module code, then year; a module or year missing has none. */
  byModule: Record<string, Record<string, number>>;
}

/** A module's counts in the years counted, nobody registered being 0. */
export function registeredOn(
  registered: RegisteredByModule,
  moduleCode: string,
): Record<string, number> {
  return Object.fromEntries(
    registered.years.map((year) => [
      year,
      registered.byModule[moduleCode]?.[year] ?? 0,
    ]),
  );
}

/**
 * Notes on a deadline being set or moved, as sentences.
 *
 * @param deadline - As the field holds it, e.g. "2026-11-20T17:00"; an
 *   unfinished one has no notes.
 * @param registered - Enrolled students on the module, by academic year; a
 *   year missing from it isn't known.
 * @param calendars - The semester dates of the years that are set up.
 */
export function deadlineNotes(
  deadline: string,
  module: { code: string; semester: Semester },
  registered: Readonly<Record<string, number>>,
  calendars: Readonly<Record<string, SemesterDates>>,
): string[] {
  const date = deadline.slice(0, 10);
  if (!isCalendarDate(date)) return [];
  const year = academicYearOn(date);
  const count = registered[year];
  const notes = [
    count === undefined
      ? `Falls in ${year}.`
      : count === 0
        ? `Falls in ${year}: no student is registered on ${module.code} that year yet.`
        : `Falls in ${year}: ${formatCount(count, "student")} ${count === 1 ? "is" : "are"} registered on ${module.code} that year.`,
  ];
  const calendar = calendars[year];
  if (
    calendar &&
    module.semester !== "ALL_YEAR" &&
    semesterOn(date, calendar) !== module.semester
  ) {
    const [first, last] =
      module.semester === "FIRST"
        ? [calendar.semester1Start, calendar.semester1End]
        : [calendar.semester2Start, calendar.semester2End];
    notes.push(
      `${module.code} is taught in ${SEMESTER_LABELS[module.semester].toLowerCase()}, from ${formatDate(first)} to ${formatDate(last)}.`,
    );
  }
  return notes;
}
