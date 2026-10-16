// Student records: enrolling a student with a gap-free per-year student
// number, finding students, reading and editing a record, and changing its
// enrolment status. Every function checks the viewer's permission itself, so
// no caller can forget to.
import "server-only";

import { startYearOf } from "@/domain/academic-year";
import {
  addDays,
  type CalendarDate,
  fromDbDate,
  toDbDate,
} from "@/domain/college-time";
import {
  allowedStatusChanges,
  canChangeStatus,
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
} from "@/domain/enrolment";
import {
  type AccountStanding,
  DEFAULT_FEE_DUE_DAYS,
  feeDescription,
} from "@/domain/fees";
import { formatStudentNumber } from "@/domain/student-number";
import {
  changeStatusSchema,
  createStudentSchema,
  type StudentFilters,
  studentFiltersSchema,
  STUDENTS_PAGE_SIZE,
  updateStudentSchema,
} from "@/domain/students";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { passwordLinksOf } from "../password-links";
import {
  requireSession,
  requireStaff,
  requireStaffOrSelf,
  type Session,
} from "../session";

import { summariseAccounts } from "./fees";

/** A programme as offered in forms and filters. */
export interface ProgrammeOption {
  code: string;
  title: string;
  annualFeePence: number;
}

export interface StatusChange {
  from: EnrolmentStatus | null;
  to: EnrolmentStatus;
  reason: string | null;
  changedAt: Date;
}

/** A student record as the staff and the student themselves see it. */
export interface StudentRecord {
  studentNumber: string;
  fullName: string;
  email: string;
  dateOfBirth: CalendarDate;
  academicYear: string;
  status: EnrolmentStatus;
  programme: ProgrammeOption;
  enrolledAt: Date;
  resultsWithheld: { since: Date; reason: string } | null;
  statusHistory: StatusChange[];
  allowedStatusChanges: readonly EnrolmentStatus[];
}

/** A student as listed in the staff search results. */
export interface StudentListItem {
  studentNumber: string;
  fullName: string;
  email: string;
  programme: { code: string; title: string };
  academicYear: string;
  status: EnrolmentStatus;
  /** Their account at a glance, so overdue balances stand out in the list. */
  account: {
    standing: AccountStanding;
    balancePence: number;
    overduePence: number;
    daysOverdue: number;
  };
}

/** One page of search results. */
export interface StudentPage {
  items: StudentListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  filters: StudentFilters;
}

const recordInclude = {
  programme: true,
  statusChanges: { orderBy: { changedAt: "asc" } },
} satisfies Prisma.StudentInclude;

type StudentWithRelations = Prisma.StudentGetPayload<{
  include: typeof recordInclude;
}>;

/** Every programme, for forms and filters. */
export async function listProgrammes(
  session: Session | null,
): Promise<ProgrammeOption[]> {
  requireSession(session);
  return db().programme.findMany({
    select: { code: true, title: true, annualFeePence: true },
    orderBy: { title: "asc" },
  });
}

/**
 * Finds students for the staff list (staff only). The search text matches
 * the name, student ID or email anywhere, ignoring case; filters combine.
 * Malformed filter values are ignored rather than rejected.
 *
 * @param filters - Raw values, e.g. from the URL: q, programme, status, year
 *   and page.
 */
