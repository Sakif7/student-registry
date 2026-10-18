// Student records: enrolling a student with a gap-free per-year student
// number, finding students, reading and editing a record, and changing its
// enrolment status. Every function checks the viewer's permission itself, so
// no caller can forget to.
import "server-only";

import { hashPassword } from "better-auth/crypto";

import {
  academicYearEnded,
  chooseAcademicYearFrom,
  recordYears,
  returnYears,
  startYearOf,
} from "@/domain/academic-year";
import type { AuditDetails } from "@/domain/audit";
import { type CalendarDate, fromDbDate, toDbDate } from "@/domain/college-time";
import {
  allowedStatusChanges,
  canChangeStatus,
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
} from "@/domain/enrolment";
import {
  type AccountStanding,
  defaultDueDate,
  feeDescription,
} from "@/domain/fees";
import type { SortDirection } from "@/domain/sorting";
import { formatStudentNumber } from "@/domain/student-number";
import {
  changeStatusSchema,
  createStudentSchema,
  type StudentFilters,
  studentFiltersSchema,
  type StudentSort,
  STUDENTS_PAGE_SIZE,
  updateStudentSchema,
} from "@/domain/students";
import type { Prisma } from "@/generated/prisma/client";

import { recordEvent } from "../audit";
import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { passwordLinksOf } from "../password-links";
import { containsPatterns } from "../search";
import {
  requireSession,
  requireStaff,
  requireStaffOrSelf,
  type Session,
} from "../session";

import { summariseAccounts } from "./fees";
import { syncRegistrations } from "./registrations";
import { type SentLink, sendSignInLink } from "./sign-in";

