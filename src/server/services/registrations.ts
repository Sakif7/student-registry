// Module registration: which modules each student takes in an academic year.
// Core modules are registered automatically (see syncRegistrations); staff
// add and drop optional ones, and so may the student while their academic
// year lets students choose. Only an enrolled student's modules change, and
// a registration with work stays on the record.
import "server-only";

import { academicYearAt, academicYearEnded } from "@/domain/academic-year";
import type { ModuleKind, Semester } from "@/domain/curriculum";
import type { EnrolmentStatus } from "@/domain/enrolment";
import {
  checkDrop,
  checkRegistration,
  DROP_REFUSAL_MESSAGES,
  DROP_REFUSED_WITHOUT_REASON,
  type DropRefusal,
  type Registered,
  registeredCredits,
  registrationChanges,
  registrationRefusalMessage,
} from "@/domain/registration";
import { isVisibleToStudent } from "@/domain/results";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { recordEvent } from "../audit";
import { collegeTimeZone, collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { requireStaffOrSelf, type Session } from "../session";

import { type AcademicYearCalendar, getAcademicYear } from "./curriculum";

/** Whether something may be done, and if not, why. */
export type Permission =
  { allowed: true } | { allowed: false; message: string };

/** A module a student is registered on this academic year. */
export interface StudentModule {
  code: string;
  title: string;
  credits: number;
  semester: Semester;
  /** Its place in the student's year, or null if it has none any more. */
  kind: ModuleKind | null;
  /** The student has submitted work, or has a mark, for it this year. */
  hasWork: boolean;
  /** Whether the viewer may drop it, and if not, why. */
  drop: Permission;
}

/** An optional module of the student's year they aren't registered on. */
export interface ModuleOption {
  code: string;
  title: string;
  credits: number;
  semester: Semester;
  /** Whether it fits the credits left this year. */
  fits: boolean;
}

/** A student's modules: this academic year's, and earlier years'. */
export interface StudentModules {
  studentNumber: string;
  academicYear: string;
  yearOfStudy: number;
  status: EnrolmentStatus;
  programme: { code: string; title: string };
  creditsPerYear: number;
  registeredCredits: number;
  /** By semester, then code. */
  registered: StudentModule[];
  options: ModuleOption[];
  /** The academic year's semesters, if staff have set them up. */
  calendar: AcademicYearCalendar | null;
  /** Whether the viewer may add and drop optional modules now, and if not, why. */
  changes: Permission;
  /** Earlier years' registrations, newest first. */
  history: {
    academicYear: string;
    modules: { code: string; title: string; credits: number }[];
  }[];
}

const CHOOSING_CLOSED =
  "Choosing modules isn't open just now. Contact the Registry to change your modules.";

/**
 * Why the modules of a year that has ended can't change: they are history,
 * with its work and marks. A student still in such a year is moved on first.
 */
function yearEnded(role: Session["role"], academicYear: string): string {
  return role === "student"
    ? `${academicYear} has ended, so your modules for it stay as they are.`
    : `${academicYear} has ended, so the student's modules for it stay as they are. Move the student on to a new academic year first.`;
}

const SEMESTER_ORDER: Record<Semester, number> = {
  FIRST: 0,
  SECOND: 1,
  ALL_YEAR: 2,
};

const moduleInput = z.object({
  moduleCode: z
    .string({ error: "Choose a module" })
    .trim()
    .toUpperCase()
    .min(1, "Choose a module"),
});

/**
 * A student's modules, for staff or the student themselves.
 *
 * @throws AppError: NOT_FOUND; UNAUTHENTICATED or FORBIDDEN.
 */
export async function getStudentModules(
  session: Session | null,
  studentNumber: string,
): Promise<StudentModules> {
  const number = studentNumber.toUpperCase();
  const viewer = requireStaffOrSelf(session, number);
  const student = await findStudent(db(), number);
  const [calendar, registrations, structure, work] = await Promise.all([
    getAcademicYear(session, student.academicYear),
    db().moduleRegistration.findMany({
      where: { studentId: student.id },
      include: { module: true },
    }),
    structureFor(db(), student),
    modulesWithWork(db(), student, student.academicYear),
  ]);
  const own = viewer.role === "student";
  const kinds = new Map(structure.map((entry) => [entry.moduleId, entry.kind]));
  const changes = changesFor(viewer.role, student, calendar);

  const current = registrations.filter(
    (registration) => registration.academicYear === student.academicYear,
  );
  const credits = registeredCredits(
    current.map(({ module }) => ({ credits: module.credits })),
  );
  const registered = current
    .map(({ module }): StudentModule => {
      const kind = kinds.get(module.id) ?? null;
      const verdict = checkDrop({
        status: student.status,
        kind,
        hasWork: work.all.has(module.id),
        wasDue: work.due.has(module.id),
      });
      return {
        code: module.code,
        title: module.title,
        credits: module.credits,
        semester: module.semester,
        kind,
        hasWork: (own ? work.known : work.all).has(module.id),
        drop: !changes.allowed
          ? changes
          : verdict.allowed
            ? verdict
            : {
                allowed: false,
                message: dropRefusal(verdict.reason, own, work, module.id),
              },
      };
    })
    .sort(bySemesterThenCode);
  const registeredIds = new Set(current.map(({ moduleId }) => moduleId));
  const options = structure
    .filter(
      (entry) =>
        entry.kind === "OPTIONAL" && !registeredIds.has(entry.moduleId),
    )
    .map(({ module }) => ({
      code: module.code,
      title: module.title,
      credits: module.credits,
      semester: module.semester,
      fits: credits + module.credits <= student.programme.creditsPerYear,
    }))
    .sort(bySemesterThenCode);

  const earlier = new Map<
    string,
    StudentModules["history"][number]["modules"]
  >();
  for (const { academicYear, module } of registrations) {
    if (academicYear === student.academicYear) continue;
    const list = earlier.get(academicYear) ?? [];
    list.push({
      code: module.code,
      title: module.title,
      credits: module.credits,
    });
    earlier.set(academicYear, list);
  }

  return {
    studentNumber: student.studentNumber,
    academicYear: student.academicYear,
    yearOfStudy: student.yearOfStudy,
    status: student.status,
    programme: { code: student.programme.code, title: student.programme.title },
    creditsPerYear: student.programme.creditsPerYear,
    registeredCredits: credits,
    registered,
    options,
    calendar,
    changes,
    history: [...earlier]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([academicYear, modules]) => ({
        academicYear,
        modules: modules.sort((a, b) => a.code.localeCompare(b.code)),
      })),
  };
}

