// Moving students on to a new academic year (staff only): the students
// still enrolled in an earlier year, each with the step they take next, and
// moving them on together. Each student moves in a transaction of their own,
// with the changes an edit or a status change would make, so a long list
// can't hold its locks for long, and running it again carries on where it
// stopped.
import "server-only";

import { createHash } from "node:crypto";

import { academicYearSpan } from "@/domain/academic-year";
import {
  type CalendarDate,
  toDbDate,
  wallTimeToInstant,
} from "@/domain/college-time";
import { defaultDueDate, feeDescription } from "@/domain/fees";
import { LIST_PAGE_SIZE, type ListPage } from "@/domain/lists";
import {
  type ProgressionQuery,
  progressionQuerySchema,
  progressionRequestSchema,
  type ProgressionStep,
  progressionTargets,
  stepLabel,
  stepsFor,
  suggestedStep,
} from "@/domain/progression";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeTimeZone, collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { containsPatterns } from "../search";
import { requireStaff, type Session } from "../session";
import { syncRegistrations } from "./registrations";

/** A student still to move on, with the step they take unless changed. */
export interface ProgressionRow {
  studentNumber: string;
  fullName: string;
  programme: { code: string; title: string; years: number };
  academicYear: string;
  yearOfStudy: number;
  suggested: "next" | "complete";
  /** The steps open to them, the suggested one first. */
  steps: { step: ProgressionStep; label: string }[];
}

/** The progression page: who is still to move on to a year, a page at a time. */
export interface ProgressionList {
  /** The year they move on to, e.g. "2027/28". */
  to: string;
  /** The years they can be moved on to now. */
  targets: string[];
  query: ProgressionQuery & { to: string };
  page: ListPage<ProgressionRow>;
  /**
   * Which students the list holds, on every page, as a fingerprint that
   * moving them on sends back (see progressStudents).
   */
  listed: string;
}

/** What moving students on did. */
export interface ProgressionOutcome {
  /** Up a year. */
  movedUp: number;
  repeating: number;
  completed: number;
  /** Left for now, as staff chose. */
  left: number;
  /** Changed by someone else meanwhile, so left as they were. */
  skipped: number;
}

/**
 * Students enrolled in an earlier academic year than the one they are
 * moving on to, by programme, year of study and name (staff only).
 */
export async function listToProgress(
  session: Session | null,
  input: unknown,
): Promise<ProgressionList> {
  requireStaff(session);
  const targets = progressionTargets(collegeToday());
  const parsed = progressionQuerySchema.parse(input);
  const to =
    parsed.to && targets.includes(parsed.to) ? parsed.to : (targets[0] ?? "");
  const where = toProgressWhere(to, parsed);
  const listed = await db().student.findMany({
    where,
    select: { studentNumber: true, academicYear: true, yearOfStudy: true },
  });
  const total = listed.length;
  const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(parsed.page ?? 1, 1), pageCount);
  const students = await db().student.findMany({
    where,
    include: {
      programme: { select: { code: true, title: true, years: true } },
    },
    orderBy: [
      { programme: { title: "asc" } },
      { yearOfStudy: "asc" },
      { fullName: "asc" },
      { studentNumber: "asc" },
    ],
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
  });
  return {
    to,
    targets,
    query: { ...parsed, to, page },
    page: {
      items: students.map((student) => ({
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        programme: student.programme,
        academicYear: student.academicYear,
        yearOfStudy: student.yearOfStudy,
        suggested: suggestedStep(student.yearOfStudy, student.programme.years),
        steps: stepsFor(student.yearOfStudy, student.programme.years).map(
          (step) => ({ step, label: stepLabel(step, student.yearOfStudy) }),
        ),
      })),
      total,
      page,
      pageCount,
      pageSize: LIST_PAGE_SIZE,
    },
    listed: fingerprint(listed),
  };
}

/**
 * Who a list of students to move on holds, as a short fingerprint of each
 * one's ID, academic year and year of study. Moving them on compares it
 * with the list as it is then, so a student who joined it meanwhile is never
 * moved unseen, even if another left and the count stayed the same.
 */