/** A programme as offered in forms and filters. */
export interface ProgrammeOption {
  code: string;
  title: string;
  annualFeePence: number;
  /** How many years of study it takes. */
  years: number;
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
  yearOfStudy: number;
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
    select: { code: true, title: true, annualFeePence: true, years: true },
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
    orderBy: studentsOrder(parsed.sort ?? "name", parsed.dir ?? "asc"),
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

/**
 * The order for a sorted column. Ties go by name, then student ID, so pages
 * never shuffle students between them.
 */
function studentsOrder(
  sort: StudentSort,
  dir: SortDirection,
): Prisma.StudentOrderByWithRelationInput[] {
  const tieBreak: Prisma.StudentOrderByWithRelationInput[] = [
    { fullName: "asc" },
    { studentNumber: "asc" },
  ];
  switch (sort) {
    case "name":
      return [{ fullName: dir }, { studentNumber: "asc" }];
    case "id":
      return [{ studentNumber: dir }];
    case "programme":
      return [{ programme: { title: dir } }, ...tieBreak];
    case "year":
      return [{ academicYear: dir }, ...tieBreak];
    case "status":
      return [{ status: dir }, ...tieBreak];
  }
}

function studentsWhere(filters: StudentFilters): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [];
  if (filters.q) {
    const patterns = containsPatterns(filters.q);
    conditions.push({
      OR: patterns.flatMap((pattern) => [
        { fullName: { contains: pattern, mode: "insensitive" as const } },
        { studentNumber: { contains: pattern, mode: "insensitive" as const } },
        { email: { contains: pattern, mode: "insensitive" as const } },
      ]),
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

/** A new enrolment, and the activation email if one was sent. */
export interface Enrolment {
  student: StudentRecord;
  /** The activation email, or null when staff set the student's password. */
  activationEmail: SentLink | null;
}

/**
 * Enrols a student (staff only), as createStudent does, then emails the
 * student a link to activate their account, unless staff set its password.
 * A mail server failure doesn't undo the enrolment: the result says the email
 * didn't go, and staff can send it again from the student's record.
 *
 * @throws AppError: as createStudent.
 */
export async function enrolStudent(
  session: Session | null,
  input: unknown,
): Promise<Enrolment> {
  const { student, passwordSet } = await insertStudent(session, input);
  return {
    student,
    activationEmail: passwordSet
      ? null
      : await sendSignInLink(session, student.studentNumber),
  };
}

/**
 * Creates a student's record (staff only). The student number is allocated
 * in the same transaction as the insert, so numbers are unique and have no
 * gaps. A student enrolled straight away is charged the programme's standard
 * fee for the year in the same transaction, so a new enrolment can't be left
 * unbilled. The student's sign-in account is created with the record: active,
 * if staff set its first password, or else waiting for activation (see
 * enrolStudent for the email).
 *
 * @throws AppError: VALIDATION for invalid details or an unknown programme;
 *   CONFLICT if another student or account already uses the email address.
 */
export async function createStudent(
  session: Session | null,
  input: unknown,
): Promise<StudentRecord> {
  return (await insertStudent(session, input)).student;
}

async function insertStudent(
  session: Session | null,
  input: unknown,
): Promise<{ student: StudentRecord; passwordSet: boolean }> {
  const staff = requireStaff(session);
  const today = collegeToday();
  const details = parseInput(createStudentSchema(today), input);
  const programme = await findProgramme(details.programmeCode);
  checkYearOfStudy(details.yearOfStudy, programme);
  const intakeYear = startYearOf(details.academicYear);
  // Hashed before the transaction, so its locks aren't held while scrypt works.
  const passwordHash =
    details.password === undefined
      ? null
      : await hashPassword(details.password);

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
          yearOfStudy: details.yearOfStudy,
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
                    dueDate: toDbDate(
                      defaultDueDate(today, details.academicYear),
                    ),
                  },
                }
              : undefined,
        },
        include: recordInclude,
      });
      const user = await tx.user.create({
        data: {
          name: created.fullName,
          email: created.email,
          role: "student",
          studentNumber: created.studentNumber,
          // A password set now makes the account active, as activating it
          // would.
          emailVerified: passwordHash !== null,
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
      // The fee charged with the enrolment is a change of its own.
      if (details.status === "ENROLLED") {
        await recordEvent(tx, staff, {
          action: "fee.charged",
          studentId: created.id,
          details: {
            academicYear: details.academicYear,
            amountPence: programme.annualFeePence,
          },
        });
      }
      if (passwordHash !== null) {
        // Stored as Better Auth stores a password: in a credential account
        // whose ID is the user's.
        await tx.account.create({
          data: {
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: passwordHash,
          },
        });
        await recordEvent(tx, staff, {
          action: "sign_in.password_set",
          studentId: created.id,
          details: {},
        });
      }
      await syncRegistrations(tx, staff, created.id);
      return created;
    });
    return { student: toRecord(student), passwordSet: passwordHash !== null };
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
  const today = collegeToday();
  const changes = parseInput(updateStudentSchema(today), input);
  const { id } = await findStudentId(studentNumber);
  const newProgramme = changes.programmeCode
    ? await findProgramme(changes.programmeCode)
    : undefined;

  try {
    const student = await db().$transaction(async (tx) => {
      const before = await tx.student.findUniqueOrThrow({
        where: { id },
        include: { programme: true },
      });
      checkYearOfStudy(
        changes.yearOfStudy ?? before.yearOfStudy,
        newProgramme ?? before.programme,
      );
      checkRecordYear(changes.academicYear, before.academicYear, today);
      checkPlacementChange(before, changes, newProgramme?.id, today);
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
          yearOfStudy: changes.yearOfStudy,
          programmeId: newProgramme?.id,
        },
        include: recordInclude,
      });
      await syncAccount(tx, updated);
      const fields = changedFields(before, updated);
      if (fields.length > 0) {
        const changes = placementChanges(before, updated);
        await recordEvent(tx, staff, {
          action: "student.edited",
          studentId: id,
          details: { fields, ...(changes && { changes }) },
        });
      }
      // A new programme, year of study or academic year needs other modules.
      if (
        fields.some((field) =>
          ["programmeCode", "yearOfStudy", "academicYear"].includes(field),
        )
      ) {
        await syncRegistrations(tx, staff, id);
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
  if (before.yearOfStudy !== after.yearOfStudy) fields.push("yearOfStudy");
  return fields;
}

/**
 * The old and new programme, year of study and academic year an edit
 * changed, for the audit trail, or undefined if it changed none of them.
 */
function placementChanges(
  before: StudentPlacement,
  after: StudentPlacement,
): AuditDetails["student.edited"]["changes"] {
  const changes: NonNullable<AuditDetails["student.edited"]["changes"]> = {};
  if (before.programme.code !== after.programme.code) {
    changes.programmeCode = {
      from: before.programme.code,
      to: after.programme.code,
    };
  }
  if (before.yearOfStudy !== after.yearOfStudy) {
    changes.yearOfStudy = { from: before.yearOfStudy, to: after.yearOfStudy };
  }
  if (before.academicYear !== after.academicYear) {
    changes.academicYear = {
      from: before.academicYear,
      to: after.academicYear,
    };
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

type StudentPlacement = {
  programme: { code: string };
  yearOfStudy: number;
  academicYear: string;
};

type StudentDetailsRow = {
  fullName: string;
  email: string;
  dateOfBirth: Date;
  programmeId: string;
  academicYear: string;
  yearOfStudy: number;
};

/** Refuses a year of study the programme doesn't have. */
function checkYearOfStudy(
  yearOfStudy: number,
  programme: { title: string; years: number },
): void {
  if (yearOfStudy > programme.years) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      yearOfStudy: [
        `${programme.title} has ${programme.years} ${programme.years === 1 ? "year" : "years"} of study`,
      ],
    });
  }
}

