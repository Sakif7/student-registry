// The curriculum: programmes, the modules they are made of, and the academic
// calendar. A module can be part of several programmes, each placing it in a
// year of study as core (every student takes it) or optional (students
// choose). Each academic year has two semesters, with dates set by staff.
import { z } from "zod";

import { academicYearSpan, startYearOf } from "./academic-year";
import { type CalendarDate, calendarDateSchema } from "./college-time";
import { chargeAmountSchema } from "./money";

export const SEMESTERS = ["FIRST", "SECOND", "ALL_YEAR"] as const;
export type Semester = (typeof SEMESTERS)[number];

export const SEMESTER_LABELS: Record<Semester, string> = {
  FIRST: "Semester 1",
  SECOND: "Semester 2",
  ALL_YEAR: "All year",
};

export const MODULE_KINDS = ["CORE", "OPTIONAL"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

export const MODULE_KIND_LABELS: Record<ModuleKind, string> = {
  CORE: "Core",
  OPTIONAL: "Optional",
};

/** The longest programme, in years of study. */
export const MAX_PROGRAMME_YEARS = 7;

const titleSchema = z
  .string({ error: "Enter a title" })
  .trim()
  .min(1, "Enter a title")
  .max(120, "Use 120 characters or fewer");

/** Credits come in multiples of 5, as in UK credit frameworks. */
function creditsSchema(min: number, max: number) {
  return z
    .number({ error: "Enter the credits" })
    .int("Credits are whole numbers")
    .min(min, `Use at least ${min} credits`)
    .max(max, `Use ${max} credits or fewer`)
    .multipleOf(5, "Credits come in multiples of 5");
}

const programmeCodeSchema = z
  .string({ error: "Enter a code" })
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9-]{1,15}$/,
    "Use 2 to 16 letters, digits or hyphens, starting with a letter, e.g. BSC-CS",
  );

const moduleCodeSchema = z
  .string({ error: "Enter a code" })
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9-]{2,11}$/,
    "Use 3 to 12 letters, digits or hyphens, starting with a letter, e.g. CS4002",
  );

const programmeFields = {
  title: titleSchema,
  annualFeePence: chargeAmountSchema,
  years: z
    .number({ error: "Enter the number of years" })
    .int("Use a whole number of years")
    .min(1, "A programme takes at least 1 year")
    .max(
      MAX_PROGRAMME_YEARS,
      `A programme takes ${MAX_PROGRAMME_YEARS} years at most`,
    ),
  creditsPerYear: creditsSchema(10, 240),
};

/** Input for setting up a programme. Its code can't change afterwards. */
export const createProgrammeSchema = z.object({
  code: programmeCodeSchema,
  ...programmeFields,
});

/** Input for changing a programme: any of its details but the code. */
export const updateProgrammeSchema = z
  .object(programmeFields)
  .partial()
  .refine((input) => Object.values(input).some((v) => v !== undefined), {
    error: "Nothing to update",
  });

const moduleFields = {
  title: titleSchema,
  credits: creditsSchema(5, 120),
  semester: z.enum(SEMESTERS, { error: "Choose when it is taught" }),
};

/** Input for setting up a module. Its code can't change afterwards. */
export const createModuleSchema = z.object({
  code: moduleCodeSchema,
  ...moduleFields,
});

/** Input for changing a module: any of its details but the code. */
export const updateModuleSchema = z
  .object(moduleFields)
  .partial()
  .refine((input) => Object.values(input).some((v) => v !== undefined), {
    error: "Nothing to update",
  });

/** Input for placing a module in a programme's structure. */
export const structureEntrySchema = z.object({
  moduleCode: z
    .string({ error: "Choose a module" })
    .trim()
    .toUpperCase()
    .min(1, "Choose a module"),
  yearOfStudy: z
    .number({ error: "Choose a year of study" })
    .int("Choose a year of study")
    .min(1, "Choose a year of study"),
  kind: z.enum(MODULE_KINDS, { error: "Choose core or optional" }),
});

export type CreateProgrammeInput = z.infer<typeof createProgrammeSchema>;
export type UpdateProgrammeInput = z.infer<typeof updateProgrammeSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type StructureEntryInput = z.infer<typeof structureEntrySchema>;

/** A module's place in a programme, with what it is worth. */
export interface StructureEntry {
  yearOfStudy: number;
  kind: ModuleKind;
  credits: number;
}

