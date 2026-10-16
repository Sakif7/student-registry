// The curriculum, as Registry staff set it up: programmes, the modules in
// each year of a programme (core or optional), the module catalogue, and the
// academic calendar (semester dates, and whether students may choose their
// own optional modules). A module can be part of several programmes.
import "server-only";

import {
  academicYearSettingsSchema,
  coreCredits,
  createModuleSchema,
  createProgrammeSchema,
  type ModuleKind,
  programmeChangeProblem,
  type Semester,
  type SemesterDates,
  structureEntryProblem,
  structureEntrySchema,
  updateModuleSchema,
  updateProgrammeSchema,
} from "@/domain/curriculum";
import { academicYearOn, isAcademicYear } from "@/domain/academic-year";
import { fromDbDate, toDbDate } from "@/domain/college-time";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { requireSession, requireStaff, type Session } from "../session";

/** A programme, as the list of programmes shows it. */
export interface ProgrammeSummary {
  code: string;
  title: string;
  annualFeePence: number;
  years: number;
  creditsPerYear: number;
  /** Students on the programme now enrolled. */
  enrolledCount: number;
  moduleCount: number;
}

/** A module in a programme's structure. */
export interface StructureModule {
  code: string;
  title: string;
  credits: number;
  semester: Semester;
  kind: ModuleKind;
}

/** One year of a programme: its modules, core first, by code. */
export interface StructureYear {
  yearOfStudy: number;
  coreCredits: number;
  /** The credits of the optional modules on offer, of which students take some. */
  optionalCredits: number;
  modules: StructureModule[];
}

/** A programme with its structure, one entry for each year of study. */
export interface ProgrammeDetail extends ProgrammeSummary {
  structure: StructureYear[];
}

/** A module, as the module catalogue shows it. */
export interface ModuleSummary {
  code: string;
  title: string;
  credits: number;
  semester: Semester;
  /** The programmes it is part of, and where. */
  programmes: {
    code: string;
    title: string;
    yearOfStudy: number;
    kind: ModuleKind;
  }[];
  /** Students registered on it for the current academic year. */
  registeredCount: number;
  /** Students have been registered on it, so its credits can't change. */
  creditsLocked: boolean;
}

/** An academic year's calendar. */
export interface AcademicYearCalendar extends SemesterDates {
  year: string;
  studentsChooseModules: boolean;
}

const KIND_ORDER: Record<ModuleKind, number> = { CORE: 0, OPTIONAL: 1 };

/** Every programme, by title (staff only). */
export async function listProgrammeSummaries(
  session: Session | null,
): Promise<ProgrammeSummary[]> {
  requireStaff(session);
  const programmes = await db().programme.findMany({
    include: {
      _count: {
        select: {
          modules: true,
          students: { where: { status: "ENROLLED" } },
        },
      },
    },
    orderBy: { title: "asc" },
  });
  return programmes.map(toSummary);
}

/**
 * A programme with its structure (staff only).
 *
 * @throws AppError: NOT_FOUND.
 */
export async function getProgramme(
  session: Session | null,
  code: string,
): Promise<ProgrammeDetail> {
  requireStaff(session);
  const programme = await db().programme.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      _count: {
        select: {
          modules: true,
          students: { where: { status: "ENROLLED" } },
        },
      },
      modules: { include: { module: true } },
    },
  });
  if (!programme) throw programmeNotFound(code);

  const entries = programme.modules.map(({ module, yearOfStudy, kind }) => ({
    code: module.code,
    title: module.title,
    credits: module.credits,
    semester: module.semester,
    kind,
    yearOfStudy,
  }));
  return {
    ...toSummary(programme),
    structure: Array.from({ length: programme.years }, (_, index) => {
      const yearOfStudy = index + 1;
      const modules = entries
        .filter((entry) => entry.yearOfStudy === yearOfStudy)
        .sort(
          (a, b) =>
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            a.code.localeCompare(b.code),
        );
      return {
        yearOfStudy,
        coreCredits: coreCredits(entries, yearOfStudy),
        optionalCredits: modules
          .filter((entry) => entry.kind === "OPTIONAL")
          .reduce((total, entry) => total + entry.credits, 0),
        modules: modules.map(({ code, title, credits, semester, kind }) => ({
          code,
          title,
          credits,
          semester,
          kind,
        })),
      };
    }),
  };
}