/**
 * Refuses moving a completed student, whose programme and years are
 * history, and a new programme or year of study for a student in a year that
 * has ended, unless they move on to a new academic year with it: that year's
 * modules are history too.
 */
function checkPlacementChange(
  before: {
    status: EnrolmentStatus;
    programmeId: string;
    academicYear: string;
    yearOfStudy: number;
  },
  changes: { academicYear?: string; yearOfStudy?: number },
  programmeId: string | undefined,
  today: CalendarDate,
): void {
  const moved = {
    programmeCode:
      programmeId !== undefined && programmeId !== before.programmeId,
    academicYear:
      changes.academicYear !== undefined &&
      changes.academicYear !== before.academicYear,
    yearOfStudy:
      changes.yearOfStudy !== undefined &&
      changes.yearOfStudy !== before.yearOfStudy,
  };
  if (before.status === "COMPLETED") {
    const fields = STUDENT_PLACEMENT_FIELDS.filter((field) => moved[field]);
    if (fields.length > 0) {
      throw new AppError(
        "VALIDATION",
        "Some fields need correcting.",
        Object.fromEntries(
          fields.map((field) => [
            field,
            ["The student has completed, so this stays as it was"],
          ]),
        ),
      );
    }
    return;
  }
  const academicYear = changes.academicYear ?? before.academicYear;
  if (
    (moved.programmeCode || moved.yearOfStudy) &&
    academicYearEnded(academicYear, today)
  ) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      academicYear: [
        `${academicYear} has ended: move the student on to a new academic year to change their programme or year of study`,
      ],
    });
  }
}

/**
 * Refuses an academic year staff can't move a record to (see recordYears).
 * Keeping the year the record has is always allowed.
 */