export async function listStudents(
  session: Session | null,
  filters: unknown,
): Promise<StudentPage> {
  requireStaff(session);
  const parsed = studentFiltersSchema.parse(filters);
  const where = studentsWhere(parsed);

  const total = await db().student.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE));
  const page = Math.min(parsed.page, pageCount);
  const students = await db().student.findMany({
    where,
    include: { programme: { select: { code: true, title: true } } },
    orderBy: [{ fullName: "asc" }, { studentNumber: "asc" }],
    skip: (page - 1) * STUDENTS_PAGE_SIZE,
    take: STUDENTS_PAGE_SIZE,
  });
  const accounts = await summariseAccounts(
    students.map((student) => student.id),
    collegeToday(),
  );

  return {
    items: students.map((student) => {
      const account = accounts.get(student.id);
      return {
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        email: student.email,
        programme: student.programme,
        academicYear: student.academicYear,
        status: student.status,
        account: {
          standing: account?.standing ?? "NONE",
          balancePence: account?.summary.balancePence ?? 0,
          overduePence: account?.summary.overduePence ?? 0,
          daysOverdue: account?.summary.daysOverdue ?? 0,
        },
      };
    }),
    total,
    page,
    pageCount,
    pageSize: STUDENTS_PAGE_SIZE,
    filters: { ...parsed, page },
  };
}

function studentsWhere(filters: StudentFilters): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [];
  if (filters.q) {
    // Typed % and _ are literal characters, not ILIKE wildcards.
    const text = filters.q.replace(/[\\%_]/g, "\\$&");
    conditions.push({
      OR: [
        { fullName: { contains: text, mode: "insensitive" } },
        { studentNumber: { contains: text, mode: "insensitive" } },
        { email: { contains: text, mode: "insensitive" } },
      ],
    });
  }
  if (filters.programme)
    conditions.push({ programme: { code: filters.programme } });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.year) conditions.push({ academicYear: filters.year });
  return { AND: conditions };
}

/**
 * One student's record, for staff or for the student themselves.
 *
 * @throws AppError: NOT_FOUND for an unknown student; UNAUTHENTICATED or
 *   FORBIDDEN without permission.
 */
export async function getStudent(
  session: Session | null,
  studentNumber: string,
): Promise<StudentRecord> {
  const number = studentNumber.toUpperCase();
  requireStaffOrSelf(session, number);
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    include: recordInclude,
  });
  if (!student) {
    throw new AppError("NOT_FOUND", `There is no student with ID ${number}.`);
  }
  return toRecord(student);
}

/**
 * Enrols a student (staff only). The student number is allocated in the same
 * transaction as the insert, so numbers are unique and have no gaps. A student
 * enrolled straight away is charged the programme's standard fee for the
 * year in the same transaction, so a new enrolment can't be left unbilled.
 * The student's sign-in account is created with the record, waiting for
 * activation (see services/sign-in.ts for the email).
 *
 * @throws AppError: VALIDATION for invalid details or an unknown programme;
 *   CONFLICT if another student or account already uses the email address.
 */
export async function createStudent(
  session: Session | null,
  input: unknown,
): Promise<StudentRecord> {
  const staff = requireStaff(session);
  const today = collegeToday();
  const details = parseInput(createStudentSchema(today), input);
  const programme = await findProgramme(details.programmeCode);
  const intakeYear = startYearOf(details.academicYear);

  try {
    const student = await db().$transaction(async (tx) => {
      const sequence = await nextStudentSequence(tx, intakeYear);
      const created = await tx.student.create({
        data: {
          studentNumber: formatStudentNumber(intakeYear, sequence),
          fullName: details.fullName,
          email: details.email,
          dateOfBirth: toDbDate(details.dateOfBirth),
          academicYear: details.academicYear,
          status: details.status,
          programmeId: programme.id,
          statusChanges: { create: { toStatus: details.status } },
          feeCharges:
            details.status === "ENROLLED"
              ? {
                  create: {
                    academicYear: details.academicYear,
                    description: feeDescription(
                      details.academicYear,
                      programme.title,
                    ),
                    amountPence: programme.annualFeePence,
                    dueDate: toDbDate(addDays(today, DEFAULT_FEE_DUE_DAYS)),
                  },
                }
              : undefined,
        },
        include: recordInclude,
      });
      await tx.user.create({
        data: {
          name: created.fullName,
          email: created.email,
          role: "student",
          studentNumber: created.studentNumber,
        },
      });
      await recordEvent(tx, staff, {
        action: "student.enrolled",
        studentId: created.id,
        details: {
          studentNumber: created.studentNumber,
          status: created.status,
        },
      });
      return created;
    });
    return toRecord(student);
  } catch (error) {
    throw asDuplicateEmail(error);
  }
}