/**
 * Sets up a programme (staff only). Its modules are added afterwards.
 *
 * @throws AppError: VALIDATION; CONFLICT for a code already in use.
 */
export async function createProgramme(
  session: Session | null,
  input: unknown,
): Promise<ProgrammeDetail> {
  const staff = requireStaff(session);
  const details = parseInput(createProgrammeSchema, input);
  try {
    await db().$transaction(async (tx) => {
      await tx.programme.create({ data: details });
      await recordEvent(tx, staff, {
        action: "programme.created",
        details: { code: details.code, title: details.title },
      });
    });
  } catch (error) {
    if (violatedUniqueConstraint(error) === "programmes_code_key") {
      throw new AppError("CONFLICT", "That code is already in use.", {
        code: [`There is already a programme with the code ${details.code}`],
      });
    }
    throw error;
  }
  return getProgramme(session, details.code);
}

/**
 * Changes a programme's title, fee, length or credits (staff only). A new
 * fee applies to charges raised from now on; existing charges keep theirs.
 * The length and credits must still fit the structure and the students.
 *
 * @throws AppError: VALIDATION; NOT_FOUND; CONFLICT when the structure or a
 *   student doesn't fit the new length or credits.
 */
export async function updateProgramme(
  session: Session | null,
  code: string,
  input: unknown,
): Promise<ProgrammeDetail> {
  const staff = requireStaff(session);
  const changes = parseInput(updateProgrammeSchema, input);
  await db().$transaction(async (tx) => {
    const programme = await lockProgramme(tx, code);
    const [entries, highest] = await Promise.all([
      structureOf(tx, programme.id),
      tx.student.aggregate({
        where: { programmeId: programme.id },
        _max: { yearOfStudy: true },
      }),
    ]);
    const problem = programmeChangeProblem(
      {
        years: changes.years ?? programme.years,
        creditsPerYear: changes.creditsPerYear ?? programme.creditsPerYear,
      },
      entries,
      highest._max.yearOfStudy ?? 0,
    );
    if (problem) throw new AppError("CONFLICT", problem);

    const fields = changedFields(programme, changes);
    if (fields.length === 0) return;
    await tx.programme.update({ where: { id: programme.id }, data: changes });
    await recordEvent(tx, staff, {
      action: "programme.edited",
      details: { code: programme.code, fields },
    });
  });
  return getProgramme(session, code);
}

/**
 * Adds a module to a year of a programme, as core or optional (staff only).
 * Students already registered for the year keep their registrations: a new
 * core module reaches each of them when they are next registered, e.g. when
 * their year of study changes.
 *
 * @throws AppError: VALIDATION, including an unknown module or a year the
 *   programme doesn't have; NOT_FOUND; CONFLICT if the module is already
 *   part of the programme, or core modules would take more credits than a
 *   year carries.
 */
