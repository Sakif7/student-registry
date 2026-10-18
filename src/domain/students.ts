// Student records: how their details are validated, and how the list of
// students is filtered. Schemas are shared by the forms and the API.
import { z } from "zod";

import { passwordSchema } from "./accounts";
import {
  academicYearSchema,
  chooseAcademicYearFrom,
  enrolmentYears,
  isAcademicYear,
} from "./academic-year";
import { type CalendarDate, isCalendarDate } from "./college-time";
import { MAX_PROGRAMME_YEARS } from "./curriculum";
import {
  ENROLMENT_STATUSES,
  EnrolmentStatus,
  INITIAL_STATUSES,
  statusChangeNeedsReason,
} from "./enrolment";
import { sortDirectionSchema } from "./sorting";

/** Youngest and oldest plausible ages on the day a record is saved. */
const MIN_AGE = 16;
const MAX_AGE = 100;

/** Students shown per page in the staff list. */
export const STUDENTS_PAGE_SIZE = 20;

// Letters from any alphabet (with accents), spaces, hyphens, apostrophes
// (straight or typographic, as phones type them) and full stops, starting with
// a letter: "Seán Ó Briain", "Mary-Jane O’Neil".
const FULL_NAME = /^\p{L}[\p{L}\p{M}'’ .-]*$/u;

/**
 * Age in completed years on a given day. A birthday counts on the day itself,
 * and a 29 February birthday counts from 1 March in other years.
 */
export function ageOn(dateOfBirth: CalendarDate, today: CalendarDate): number {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = today.split("-").map(Number);
  const hadBirthday =
    month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

const fullNameSchema = z
  .string({ error: "Enter the student's full name" })
  .trim()
  // One form for accented letters: "é" can arrive as one character or as
  // "e" and an accent, and the two must find each other in a search.
  .transform((value) => value.normalize("NFC").replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter the student's full name")
      .min(2, "Enter at least 2 characters")
      .max(120, "Use 120 characters or fewer")
      .regex(
        FULL_NAME,
        "Use letters, spaces, hyphens, apostrophes and full stops only",
      ),
  );

const emailSchema = z
  .string({ error: "Enter an email address" })
  .trim()
  .toLowerCase()
  .min(1, "Enter an email address")
  .pipe(z.email("Enter a valid email address").max(254));

function dateOfBirthSchema(today: CalendarDate) {
  return z
    .string({ error: "Enter a date of birth" })
    .superRefine((value, ctx) => {
      if (value === "") {
        ctx.addIssue({ code: "custom", message: "Enter a date of birth" });
      } else if (!isCalendarDate(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a real date, e.g. 2004-05-17",
        });
      } else if (value >= today) {
        ctx.addIssue({
          code: "custom",
          message: "The date of birth must be in the past",
        });
      } else if (ageOn(value, today) < MIN_AGE) {
        ctx.addIssue({
          code: "custom",
          message: `Students must be at least ${MIN_AGE}`,
        });
      } else if (ageOn(value, today) > MAX_AGE) {
        ctx.addIssue({
          code: "custom",
          message: `Check the year: that makes the student over ${MAX_AGE}`,
        });
      }
    });
}

const programmeCodeSchema = z
  .string({ error: "Choose a programme" })
  .trim()
  .min(1, "Choose a programme")
  .max(32);

/**
 * Which year of the programme the student is in. The programme's length is
 * checked against it when the record is saved. A form's select sends text.
 */
const yearOfStudySchema = z.coerce
  .number({ error: "Choose a year of study" })
  .int("Choose a year of study")
  .min(1, "Choose a year of study")
  .max(MAX_PROGRAMME_YEARS, "Choose a year of study");

function detailsShape(today: CalendarDate) {
  return {
    fullName: fullNameSchema,
    email: emailSchema,
    dateOfBirth: dateOfBirthSchema(today),
    programmeCode: programmeCodeSchema,
    academicYear: academicYearSchema,
    yearOfStudy: yearOfStudySchema,
  };
}

/** A student's editable details, as the edit form submits them in full. */
export function studentDetailsSchema(today: CalendarDate) {
  return z.object(detailsShape(today));
}

/**
 * Input for enrolling a new student; `today` is the college's date. A new
 * student starts in year 1 unless the year of study says otherwise, in last
 * academic year, this one or next.
 */
export function createStudentSchema(today: CalendarDate) {
  const years = enrolmentYears(today);
  return z.object({
    ...detailsShape(today),
    // A malformed year has its own message already.
    academicYear: academicYearSchema.refine(
      (year) => !isAcademicYear(year) || years.includes(year),
      { error: chooseAcademicYearFrom(years) },
    ),
    yearOfStudy: yearOfStudySchema.default(1),
    status: z
      .enum(INITIAL_STATUSES, {
        error: "A new record starts as Enrolled or Deferred",
      })
      .default(EnrolmentStatus.ENROLLED),
    /**
     * The student's first password, set by staff. Without one, the student
     * is emailed an activation link and chooses their own.
     */
    password: passwordSchema.optional(),
  });
}

/** Input for editing a student's details. Status changes are separate. */
export function updateStudentSchema(today: CalendarDate) {
  return z
    .object(detailsShape(today))
    .partial()
    .refine((input) => Object.values(input).some((v) => v !== undefined), {
      error: "Nothing to update",
    });
}

/** Input for moving a student to another status. */
export const changeStatusSchema = z
  .object({
    status: z.enum(ENROLMENT_STATUSES, { error: "Choose a status" }),
    reason: z
      .string()
      .trim()
      .max(500, "Use 500 characters or fewer")
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine(({ status, reason }, ctx) => {
    if (statusChangeNeedsReason(status) && !reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Give a reason for deferral or withdrawal",
      });
    }
  });

/** The columns the student list can be sorted by. */
export const STUDENT_SORTS = [
  "name",
  "id",
  "programme",
  "year",
  "status",
] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

/**
 * Filters for the staff list, read from the URL. Unknown or malformed values
 * are ignored rather than rejected, so a stale link still opens.
 */
export const studentFiltersSchema = z.object({
  // Too long a search or programme is cut short, not dropped: dropping it
  // would list every student, the opposite of what was asked.
  q: z
    .string()
    .trim()
    .optional()
    .catch(undefined)
    .transform((value) => value?.normalize("NFC").slice(0, 100) || undefined),
  programme: z
    .string()
    .trim()
    .optional()
    .catch(undefined)
    .transform((value) => value?.slice(0, 32) || undefined),
  status: z.enum(ENROLMENT_STATUSES).optional().catch(undefined),
  year: academicYearSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  /** By name unless given; an unknown column or direction is ignored. */
  sort: z.enum(STUDENT_SORTS).optional().catch(undefined),
  dir: sortDirectionSchema,
});

export type CreateStudentInput = z.infer<
  ReturnType<typeof createStudentSchema>
>;
export type UpdateStudentInput = z.infer<
  ReturnType<typeof updateStudentSchema>
>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type StudentFilters = z.infer<typeof studentFiltersSchema>;