function fingerprint(
  students: readonly {
    studentNumber: string;
    academicYear: string;
    yearOfStudy: number;
  }[],
): string {
  const text = students
    .map((s) => `${s.studentNumber} ${s.academicYear} ${s.yearOfStudy}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(text).digest("base64url").slice(0, 22);
}

/**
 * How many enrolled students are still in an academic year that has ended
 * (staff only): the dashboard asks for them to be moved on.
 */
export async function countStillInEndedYears(
  session: Session | null,
): Promise<{ year: string; count: number }> {
  requireStaff(session);
  const [year = ""] = progressionTargets(collegeToday());
  const count = await db().student.count({
    where: { status: "ENROLLED", academicYear: { lt: year } },
  });
  return { year, count };
}

/**
 * Moves students on to an academic year (staff only): every student the
 * page listed for the same search and filters, each taking their suggested
 * step unless staff chose another. Up a year or repeating, they move into
 * the new year, are registered on its core modules (counted from the year's
 * start if it has begun, as they were in it from then) and charged its
 * standard fee, if not charged already; in a final year, they complete. A
 * student someone else has changed meanwhile is left as they are.
 *
 * @throws AppError: VALIDATION for a year students can't be moved on to,
 *   or a step not open to a student; CONFLICT if the students listed have
 *   changed since the page was read.
 */
export async function progressStudents(
  session: Session | null,
  input: unknown,
): Promise<ProgressionOutcome> {
  const staff = requireStaff(session);
  const request = parseInput(progressionRequestSchema, input);
  const today = collegeToday();
  const targets = progressionTargets(today);
  if (!targets.includes(request.to)) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      to: [
        `Students can be moved on to ${targets.join(" or ")} just now, not ${request.to}`,
      ],
    });
  }
  const { to } = request;
  const students = await db().student.findMany({
    where: toProgressWhere(to, request),
    select: {
      id: true,
      studentNumber: true,
      academicYear: true,
      yearOfStudy: true,
      programme: { select: { years: true } },
    },
  });
  if (fingerprint(students) !== request.listed) {
    throw new AppError(
      "CONFLICT",
      `The students to move on have changed since you looked: there ${students.length === 1 ? "is" : "are"} now ${students.length}. Reload the page to check them, then move them on.`,
    );
  }
  const plan = students.map((student) => {
    const step =
      request.steps[student.studentNumber] ??
      suggestedStep(student.yearOfStudy, student.programme.years);
    if (
      !stepsFor(student.yearOfStudy, student.programme.years).includes(step)
    ) {
      throw new AppError("VALIDATION", "Some fields need correcting.", {
        steps: [
          `${student.studentNumber} can't ${step === "complete" ? "complete before their final year" : "go past their programme's final year"}`,
        ],
      });
    }
    return { id: student.id, step };
  });

  const outcome: ProgressionOutcome = {
    movedUp: 0,
    repeating: 0,
    completed: 0,
    left: 0,
    skipped: 0,
  };
  // Modules count from the start of the year if it has begun.
  const yearStart = wallTimeToInstant(
    `${academicYearSpan(to).first}T00:00`,
    collegeTimeZone(),
  );
  const now = new Date();
  const registeredAt = yearStart && yearStart < now ? yearStart : now;
  for (const { id, step } of plan) {
    if (step === "leave") {
      outcome.left += 1;
      continue;
    }
    const done = await db().$transaction((tx) =>
      moveOn(tx, staff, id, step, to, registeredAt, today),
    );
    if (!done) outcome.skipped += 1;
    else if (step === "next") outcome.movedUp += 1;
    else if (step === "repeat") outcome.repeating += 1;
    else outcome.completed += 1;
  }
  return outcome;
}

/**
 * Moves one student on, under a lock on their record, unless someone else
 * has changed them meanwhile.
 *
 * @returns Whether they moved.
 */
async function moveOn(
  tx: Prisma.TransactionClient,
  staff: Session,
  id: string,
  step: Exclude<ProgressionStep, "leave">,
  to: string,
  registeredAt: Date,
  today: CalendarDate,
): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM students WHERE id = ${id}::uuid FOR UPDATE`;
  const student = await tx.student.findUniqueOrThrow({
    where: { id },
    include: { programme: true },
  });
  if (student.status !== "ENROLLED" || student.academicYear >= to) {
    return false;
  }
  if (step === "complete") {
    if (student.yearOfStudy < student.programme.years) return false;
    await tx.student.update({ where: { id }, data: { status: "COMPLETED" } });
    await tx.enrolmentStatusChange.create({
      data: { studentId: id, fromStatus: "ENROLLED", toStatus: "COMPLETED" },
    });
    await recordEvent(tx, staff, {
      action: "student.status_changed",
      studentId: id,
      details: { from: "ENROLLED", to: "COMPLETED", reason: null },
    });
    return true;
  }

  const yearOfStudy =
    step === "next" ? student.yearOfStudy + 1 : student.yearOfStudy;
  if (yearOfStudy > student.programme.years) return false;
  await tx.student.update({
    where: { id },
    data: { academicYear: to, yearOfStudy },
  });
  await recordEvent(tx, staff, {
    action: "student.edited",
    studentId: id,
    details: {
      fields:
        step === "next" ? ["academicYear", "yearOfStudy"] : ["academicYear"],
      changes: {
        academicYear: { from: student.academicYear, to },
        ...(step === "next" && {
          yearOfStudy: { from: student.yearOfStudy, to: yearOfStudy },
        }),
      },
    },
  });
  await syncRegistrations(tx, staff, id, registeredAt);
  const charged = await tx.feeCharge.findUnique({
    where: { studentId_academicYear: { studentId: id, academicYear: to } },
    select: { id: true },
  });
  if (!charged) {
    const amountPence = student.programme.annualFeePence;
    await tx.feeCharge.create({
      data: {
        studentId: id,
        academicYear: to,
        description: feeDescription(to, student.programme.title),
        amountPence,
        standardFeePence: amountPence,
        dueDate: toDbDate(defaultDueDate(today, to)),
      },
    });
    await recordEvent(tx, staff, {
      action: "fee.charged",
      studentId: id,
      details: { academicYear: to, amountPence },
    });
  }
  return true;
}

/** Enrolled students in an earlier year than `to`, as the filters narrow. */
function toProgressWhere(
  to: string,
  filters: { q?: string; programme?: string; year?: number },
): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [
    { status: "ENROLLED" },
    // Academic years are written YYYY/YY, so their text sorts in order.
    { academicYear: { lt: to } },
  ];
  if (filters.q) {
    conditions.push({
      OR: containsPatterns(filters.q).flatMap((pattern) => [
        { fullName: { contains: pattern, mode: "insensitive" as const } },
        { studentNumber: { contains: pattern, mode: "insensitive" as const } },
      ]),
    });
  }
  if (filters.programme) {
    conditions.push({ programme: { code: filters.programme } });
  }
  if (filters.year) conditions.push({ yearOfStudy: filters.year });
  return { AND: conditions };
}