/**
 * Takes the next number in an intake year's sequence. The upsert locks that
 * year's counter row until the transaction ends, so concurrent enrolments for
 * the same year queue here, and if the enrolment fails the increment rolls
 * back with it, so no number is skipped.
 */
async function nextStudentSequence(
  tx: Prisma.TransactionClient,
  intakeYear: number,
): Promise<number> {
  const [counter] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO student_number_counters (year, last_value)
    VALUES (${intakeYear}, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_value = student_number_counters.last_value + 1
    RETURNING last_value`;
  if (!counter) throw new Error("The student number counter returned no row.");
  return counter.last_value;
}

/**
 * Edits a student's details (staff only). The student number never changes,
 * even when the academic year does. Status changes go through changeStatus.
 * The sign-in account follows the record's name and email address; a new
 * address cancels any link emailed to the old one.
 *
 * @throws AppError: NOT_FOUND, VALIDATION, or CONFLICT for an email already
 *   in use.
 */
export async function updateStudent(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<StudentRecord> {
  const staff = requireStaff(session);
  const changes = parseInput(updateStudentSchema(collegeToday()), input);
  const { id } = await findStudentId(studentNumber);
  const programmeId = changes.programmeCode
    ? (await findProgramme(changes.programmeCode)).id
    : undefined;

  try {
    const student = await db().$transaction(async (tx) => {
      const before = await tx.student.findUniqueOrThrow({ where: { id } });
      const updated = await tx.student.update({
        where: { id },
        data: {
          fullName: changes.fullName,
          email: changes.email,
          dateOfBirth:
            changes.dateOfBirth === undefined
              ? undefined
              : toDbDate(changes.dateOfBirth),
          academicYear: changes.academicYear,
          programmeId,
        },
        include: recordInclude,
      });
      await syncAccount(tx, updated);
      const fields = changedFields(before, updated);
      if (fields.length > 0) {
        await recordEvent(tx, staff, {
          action: "student.edited",
          studentId: id,
          details: { fields },
        });
      }
      return updated;
    });
    return toRecord(student);
  } catch (error) {
    throw asDuplicateEmail(error);
  }
}

/** The details an edit changed, named as the edit form names them. */
function changedFields(
  before: StudentDetailsRow,
  after: StudentDetailsRow,
): string[] {
  const fields: string[] = [];
  if (before.fullName !== after.fullName) fields.push("fullName");
  if (before.email !== after.email) fields.push("email");
  if (before.dateOfBirth.getTime() !== after.dateOfBirth.getTime()) {
    fields.push("dateOfBirth");
  }
  if (before.programmeId !== after.programmeId) fields.push("programmeCode");
  if (before.academicYear !== after.academicYear) fields.push("academicYear");
  return fields;
}

type StudentDetailsRow = {
  fullName: string;
  email: string;
  dateOfBirth: Date;
  programmeId: string;
  academicYear: string;
};

/** Copies a student's name and email address to their sign-in account. */
async function syncAccount(
  tx: Prisma.TransactionClient,
  student: { studentNumber: string; fullName: string; email: string },
): Promise<void> {
  const account = await tx.user.findUnique({
    where: { studentNumber: student.studentNumber },
    select: { id: true, name: true, email: true },
  });
  if (
    !account ||
    (account.name === student.fullName && account.email === student.email)
  ) {
    return;
  }
  await tx.user.update({
    where: { id: account.id },
    data: { name: student.fullName, email: student.email },
  });
  if (account.email !== student.email) {
    await tx.verification.deleteMany({ where: passwordLinksOf(account.id) });
  }
}

/**
 * Moves a student to another enrolment status (staff only), recording the
 * change and its reason in the status history.
 *
 * @throws AppError: NOT_FOUND; VALIDATION (e.g. a withdrawal without a
 *   reason); CONFLICT if the rules don't allow the change, or if someone
 *   else changed the status in the meantime.
 */
export async function changeStatus(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<StudentRecord> {
  const staff = requireStaff(session);
  const { status: to, reason } = parseInput(changeStatusSchema, input);
  const { id, status: from } = await findStudentId(studentNumber);
  if (!canChangeStatus(from, to)) {
    throw new AppError("CONFLICT", statusChangeRefusal(from, to));
  }

  const student = await db().$transaction(async (tx) => {
    // Only change the status if it is still the one just read, so that two
    // people changing the same record at once can't both succeed.
    const { count } = await tx.student.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    if (count === 0) {
      throw new AppError(
        "CONFLICT",
        "Someone else changed this student's status just now. Reload the page and try again.",
      );
    }
    await tx.enrolmentStatusChange.create({
      data: { studentId: id, fromStatus: from, toStatus: to, reason },
    });
    await recordEvent(tx, staff, {
      action: "student.status_changed",
      studentId: id,
      details: { from, to, reason: reason ?? null },
    });
    return tx.student.findUniqueOrThrow({
      where: { id },
      include: recordInclude,
    });
  });
  return toRecord(student);
}

function statusChangeRefusal(from: EnrolmentStatus, to: EnrolmentStatus) {
  if (from === to) {
    return `The student is already ${ENROLMENT_STATUS_LABELS[to]}.`;
  }
  const allowed = allowedStatusChanges(from);
  if (allowed.length === 0) {
    return `A ${ENROLMENT_STATUS_LABELS[from]} record is final; its status can't change.`;
  }
  return `A ${ENROLMENT_STATUS_LABELS[from]} student can't be marked ${ENROLMENT_STATUS_LABELS[to]}. Allowed: ${allowed.map((status) => ENROLMENT_STATUS_LABELS[status]).join(", ")}.`;
}