/**
 * Registers a student on a module for their current academic year: staff
 * for any module of the student's year, the student themselves for an
 * optional one while their academic year lets students choose. The year's
 * credits can't be exceeded.
 *
 * @throws AppError: VALIDATION for an unknown module; NOT_FOUND; FORBIDDEN
 *   for a student while choosing is closed, or for a core module; CONFLICT
 *   for a module outside the student's year, one already registered, one
 *   that doesn't fit the year's credits, or an academic year that has ended.
 */
export async function registerOnModule(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<StudentModules> {
  const number = studentNumber.toUpperCase();
  const viewer = requireStaffOrSelf(session, number);
  const { moduleCode } = parseInput(moduleInput, input);

  await db().$transaction(async (tx) => {
    const student = await lockStudent(tx, number);
    const found = await tx.module.findUnique({ where: { code: moduleCode } });
    if (!found) {
      throw new AppError("VALIDATION", "Some fields need correcting.", {
        moduleCode: ["Choose a module from the list"],
      });
    }
    const structure = await structureFor(tx, student);
    const kind =
      structure.find((entry) => entry.moduleId === found.id)?.kind ?? null;
    requireYearOpen(viewer.role, student.academicYear);
    if (viewer.role === "student") {
      await requireChoosing(tx, student.academicYear);
      if (kind === "CORE") {
        throw new AppError("FORBIDDEN", "Core modules are registered for you.");
      }
    }
    const current = await tx.moduleRegistration.findMany({
      where: { studentId: student.id, academicYear: student.academicYear },
      select: { moduleId: true, module: { select: { credits: true } } },
    });
    const credits = registeredCredits(
      current.map(({ module: registered }) => registered),
    );
    const verdict = checkRegistration({
      status: student.status,
      kind,
      alreadyRegistered: current.some((entry) => entry.moduleId === found.id),
      registeredCredits: credits,
      moduleCredits: found.credits,
      creditsPerYear: student.programme.creditsPerYear,
    });
    if (!verdict.allowed) {
      throw new AppError(
        "CONFLICT",
        registrationRefusalMessage(verdict.reason, {
          registered: credits,
          module: found.credits,
          perYear: student.programme.creditsPerYear,
        }),
      );
    }

    await tx.moduleRegistration.create({
      data: {
        studentId: student.id,
        moduleId: found.id,
        academicYear: student.academicYear,
      },
    });
    await recordEvent(tx, viewer, {
      action: "registration.added",
      studentId: student.id,
      details: {
        moduleCode: found.code,
        moduleTitle: found.title,
        academicYear: student.academicYear,
      },
    });
  });
  return getStudentModules(session, number);
}

/**
 * Drops a module from a student's current academic year: staff, or the
 * student themselves while their academic year lets students choose. Core
 * modules, modules with work, and the modules of a student who isn't
 * enrolled stay.
 *
 * @throws AppError: NOT_FOUND for a module the student isn't registered on;
 *   FORBIDDEN for a student while choosing is closed; CONFLICT for a student
 *   who isn't enrolled, an academic year that has ended, a core module or
 *   one with work.
 */
export async function dropModule(
  session: Session | null,
  studentNumber: string,
  moduleCode: string,
): Promise<StudentModules> {
  const number = studentNumber.toUpperCase();
  const viewer = requireStaffOrSelf(session, number);
  const code = moduleCode.toUpperCase();

  await db().$transaction(async (tx) => {
    const student = await lockStudent(tx, number);
    requireYearOpen(viewer.role, student.academicYear);
    if (viewer.role === "student") {
      await requireChoosing(tx, student.academicYear);
    }
    const registration = await tx.moduleRegistration.findFirst({
      where: {
        studentId: student.id,
        academicYear: student.academicYear,
        module: { code },
      },
      include: { module: true },
    });
    if (!registration) {
      throw new AppError(
        "NOT_FOUND",
        `Not registered on ${code} this academic year.`,
      );
    }
    const structure = await structureFor(tx, student);
    const work = await modulesWithWork(tx, student, student.academicYear);
    const verdict = checkDrop({
      status: student.status,
      kind:
        structure.find((entry) => entry.moduleId === registration.moduleId)
          ?.kind ?? null,
      hasWork: work.all.has(registration.moduleId),
      wasDue: work.due.has(registration.moduleId),
    });
    if (!verdict.allowed) {
      throw new AppError(
        "CONFLICT",
        dropRefusal(
          verdict.reason,
          viewer.role === "student",
          work,
          registration.moduleId,
        ),
      );
    }

    await tx.moduleRegistration.delete({ where: { id: registration.id } });
    await recordEvent(tx, viewer, {
      action: "registration.dropped",
      studentId: student.id,
      details: {
        moduleCode: registration.module.code,
        moduleTitle: registration.module.title,
        academicYear: student.academicYear,
      },
    });
  });
  return getStudentModules(session, number);
}

/**
 * Registers an enrolled student for their programme and year of study, in
 * the caller's transaction: the core modules they lack are added, and
 * modules from outside the year are dropped unless the student has work for
 * them. Optional modules in the year stay as they are. Called when a
 * student is enrolled, returns to Enrolled, or moves programme or year.
 * An academic year that has ended keeps the modules it had: they are
 * history, with its work and marks.
 *
 * @param actor - Whoever made the change that calls for it.
 */
export async function syncRegistrations(
  tx: Prisma.TransactionClient,
  actor: Session,
  studentId: string,
): Promise<void> {
  const student = await tx.student.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      id: true,
      status: true,
      programmeId: true,
      yearOfStudy: true,
      academicYear: true,
      resultsWithheldAt: true,
    },
  });
  if (student.status !== "ENROLLED") return;
  if (!academicYearEnded(student.academicYear, collegeToday())) {
    await syncYear(tx, actor, student);
  }
  await dropLaterYears(tx, actor, student);
}