export async function addProgrammeModule(
  session: Session | null,
  code: string,
  input: unknown,
): Promise<ProgrammeDetail> {
  const staff = requireStaff(session);
  const entry = parseInput(structureEntrySchema, input);
  await db().$transaction(async (tx) => {
    const programme = await lockProgramme(tx, code);
    const found = await tx.module.findUnique({
      where: { code: entry.moduleCode },
      select: { id: true, code: true, credits: true },
    });
    if (!found) {
      throw new AppError("VALIDATION", "Some fields need correcting.", {
        moduleCode: ["Choose a module from the list"],
      });
    }
    const entries = await structureOf(tx, programme.id);
    if (entries.some((existing) => existing.moduleId === found.id)) {
      throw new AppError(
        "CONFLICT",
        `${found.code} is already part of this programme.`,
      );
    }
    const problem = structureEntryProblem(programme, entries, {
      yearOfStudy: entry.yearOfStudy,
      kind: entry.kind,
      credits: found.credits,
    });
    if (problem) {
      throw entry.yearOfStudy > programme.years
        ? new AppError("VALIDATION", "Some fields need correcting.", {
            yearOfStudy: [problem],
          })
        : new AppError("CONFLICT", `${problem}.`);
    }
    await tx.programmeModule.create({
      data: {
        programmeId: programme.id,
        moduleId: found.id,
        yearOfStudy: entry.yearOfStudy,
        kind: entry.kind,
      },
    });
    await recordEvent(tx, staff, {
      action: "programme.module_added",
      details: {
        code: programme.code,
        moduleCode: found.code,
        yearOfStudy: entry.yearOfStudy,
        kind: entry.kind,
      },
    });
  });
  return getProgramme(session, code);
}

/**
 * Takes a module out of a programme's structure (staff only). Students'
 * registrations stay, with any work: a registration outside the structure is
 * dropped when the student is next registered, unless they have work for it.
 *
 * @throws AppError: NOT_FOUND for an unknown programme, or a module that
 *   isn't part of it.
 */
export async function removeProgrammeModule(
  session: Session | null,
  code: string,
  moduleCode: string,
): Promise<ProgrammeDetail> {
  const staff = requireStaff(session);
  await db().$transaction(async (tx) => {
    const programme = await lockProgramme(tx, code);
    const removed = await tx.programmeModule.deleteMany({
      where: {
        programmeId: programme.id,
        module: { code: moduleCode.toUpperCase() },
      },
    });
    if (removed.count === 0) {
      throw new AppError(
        "NOT_FOUND",
        `${moduleCode.toUpperCase()} isn't part of this programme.`,
      );
    }
    await recordEvent(tx, staff, {
      action: "programme.module_removed",
      details: { code: programme.code, moduleCode: moduleCode.toUpperCase() },
    });
  });
  return getProgramme(session, code);
}

