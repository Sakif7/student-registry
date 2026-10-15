// Student records: enrolling a student with a gap-free per-year student
// number, finding students, and reading a record. Every function checks the
// viewer's permission itself, so no caller can forget to.
import "server-only";

import { startYearOf } from "@/domain/academic-year";
import {
  type CalendarDate,
  fromDbDate,
  todayIn,
  toDbDate,
} from "@/domain/college-time";
import { allowedStatusChanges, type EnrolmentStatus } from "@/domain/enrolment";
import { formatStudentNumber } from "@/domain/student-number";
import {
  createStudentSchema,
  type StudentFilters,
  studentFiltersSchema,
  STUDENTS_PAGE_SIZE,
} from "@/domain/students";
import type { Prisma } from "@/generated/prisma/client";

import { db } from "../db";
import { env } from "../env";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import {
  requireSession,
  requireStaff,
  requireStaffOrSelf,
  type Session,
} from "../session";

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

  return {
    items: students.map((student) => ({
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      email: student.email,
      programme: student.programme,
      academicYear: student.academicYear,
      status: student.status,
    })),
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
 * transaction as the insert, so numbers are unique and have no gaps.
 *
 * @throws AppError: VALIDATION for invalid details or an unknown programme;
 *   CONFLICT if another student already uses the email address.
 */
export async function createStudent(
  session: Session | null,
  input: unknown,
): Promise<StudentRecord> {
  requireStaff(session);
  const details = parseInput(createStudentSchema(collegeToday()), input);
  const programme = await findProgramme(details.programmeCode);
  const intakeYear = startYearOf(details.academicYear);

  try {
    const student = await db().$transaction(async (tx) => {
      const sequence = await nextStudentSequence(tx, intakeYear);
      return tx.student.create({
        data: {
          studentNumber: formatStudentNumber(intakeYear, sequence),
          fullName: details.fullName,
          email: details.email,
          dateOfBirth: toDbDate(details.dateOfBirth),
          academicYear: details.academicYear,
          status: details.status,
          programmeId: programme.id,
          statusChanges: { create: { toStatus: details.status } },
        },
        include: recordInclude,
      });
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
  if (violatedUniqueConstraint(error) === "students_email_key") {
    return new AppError("CONFLICT", "Some fields need correcting.", {
      email: ["Another student already uses this email address"],
    });
  }
  return error;
}

/** The college's date today. */
export function collegeToday(): CalendarDate {
  return todayIn(env().APP_TIME_ZONE);
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