type StudentToSync = {
  id: string;
  programmeId: string;
  yearOfStudy: number;
  academicYear: string;
  resultsWithheldAt: Date | null;
};

/** Adds the year's missing core modules, and drops those outside it. */
async function syncYear(
  tx: Prisma.TransactionClient,
  actor: Session,
  student: StudentToSync,
): Promise<void> {
  const [structure, current, work] = await Promise.all([
    structureFor(tx, student),
    tx.moduleRegistration.findMany({
      where: { studentId: student.id, academicYear: student.academicYear },
      include: { module: true },
    }),
    modulesWithWork(tx, student, student.academicYear),
  ]);
  const registered: Registered[] = current.map(({ module }) => ({
    moduleId: module.id,
    credits: module.credits,
    hasWork: work.all.has(module.id) || work.due.has(module.id),
  }));
  const { add, drop } = registrationChanges(structure, registered);
  const modules = new Map(
    [
      ...structure.map((entry) => entry.module),
      ...current.map((entry) => entry.module),
    ].map((module) => [module.id, module]),
  );

  for (const moduleId of drop) {
    await tx.moduleRegistration.deleteMany({
      where: {
        studentId: student.id,
        moduleId,
        academicYear: student.academicYear,
      },
    });
    await recordRegistrationEvent(tx, actor, "registration.dropped", {
      studentId: student.id,
      module: modules.get(moduleId),
      academicYear: student.academicYear,
    });
  }
  for (const moduleId of add) {
    await tx.moduleRegistration.create({
      data: {
        studentId: student.id,
        moduleId,
        academicYear: student.academicYear,
      },
    });
    await recordRegistrationEvent(tx, actor, "registration.added", {
      studentId: student.id,
      module: modules.get(moduleId),
      academicYear: student.academicYear,
    });
  }
}