/** Every module, by code (staff only). */
export async function listModuleSummaries(
  session: Session | null,
): Promise<ModuleSummary[]> {
  requireStaff(session);
  const academicYear = academicYearOn(collegeToday());
  const [modules, everRegistered] = await Promise.all([
    db().module.findMany({
      include: {
        programmes: {
          include: { programme: { select: { code: true, title: true } } },
        },
        _count: {
          select: { registrations: { where: { academicYear } } },
        },
      },
      orderBy: { code: "asc" },
    }),
    db().moduleRegistration.groupBy({ by: ["moduleId"] }),
  ]);
  const locked = new Set(everRegistered.map(({ moduleId }) => moduleId));
  return modules.map((module) => ({
    code: module.code,
    title: module.title,
    credits: module.credits,
    semester: module.semester,
    programmes: module.programmes
      .map(({ programme, yearOfStudy, kind }) => ({
        code: programme.code,
        title: programme.title,
        yearOfStudy,
        kind,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    registeredCount: module._count.registrations,
    creditsLocked: locked.has(module.id),
  }));
}

/**
 * Sets up a module (staff only). It joins programmes afterwards.
 *
 * @throws AppError: VALIDATION; CONFLICT for a code already in use.
 */
export async function createModule(
  session: Session | null,
  input: unknown,
): Promise<void> {
  const staff = requireStaff(session);
  const details = parseInput(createModuleSchema, input);
  try {
    await db().$transaction(async (tx) => {
      await tx.module.create({ data: details });
      await recordEvent(tx, staff, {
        action: "module.created",
        details: { code: details.code, title: details.title },
      });
    });
  } catch (error) {
    if (violatedUniqueConstraint(error) === "modules_code_key") {
      throw new AppError("CONFLICT", "That code is already in use.", {
        code: [`There is already a module with the code ${details.code}`],
      });
    }
    throw error;
  }
}

/**
 * Changes a module's title, credits or semester (staff only). Credits can't
 * change once students have been registered on it: their credit totals, and
 * the year's limits, were worked out with the old figure.
 *
 * @throws AppError: VALIDATION; NOT_FOUND; CONFLICT for new credits.
 */
export async function updateModule(
  session: Session | null,
  code: string,
  input: unknown,
): Promise<void> {
  const staff = requireStaff(session);
  const changes = parseInput(updateModuleSchema, input);
  await db().$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<
      {
        id: string;
        code: string;
        title: string;
        credits: number;
        semester: Semester;
      }[]
    >`
      SELECT id, code, title, credits, semester FROM modules
      WHERE code = ${code.toUpperCase()}
      FOR UPDATE`;
    if (!current) throw moduleNotFound(code);

    if (changes.credits !== undefined && changes.credits !== current.credits) {
      const registrations = await tx.moduleRegistration.count({
        where: { moduleId: current.id },
      });
      if (registrations > 0) {
        throw new AppError(
          "CONFLICT",
          "Students are registered on this module, so its credits can't change. Set up a new module instead.",
        );
      }
      await checkCoreCreditsWith(tx, current.id, changes.credits);
    }

    const fields = changedFields(current, changes);
    if (fields.length === 0) return;
    await tx.module.update({ where: { id: current.id }, data: changes });
    await recordEvent(tx, staff, {
      action: "module.edited",
      details: { code: current.code, fields },
    });
  });
}

/** Every academic year's calendar, newest first (staff only). */
export async function listAcademicYears(
  session: Session | null,
): Promise<AcademicYearCalendar[]> {
  requireStaff(session);
  const years = await db().academicYear.findMany({ orderBy: { year: "desc" } });
  return years.map(toCalendar);
}

/**
 * An academic year's calendar, for anyone signed in, or null if staff
 * haven't set it up.
 */
export async function getAcademicYear(
  session: Session | null,
  year: string,
): Promise<AcademicYearCalendar | null> {
  requireSession(session);
  const found = await db().academicYear.findUnique({ where: { year } });
  return found && toCalendar(found);
}

/**
 * Sets up or changes an academic year's calendar (staff only): its semester
 * dates, and whether students may choose their own optional modules.
 *
 * @throws AppError: VALIDATION, including a malformed academic year.
 */
export async function saveAcademicYear(
  session: Session | null,
  year: string,
  input: unknown,
): Promise<AcademicYearCalendar> {
  const staff = requireStaff(session);
  // The years must follow on, as in 2026/27: 2026/28 is no academic year.
  if (!isAcademicYear(year)) {
    throw new AppError("NOT_FOUND", `There is no academic year ${year}.`);
  }
  const settings = parseInput(academicYearSettingsSchema(year), input);
  const data = {
    semester1Start: toDbDate(settings.semester1Start),
    semester1End: toDbDate(settings.semester1End),
    semester2Start: toDbDate(settings.semester2Start),
    semester2End: toDbDate(settings.semester2End),
    studentsChooseModules: settings.studentsChooseModules,
  };
  const saved = await db().$transaction(async (tx) => {
    const existing = await tx.academicYear.findUnique({ where: { year } });
    const row = await tx.academicYear.upsert({
      where: { year },
      create: { year, ...data },
      update: data,
    });
    await recordEvent(tx, staff, {
      action: "academic_year.saved",
      details: {
        year,
        created: existing === null,
        studentsChooseModules: settings.studentsChooseModules,
      },
    });
    return row;
  });
  return toCalendar(saved);
}

/** A programme's structure, with each module's credits. */
async function structureOf(tx: Prisma.TransactionClient, programmeId: string) {
  const entries = await tx.programmeModule.findMany({
    where: { programmeId },
    select: {
      moduleId: true,
      yearOfStudy: true,
      kind: true,
      module: { select: { credits: true } },
    },
  });
  return entries.map(({ module, ...entry }) => ({
    ...entry,
    credits: module.credits,
  }));
}

/**
 * Finds a programme and locks it for the rest of the transaction, so that
 * two changes to its structure can't both pass the credit checks.
 */
async function lockProgramme(tx: Prisma.TransactionClient, code: string) {
  const [programme] = await tx.$queryRaw<
    {
      id: string;
      code: string;
      title: string;
      annual_fee_pence: number;
      years: number;
      credits_per_year: number;
    }[]
  >`
    SELECT id, code, title, annual_fee_pence, years, credits_per_year
    FROM programmes WHERE code = ${code.toUpperCase()}
    FOR UPDATE`;
  if (!programme) throw programmeNotFound(code);
  return {
    id: programme.id,
    code: programme.code,
    title: programme.title,
    annualFeePence: programme.annual_fee_pence,
    years: programme.years,
    creditsPerYear: programme.credits_per_year,
  };
}

/**
 * Refuses new credits for a module that would take a year's core modules
 * over the credits the year carries, in any programme it is core in.
 */
async function checkCoreCreditsWith(
  tx: Prisma.TransactionClient,
  moduleId: string,
  credits: number,
): Promise<void> {
  const places = await tx.programmeModule.findMany({
    where: { moduleId, kind: "CORE" },
    select: { programmeId: true, yearOfStudy: true },
  });
  for (const place of places) {
    const programme = await tx.programme.findUniqueOrThrow({
      where: { id: place.programmeId },
      select: { code: true, creditsPerYear: true },
    });
    const entries = (await structureOf(tx, place.programmeId)).map((entry) =>
      entry.moduleId === moduleId ? { ...entry, credits } : entry,
    );
    const total = coreCredits(entries, place.yearOfStudy);
    if (total > programme.creditsPerYear) {
      throw new AppError(
        "CONFLICT",
        `Core modules in ${programme.code} year ${place.yearOfStudy} would come to ${total} credits, more than the ${programme.creditsPerYear} a year carries.`,
      );
    }
  }
}

/** The names of the fields whose values a change alters. */
function changedFields(
  current: Record<string, unknown>,
  changes: Record<string, unknown>,
): string[] {
  return Object.entries(changes)
    .filter(([field, value]) => value !== undefined && value !== current[field])
    .map(([field]) => field);
}

function toSummary(programme: {
  code: string;
  title: string;
  annualFeePence: number;
  years: number;
  creditsPerYear: number;
  _count: { modules: number; students: number };
}): ProgrammeSummary {
  return {
    code: programme.code,
    title: programme.title,
    annualFeePence: programme.annualFeePence,
    years: programme.years,
    creditsPerYear: programme.creditsPerYear,
    enrolledCount: programme._count.students,
    moduleCount: programme._count.modules,
  };
}

function toCalendar(row: {
  year: string;
  semester1Start: Date;
  semester1End: Date;
  semester2Start: Date;
  semester2End: Date;
  studentsChooseModules: boolean;
}): AcademicYearCalendar {
  return {
    year: row.year,
    semester1Start: fromDbDate(row.semester1Start),
    semester1End: fromDbDate(row.semester1End),
    semester2Start: fromDbDate(row.semester2Start),
    semester2End: fromDbDate(row.semester2End),
    studentsChooseModules: row.studentsChooseModules,
  };
}

function programmeNotFound(code: string): AppError {
  return new AppError(
    "NOT_FOUND",
    `There is no programme with the code ${code.toUpperCase()}.`,
  );
}

function moduleNotFound(code: string): AppError {
  return new AppError(
    "NOT_FOUND",
    `There is no module with the code ${code.toUpperCase()}.`,
  );
}
