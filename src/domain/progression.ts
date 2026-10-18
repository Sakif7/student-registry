// Moving students on to a new academic year. A student's academic year and
// year of study are stored, not worked out from the date: whether someone
// moves up depends on their results (a student who fails repeats the year,
// one who finishes completes, one awaiting a resit waits), so staff move
// students on, all of a year's at once, changing anyone who doesn't simply
// go up a year.
import { z } from "zod";

import {
  academicYearFromSlug,
  academicYearOn,
  academicYearSchema,
  academicYearsAround,
  isAcademicYear,
} from "./academic-year";
import type { CalendarDate } from "./college-time";
import { listPageSchema, listSearchSchema } from "./lists";

/** What happens to a student moved on: up a year, repeat it, complete, or wait. */
export const PROGRESSION_STEPS = [
  "next",
  "repeat",
  "complete",
  "leave",
] as const;
export type ProgressionStep = (typeof PROGRESSION_STEPS)[number];

/**
 * The step a student takes unless staff choose another: up a year, or, in
 * the programme's final year, complete it.
 */
export function suggestedStep(
  yearOfStudy: number,
  programmeYears: number,
): "next" | "complete" {
  return yearOfStudy >= programmeYears ? "complete" : "next";
}

/**
 * The steps open to a student: up a year (but not past the programme's
 * last), complete it (only from its last), repeat the year, or leave them
 * for now, e.g. while a resit is decided.
 */
export function stepsFor(
  yearOfStudy: number,
  programmeYears: number,
): ProgressionStep[] {
  return [
    yearOfStudy >= programmeYears ? "complete" : "next",
    "repeat",
    "leave",
  ];
}

/** How a step reads beside a student in year `yearOfStudy`. */
export function stepLabel(step: ProgressionStep, yearOfStudy: number): string {
  switch (step) {
    case "next":
      return `Year ${yearOfStudy + 1}`;
    case "repeat":
      return `Repeat year ${yearOfStudy}`;
    case "complete":
      return "Complete";
    case "leave":
      return "Leave for now";
  }
}

/**
 * The academic years students can be moved on to: this one, for students
 * still in an earlier year, and the next, from 1 August, when exam boards
 * have met and the new year is about to begin.
 */
export function progressionTargets(today: CalendarDate): string[] {
  const [current = "", next = ""] = academicYearsAround(
    academicYearOn(today),
    0,
    1,
  );
  return today.slice(5, 7) === "08" ? [current, next] : [current];
}

/**
 * The progression page as the URL asks for it: the year to move students on
 * to (written 2027-28, as in other addresses), a search, a programme, a year
 * of study, and the page. Anything odd is ignored.
 */
export const progressionQuerySchema = z.object({
  to: z
    .string()
    .transform(academicYearFromSlug)
    .refine(isAcademicYear)
    .optional()
    .catch(undefined),
  q: listSearchSchema,
  programme: z.string().trim().toUpperCase().min(1).optional().catch(undefined),
  year: z.coerce.number().int().min(1).max(10).optional().catch(undefined),
  page: listPageSchema,
});
export type ProgressionQuery = z.infer<typeof progressionQuerySchema>;

/**
 * Moving students on: the year, the same search and filters as the page,
 * which students the page listed for them (its `listed` fingerprint, so a
 * change made in the meantime is caught, even one that leaves the count as
 * it was), and any steps staff changed, by student ID; everyone else takes
 * their suggested step.
 */
export const progressionRequestSchema = z.object({
  to: academicYearSchema,
  q: listSearchSchema,
  programme: z.string().trim().toUpperCase().min(1).optional(),
  year: z.coerce.number().int().min(1).max(10).optional(),
  listed: z
    .string({ error: "Reload the page to see who is to move on" })
    .trim()
    .min(1, "Reload the page to see who is to move on"),
  steps: z
    .record(z.string().trim().toUpperCase(), z.enum(PROGRESSION_STEPS))
    .default({}),
});
export type ProgressionRequest = z.infer<typeof progressionRequestSchema>;