/**
 * Registrations in a later academic year than the student's can only come
 * from moving the student forward and back again. They go, unless the
 * student has work in them: otherwise they would show as an earlier year,
 * and make the student expected for that year's assessments.
 */
async function dropLaterYears(
  tx: Prisma.TransactionClient,
  actor: Session,
  student: StudentToSync,
): Promise<void> {
  const later = await tx.moduleRegistration.findMany({
    // Academic years are written YYYY/YY, so their text sorts in order.
    where: {
      studentId: student.id,
      academicYear: { gt: student.academicYear },
    },
    include: { module: true },
  });
  for (const year of new Set(later.map(({ academicYear }) => academicYear))) {
    const work = await modulesWithWork(tx, student, year);
    for (const registration of later) {
      if (registration.academicYear !== year) continue;
      if (
        work.all.has(registration.moduleId) ||
        work.due.has(registration.moduleId)
      ) {
        continue;
      }
      await tx.moduleRegistration.delete({ where: { id: registration.id } });
      await recordRegistrationEvent(tx, actor, "registration.dropped", {
        studentId: student.id,
        module: registration.module,
        academicYear: year,
      });
    }
  }
}

async function recordRegistrationEvent(
  tx: Prisma.TransactionClient,
  actor: Session,
  action: "registration.added" | "registration.dropped",
  event: {
    studentId: string;
    module: { code: string; title: string } | undefined;
    academicYear: string;
  },
): Promise<void> {
  if (!event.module) return;
  await recordEvent(tx, actor, {
    action,
    studentId: event.studentId,
    details: {
      moduleCode: event.module.code,
      moduleTitle: event.module.title,
      academicYear: event.academicYear,
    },
  });
}

type Client = Prisma.TransactionClient | ReturnType<typeof db>;

/** The modules of a student's programme in their year of study. */
async function structureFor(
  client: Client,
  student: { programmeId: string; yearOfStudy: number },
) {
  return client.programmeModule.findMany({
    where: {
      programmeId: student.programmeId,
      yearOfStudy: student.yearOfStudy,
    },
    include: { module: true },
  });
}

/**
 * The modules a student has submitted work for, or has a mark in, during an
 * academic year: an assessment belongs to the year of its deadline. `all`
 * counts every mark, and decides what can be dropped; `known` counts only
 * the marks the student may see (published, and not withheld), and is all
 * the student is told, so a hidden mark can't be inferred from it. `due`
 * holds those with a deadline that year that passed while the student was
 * registered on them: they were expected to submit, so those stay too.
 */