function checkRecordYear(
  academicYear: string | undefined,
  current: string,
  today: CalendarDate,
): void {
  const years = recordYears(today);
  if (
    academicYear === undefined ||
    academicYear === current ||
    years.includes(academicYear)
  ) {
    return;
  }
  throw new AppError("VALIDATION", "Some fields need correcting.", {
    academicYear: [chooseAcademicYearFrom(years)],
  });
}

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
  const {
    status: to,
    reason,
    academicYear,
    yearOfStudy,
  } = parseInput(changeStatusSchema, input);
  const number = studentNumber.toUpperCase();
  const current = await db().student.findUnique({
    where: { studentNumber: number },
    include: { programme: true },
  });
  if (!current) {
    throw new AppError("NOT_FOUND", `There is no student with ID ${number}.`);
  }
  const { id, status: from } = current;
  const finalYear = current.yearOfStudy === current.programme.years;
  if (!canChangeStatus(from, to, finalYear)) {
    throw new AppError("CONFLICT", statusChangeRefusal(from, to, current));
  }
  // Only a return to Enrolled moves the student's year with it.
  if (to !== "ENROLLED" && (academicYear ?? yearOfStudy) !== undefined) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      academicYear: [
        "Only a return to Enrolled changes the year here. Use Edit details.",
      ],
    });
  }
  const placement =
    to === "ENROLLED"
      ? returnPlacement(current, { academicYear, yearOfStudy })
      : undefined;

  const student = await db().$transaction(async (tx) => {
    // Only change the status if it is still the one just read, so that two
    // people changing the same record at once can't both succeed.
    const { count } = await tx.student.updateMany({
      where: { id, status: from },
      data: { status: to, ...placement },
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
    const changes =
      placement &&
      placementChanges(current, { ...placement, programme: current.programme });
    if (changes) {
      await recordEvent(tx, staff, {
        action: "student.edited",
        studentId: id,
        details: {
          fields: STUDENT_PLACEMENT_FIELDS.filter((field) => field in changes),
          changes,
        },
      });
    }
    await syncRegistrations(tx, staff, id);
    return tx.student.findUniqueOrThrow({
      where: { id },
      include: recordInclude,
    });
  });
  return toRecord(student);
}

/** The placement fields, in the order an edit names them. */
const STUDENT_PLACEMENT_FIELDS = [
  "programmeCode",
  "academicYear",
  "yearOfStudy",
] as const;

/**
 * The academic year and year of study a student returns to Enrolled in:
 * those given, or else the record's own. A year that has ended can't be
 * returned to, as its modules are history: a student in one needs a new
 * year, this one or next.
 */
function returnPlacement(
  current: {
    academicYear: string;
    yearOfStudy: number;
    programme: { title: string; years: number };
  },
  input: { academicYear?: string; yearOfStudy?: number },
): { academicYear: string; yearOfStudy: number } {
  const today = collegeToday();
  const years = returnYears(today);
  const academicYear = input.academicYear ?? current.academicYear;
  if (
    input.academicYear === undefined &&
    academicYearEnded(academicYear, today)
  ) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      academicYear: [
        `${academicYear} has ended: choose the academic year the student returns to`,
      ],
    });
  }
  if (academicYear !== current.academicYear && !years.includes(academicYear)) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      academicYear: [chooseAcademicYearFrom(years)],
    });
  }
  const yearOfStudy = input.yearOfStudy ?? current.yearOfStudy;
  checkYearOfStudy(yearOfStudy, current.programme);
  return { academicYear, yearOfStudy };
}

function statusChangeRefusal(
  from: EnrolmentStatus,
  to: EnrolmentStatus,
  student: { yearOfStudy: number; programme: { years: number } },
) {
  if (from === to) {
    return `The student is already ${ENROLMENT_STATUS_LABELS[to]}.`;
  }
  if (to === "COMPLETED" && canChangeStatus(from, to, true)) {
    return `Only a student in the final year of their programme can complete it: this student is in year ${student.yearOfStudy} of ${student.programme.years}.`;
  }
  const allowed = allowedStatusChanges(
    from,
    student.yearOfStudy === student.programme.years,
  );
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
async function findProgramme(code: string) {
  const programme = await db().programme.findUnique({ where: { code } });
  if (!programme) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      programmeCode: ["Choose a programme from the list"],
    });
  }
  return programme;
}

/** Turns the email unique-constraint violation into a field error. */
function asDuplicateEmail(error: unknown): unknown {
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
    yearOfStudy: student.yearOfStudy,
    status: student.status,
    programme: {
      code: student.programme.code,
      title: student.programme.title,
      annualFeePence: student.programme.annualFeePence,
      years: student.programme.years,
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
    allowedStatusChanges: allowedStatusChanges(
      student.status,
      student.yearOfStudy === student.programme.years,
    ),
  };
}