async function findStudentId(studentNumber: string) {
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: { id: true, status: true },
  });
  if (!student) {
    throw new AppError("NOT_FOUND", `There is no student with ID ${number}.`);
  }
  return student;
}

/** Looks up a programme by code, as a field error if it doesn't exist. */
export async function findProgramme(code: string) {
  const programme = await db().programme.findUnique({ where: { code } });
  if (!programme) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      programmeCode: ["Choose a programme from the list"],
    });
  }
  return programme;
}

/** Turns the email unique-constraint violation into a field error. */
export function asDuplicateEmail(error: unknown): unknown {
  const constraint = violatedUniqueConstraint(error);
  if (constraint === "students_email_key") {
    return new AppError("CONFLICT", "Some fields need correcting.", {
      email: ["Another student already uses this email address"],
    });
  }
  // A member of staff, say: sign-in addresses are unique across everyone.
  if (constraint === "users_email_key") {
    return new AppError("CONFLICT", "Some fields need correcting.", {
      email: ["Another account already uses this email address"],
    });
  }
  return error;
}

function toRecord(student: StudentWithRelations): StudentRecord {
  return {
    studentNumber: student.studentNumber,
    fullName: student.fullName,
    email: student.email,
    dateOfBirth: fromDbDate(student.dateOfBirth),
    academicYear: student.academicYear,
    status: student.status,
    programme: {
      code: student.programme.code,
      title: student.programme.title,
      annualFeePence: student.programme.annualFeePence,
    },
    enrolledAt: student.createdAt,
    resultsWithheld:
      student.resultsWithheldAt && student.resultsWithheldReason
        ? {
            since: student.resultsWithheldAt,
            reason: student.resultsWithheldReason,
          }
        : null,
    statusHistory: student.statusChanges.map((change) => ({
      from: change.fromStatus,
      to: change.toStatus,
      reason: change.reason,
      changedAt: change.changedAt,
    })),
    allowedStatusChanges: allowedStatusChanges(student.status),
  };
}
