// The curriculum: programmes, the modules they are made of, and the academic
// calendar. A module can be part of several programmes, each placing it in a
// year of study as core (every student takes it) or optional (students
// choose). Each academic year has two semesters, with dates set by staff.
import { z } from "zod";

import { academicYearSpan, startYearOf } from "./academic-year";
import { type CalendarDate, calendarDateSchema } from "./college-time";
import { listPageSchema, listSearchSchema, matchesSearch } from "./lists";
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
 * the programme doesn't have, core modules adding up to more credits than a
 * year of study carries, or an option worth more than the core modules leave,
 * which no student could ever take. Together, the options can offer more than
 * that: students take only some of them.
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
  const core = coreCredits(structure, entry.yearOfStudy);
  if (entry.kind === "CORE") {
    const total = core + entry.credits;
    if (total > programme.creditsPerYear) {
      return `Core modules in year ${entry.yearOfStudy} would come to ${total} credits, more than the ${programme.creditsPerYear} a year carries`;
    }
    return null;
  }
  const room = programme.creditsPerYear - core;
  if (room <= 0) {
    return `Core modules take all ${programme.creditsPerYear} credits of year ${entry.yearOfStudy}, which leaves no room for options`;
  }
  if (entry.credits > room) {
    return `An option in year ${entry.yearOfStudy} can be worth at most ${room} credits: core modules take ${core} of the ${programme.creditsPerYear} a year carries`;
  }
  return null;
}

/**
 * Whether some of a year's options add up to exactly the credits its core
 * modules leave. If none do (too few, or the wrong sizes), every student in
 * the year stays short, however they choose.
 */
export function optionsCanMakeUp(
  creditsLeft: number,
  optionCredits: readonly number[],
): boolean {
  if (creditsLeft <= 0) return true;
  const reachable = new Set([0]);
  for (const credits of optionCredits) {
    for (const total of [...reachable]) {
      if (total + credits <= creditsLeft) reachable.add(total + credits);
    }
  }
  return reachable.has(creditsLeft);
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

/** The semester dates, in the order a year's calendar runs. */
export const SEMESTER_DATES = [
  "semester1Start",
  "semester1End",
  "semester2Start",
  "semester2End",
] as const satisfies readonly (keyof SemesterDates)[];

/** Each semester date as the audit trail names it. */
export const SEMESTER_DATE_LABELS: Record<keyof SemesterDates, string> = {
  semester1Start: "start of semester 1",
  semester1End: "end of semester 1",
  semester2Start: "start of semester 2",
  semester2End: "end of semester 2",
};

/**
 * What stops a change to a year's semester dates, date by date; empty if
 * nothing does. A date that has passed is history, as students and staff
 * have lived by it, so it can't change, and no date can move into the past.
 * A year set up for the first time may start in the past, as one set up
 * late does.
 *
 * @param saved - The year's dates now, or null if it isn't set up yet.
 */
export function semesterDateProblems(
  saved: SemesterDates | null,
  next: SemesterDates,
  today: CalendarDate,
): Partial<Record<keyof SemesterDates, string>> {
  const problems: Partial<Record<keyof SemesterDates, string>> = {};
  if (saved === null) return problems;
  for (const field of SEMESTER_DATES) {
    if (next[field] === saved[field]) continue;
    if (saved[field] < today) {
      problems[field] = "This date has passed, so it can't change";
    } else if (next[field] < today) {
      problems[field] =
        "Choose today or later: a date can't move into the past";
    }
  }
  return problems;
}

/** A semester date's old and new value, as the audit trail keeps it. */
export type SemesterDateChanges = Partial<
  Record<keyof SemesterDates, { from: CalendarDate; to: CalendarDate }>
>;

/** The semester dates a change moves, or undefined if it moves none. */
export function semesterDateChanges(
  before: SemesterDates,
  after: SemesterDates,
): SemesterDateChanges | undefined {
  const changes: SemesterDateChanges = {};
  for (const field of SEMESTER_DATES) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

/**
 * Letting students choose their own options in a year, or stopping them, on
 * its own: the semester dates stay as they are, whoever changed them last.
 */
export const studentsChooseSchema = z.object({
  studentsChooseModules: z.boolean({
    error: "Say whether students choose their modules",
  }),
});

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

/** The programmes list as the URL asks for it: a search and the page. */
export const programmeListSchema = z.object({
  q: listSearchSchema,
  page: listPageSchema,
});
export type ProgrammeListQuery = z.infer<typeof programmeListSchema>;

/** In the module catalogue's programme filter: the modules in no programme. */
export const NO_PROGRAMME = "none";

/**
 * The module catalogue as the URL asks for it: a search, when modules are
 * taught, the programme they are in (or NO_PROGRAMME), and the page. A
 * programme code is upper case, so "none" can't be one.
 */
export const moduleListSchema = z.object({
  q: listSearchSchema,
  semester: z.enum(SEMESTERS).optional().catch(undefined),
  programme: z
    .string()
    .trim()
    .max(16)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  page: listPageSchema,
});
export type ModuleListQuery = z.infer<typeof moduleListSchema>;

/** Narrows programmes to a search of their codes and titles. */
export function filterProgrammes<
  Programme extends { code: string; title: string },
>(programmes: readonly Programme[], q: string | undefined): Programme[] {
  return programmes.filter((programme) =>
    matchesSearch(q, [programme.code, programme.title]),
  );
}

/**
 * Narrows the module catalogue to a search of codes and titles, when
 * modules are taught, and the programme they are part of (or none).
 */
export function filterModules<
  Module extends {
    code: string;
    title: string;
    semester: Semester;
    programmes: readonly { code: string }[];
  },
>(
  modules: readonly Module[],
  {
    q,
    semester,
    programme,
  }: { q?: string; semester?: Semester; programme?: string },
): Module[] {
  return modules.filter(
    (module) =>
      matchesSearch(q, [module.code, module.title]) &&
      (!semester || module.semester === semester) &&
      (!programme ||
        (programme === NO_PROGRAMME
          ? module.programmes.length === 0
          : module.programmes.some(({ code }) => code === programme))),
  );
}