async function modulesWithWork(
  client: Client,
  student: { id: string; resultsWithheldAt: Date | null },
  academicYear: string,
): Promise<{ all: Set<string>; known: Set<string>; due: Set<string> }> {
  const timeZone = collegeTimeZone();
  const now = new Date();
  const [submissions, results, registrations] = await Promise.all([
    client.submission.findMany({
      where: { studentId: student.id },
      select: { assessment: { select: { moduleId: true, deadline: true } } },
    }),
    client.assessmentResult.findMany({
      where: { studentId: student.id },
      select: {
        publishedAt: true,
        assessment: { select: { moduleId: true, deadline: true } },
      },
    }),
    client.moduleRegistration.findMany({
      where: { studentId: student.id, academicYear },
      select: {
        moduleId: true,
        registeredAt: true,
        module: { select: { assessments: { select: { deadline: true } } } },
      },
    }),
  ]);
  const inYear = ({ assessment }: { assessment: { deadline: Date } }) =>
    academicYearAt(assessment.deadline, timeZone) === academicYear;
  const modules = (work: { assessment: { moduleId: string } }[]) =>
    new Set(work.map(({ assessment }) => assessment.moduleId));
  const visible = results.filter((result) =>
    isVisibleToStudent(result, student.resultsWithheldAt !== null),
  );
  const due = registrations
    .filter(({ registeredAt, module }) =>
      module.assessments.some(
        ({ deadline }) =>
          deadline < now &&
          deadline >= registeredAt &&
          academicYearAt(deadline, timeZone) === academicYear,
      ),
    )
    .map(({ moduleId }) => moduleId);
  return {
    all: modules([...submissions, ...results].filter(inYear)),
    known: modules([...submissions, ...visible].filter(inYear)),
    due: new Set(due),
  };
}

/**
 * Whether a viewer may change a student's modules: only an enrolled
 * student's change, in an academic year that hasn't ended, and the
 * student's own only while their academic year lets students choose.
 */
function changesFor(
  role: Session["role"],
  student: { status: EnrolmentStatus; academicYear: string },
  calendar: AcademicYearCalendar | null,
): Permission {
  if (student.status !== "ENROLLED") {
    return {
      allowed: false,
      message:
        role === "student"
          ? "Your modules can only change while you are enrolled."
          : DROP_REFUSAL_MESSAGES.NOT_ENROLLED,
    };
  }
  if (academicYearEnded(student.academicYear, collegeToday())) {
    return { allowed: false, message: yearEnded(role, student.academicYear) };
  }
  if (role === "student" && calendar?.studentsChooseModules !== true) {
    return { allowed: false, message: CHOOSING_CLOSED };
  }
  return { allowed: true };
}

/** Refuses any change to the modules of a year that has ended. */
function requireYearOpen(role: Session["role"], academicYear: string): void {
  if (academicYearEnded(academicYear, collegeToday())) {
    throw new AppError("CONFLICT", yearEnded(role, academicYear));
  }
}

/** Refuses a student's own change while their academic year's choice is closed. */
async function requireChoosing(
  client: Client,
  academicYear: string,
): Promise<void> {
  const year = await client.academicYear.findUnique({
    where: { year: academicYear },
    select: { studentsChooseModules: true },
  });
  if (!year?.studentsChooseModules) {
    throw new AppError("FORBIDDEN", CHOOSING_CLOSED);
  }
}

const studentSelect = {
  id: true,
  studentNumber: true,
  status: true,
  programmeId: true,
  yearOfStudy: true,
  academicYear: true,
  resultsWithheldAt: true,
  programme: { select: { code: true, title: true, creditsPerYear: true } },
} satisfies Prisma.StudentSelect;

async function findStudent(client: Client, studentNumber: string) {
  const student = await client.student.findUnique({
    where: { studentNumber },
    select: studentSelect,
  });
  if (!student) {
    throw new AppError(
      "NOT_FOUND",
      `There is no student with ID ${studentNumber}.`,
    );
  }
  return student;
}

/**
 * Why a drop is refused, in words the viewer may read: a student refused
 * because of a mark they can't see yet isn't told about the mark.
 */
function dropRefusal(
  reason: DropRefusal,
  student: boolean,
  work: { known: Set<string> },
  moduleId: string,
): string {
  return reason === "HAS_WORK" && student && !work.known.has(moduleId)
    ? DROP_REFUSED_WITHOUT_REASON
    : DROP_REFUSAL_MESSAGES[reason];
}

/**
 * Finds a student and locks their record for the rest of the transaction,
 * so that two registrations at once can't both fit the year's credits.
 */
async function lockStudent(
  tx: Prisma.TransactionClient,
  studentNumber: string,
) {
  await tx.$queryRaw`
    SELECT id FROM students WHERE student_number = ${studentNumber} FOR UPDATE`;
  return findStudent(tx, studentNumber);
}

function bySemesterThenCode(
  a: { semester: Semester; code: string },
  b: { semester: Semester; code: string },
): number {
  return (
    SEMESTER_ORDER[a.semester] - SEMESTER_ORDER[b.semester] ||
    a.code.localeCompare(b.code)
  );
}