/** The credits core modules take up in each year of study. */
export function coreCredits(
  structure: readonly StructureEntry[],
  yearOfStudy: number,
): number {
  return structure
    .filter(
      (entry) => entry.kind === "CORE" && entry.yearOfStudy === yearOfStudy,
    )
    .reduce((total, entry) => total + entry.credits, 0);
}

/**
 * Why a module can't go into a programme's structure, if it can't: a year
 * the programme doesn't have, or core modules adding up to more credits than
 * a year of study carries. Optional modules can offer more than a year
 * carries: students take only some of them.
 *
 * @param structure - The programme's structure without the module.
 */
export function structureEntryProblem(
  programme: { years: number; creditsPerYear: number },
  structure: readonly StructureEntry[],
  entry: StructureEntry,
): string | null {
  if (entry.yearOfStudy > programme.years) {
    return programme.years === 1
      ? "This programme has 1 year of study"
      : `This programme has ${programme.years} years of study`;
  }
  if (entry.kind === "CORE") {
    const total = coreCredits(structure, entry.yearOfStudy) + entry.credits;
    if (total > programme.creditsPerYear) {
      return `Core modules in year ${entry.yearOfStudy} would come to ${total} credits, more than the ${programme.creditsPerYear} a year carries`;
    }
  }
  return null;
}

/**
 * Why a programme's length or credits can't change, if they can't: its
 * structure or its students reach beyond the new length, or its core
 * modules take more credits than the new total.
 *
 * @param highestYearOfStudy - The highest year any of its students is in.
 */
export function programmeChangeProblem(
  change: { years: number; creditsPerYear: number },
  structure: readonly StructureEntry[],
  highestYearOfStudy: number,
): string | null {
  const lastYearWithModules = Math.max(
    0,
    ...structure.map((entry) => entry.yearOfStudy),
  );
  if (lastYearWithModules > change.years) {
    return `Year ${lastYearWithModules} still has modules. Remove them from the structure first.`;
  }
  if (highestYearOfStudy > change.years) {
    return `A student on this programme is in year ${highestYearOfStudy}.`;
  }
  for (let year = 1; year <= change.years; year += 1) {
    const total = coreCredits(structure, year);
    if (total > change.creditsPerYear) {
      return `Core modules in year ${year} come to ${total} credits, more than ${change.creditsPerYear}.`;
    }
  }
  return null;
}

/** The dates of an academic year's two semesters. */
export interface SemesterDates {
  semester1Start: CalendarDate;
  semester1End: CalendarDate;
  semester2Start: CalendarDate;
  semester2End: CalendarDate;
}

/**
 * Input for an academic year's calendar: two semesters, one after the
 * other, inside the academic year (1 September to 31 August), and whether
 * students may choose their own optional modules.
 *
 * @param year - The academic year, e.g. "2026/27".
 */
export function academicYearSettingsSchema(year: string) {
  const { first, last } = academicYearSpan(year);
  const startYear = startYearOf(year);
  return z
    .object({
      semester1Start: calendarDateSchema,
      semester1End: calendarDateSchema,
      semester2Start: calendarDateSchema,
      semester2End: calendarDateSchema,
      studentsChooseModules: z
        .boolean({ error: "Say whether students choose their modules" })
        .default(false),
    })
    .superRefine((dates, ctx) => {
      const problem = (path: keyof SemesterDates, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      if (dates.semester1Start < first) {
        problem(
          "semester1Start",
          `Start on or after 1 September ${startYear}, when ${year} begins`,
        );
      }
      if (dates.semester1End <= dates.semester1Start) {
        problem("semester1End", "End semester 1 after it starts");
      }
      if (dates.semester2Start <= dates.semester1End) {
        problem("semester2Start", "Start semester 2 after semester 1 ends");
      }
      if (dates.semester2End <= dates.semester2Start) {
        problem("semester2End", "End semester 2 after it starts");
      }
      if (dates.semester2End > last) {
        problem(
          "semester2End",
          `End on or before 31 August ${startYear + 1}, when ${year} ends`,
        );
      }
    });
}

export type AcademicYearSettingsInput = z.infer<
  ReturnType<typeof academicYearSettingsSchema>
>;

/** The semester a date falls in: null outside both, e.g. in the summer. */
export function semesterOn(
  date: CalendarDate,
  calendar: SemesterDates,
): "FIRST" | "SECOND" | null {
  if (date >= calendar.semester1Start && date <= calendar.semester1End) {
    return "FIRST";
  }
  if (date >= calendar.semester2Start && date <= calendar.semester2End) {
    return "SECOND";
  }
  return null;
}
