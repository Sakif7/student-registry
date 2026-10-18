// Student accounts: fee charges, payments and their corrections, and the
// balance and overdue amount derived from them. Balances are computed on every
// read, never stored, so a recorded payment shows in the balance immediately
// and can never drift.
import "server-only";

import { chooseAcademicYearFrom, recordYears } from "@/domain/academic-year";
import { type CalendarDate, fromDbDate, toDbDate } from "@/domain/college-time";
import {
  type AccountStanding,
  accountStanding,
  type AccountSummary,
  type AllocatedCharge,
  allocatePayments,
  assignFeeSchema,
  correctFeeSchema,
  defaultDueDate,
  dueDateProblem,
  feeDescription,
  recordPaymentSchema,
  reversePaymentSchema,
  summariseAccount,
  totalPaid,
} from "@/domain/fees";
import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";

import { recordEvent } from "../audit";
import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { isId } from "../ids";
import { requireStaff, requireStaffOrSelf, type Session } from "../session";

export interface FeeChargeView {
  id: string;
  academicYear: string;
  description: string;
  amountPence: number;
  /** The standard fee it was raised at, which a correction is judged by. */
  standardFeePence: number;
  dueDate: CalendarDate;
  note: string | null;
}

export interface PaymentView {
  id: string;
  amountPence: number;
  paidOn: CalendarDate;
  reference: string;
  recordedAt: Date;
  reversal: { reason: string; reversedAt: Date } | null;
}

/** A student's account as staff and the student themselves see it. */
export interface Account {
  studentNumber: string;
  /** The student's current academic session. */
  academicYear: string;
  /** The programme's standard annual fee, offered when assigning a fee. */
  standardFeePence: number;
  /** Charges, oldest due date first, with what has been paid of each. */
  charges: AllocatedCharge<FeeChargeView>[];
  /** Payments, newest first, including reversed ones. */
  payments: PaymentView[];
  summary: AccountSummary;
  standing: AccountStanding;
  /** True when no fee is charged yet for the student's current session. */
  currentYearUncharged: boolean;
}

const accountInclude = {
  programme: true,
  feeCharges: true,
  payments: {
    include: { reversal: true },
    orderBy: [{ paidOn: "desc" }, { recordedAt: "desc" }],
  },
} satisfies Prisma.StudentInclude;

type StudentWithAccount = Prisma.StudentGetPayload<{
  include: typeof accountInclude;
}>;

/**
 * A student's account, for staff or for the student themselves.
 *
 * @throws AppError: NOT_FOUND; UNAUTHENTICATED or FORBIDDEN.
 */
export async function getAccount(
  session: Session | null,
  studentNumber: string,
): Promise<Account> {
  const number = studentNumber.toUpperCase();
  const viewer = requireStaffOrSelf(session, number);
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    include: accountInclude,
  });
  if (!student) throw studentNotFound(number);
  return toAccount(student, collegeToday(), viewer.role === "student");
}

/**
 * Charges a student the fee for an academic year (staff only): the student's
 * own, or one of recordYears. The amount defaults to the programme's
 * standard fee; a different amount needs a note saying why (e.g. a
 * scholarship).
 *
 * @throws AppError: VALIDATION, NOT_FOUND, or CONFLICT if that academic year
 *   is already charged.
 */
export async function assignFee(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<Account> {
  const staff = requireStaff(session);
  const fee = parseInput(assignFeeSchema, input);
  const student = await findStudent(studentNumber);
  const years = recordYears(collegeToday());
  if (
    fee.academicYear !== student.academicYear &&
    !years.includes(fee.academicYear)
  ) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      academicYear: [chooseAcademicYearFrom(years)],
    });
  }
  const standardFee = student.programme.annualFeePence;
  const amountPence = fee.amountPence ?? standardFee;
  if (amountPence !== standardFee && !fee.note) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      note: [
        `Explain why the amount differs from the standard fee of ${formatMoney(standardFee)}`,
      ],
    });
  }

  try {
    await db().$transaction(async (tx) => {
      await tx.feeCharge.create({
        data: {
          studentId: student.id,
          academicYear: fee.academicYear,
          description: feeDescription(
            fee.academicYear,
            student.programme.title,
          ),
          amountPence,
          standardFeePence: standardFee,
          dueDate: toDbDate(
            fee.dueDate ?? defaultDueDate(collegeToday(), fee.academicYear),
          ),
          note: fee.note,
        },
      });
      await recordEvent(tx, staff, {
        action: "fee.charged",
        studentId: student.id,
        details: { academicYear: fee.academicYear, amountPence },
      });
    });
  } catch (error) {
    if (
      violatedUniqueConstraint(error) ===
      "fee_charges_student_id_academic_year_key"
    ) {
      throw new AppError("CONFLICT", "Some fields need correcting.", {
        academicYear: [
          `A fee for ${fee.academicYear} is already charged. Correct that charge instead.`,
        ],
      });
    }
    throw error;
  }
  return getAccount(session, studentNumber);
}

/**
 * Records money received from or for a student (staff only).
 *
 * @throws AppError: VALIDATION (e.g. a future date), NOT_FOUND, or CONFLICT
 *   if the reference is already recorded.
 */
export async function recordPayment(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<Account> {
  const staff = requireStaff(session);
  const payment = parseInput(recordPaymentSchema(collegeToday()), input);
  const student = await findStudent(studentNumber);

  await db().$transaction(async (tx) => {
    // One payment with a reference at a time, so two entries of the same
    // transfer can't both pass the check below.
    // ($executeRaw, as the lock returns void, which the adapter can't read.)
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`payment:${payment.reference}`}))`;
    // A reversed payment no longer counts, so its reference can be recorded
    // again: typically for the right student, after it was keyed against
    // the wrong one.
    const counted = await tx.payment.count({
      where: { reference: payment.reference, reversal: null },
    });
    if (counted > 0) {
      throw new AppError("CONFLICT", "Some fields need correcting.", {
        reference: [
          `A payment with reference ${payment.reference} is already recorded`,
        ],
      });
    }
    await tx.payment.create({
      data: {
        studentId: student.id,
        amountPence: payment.amountPence,
        paidOn: toDbDate(payment.paidOn),
        reference: payment.reference,
      },
    });
    await recordEvent(tx, staff, {
      action: "payment.recorded",
      studentId: student.id,
      details: {
        amountPence: payment.amountPence,
        reference: payment.reference,
      },
    });
  });
  return getAccount(session, studentNumber);
}

/**
 * Corrects a fee charge's amount and/or due date (staff only). A charge is
 * the college's own claim, so it can be corrected; an amount that differs
 * from the standard fee still needs a note saying why.
 *
 * @throws AppError: NOT_FOUND, VALIDATION.
 */
export async function correctFee(
  session: Session | null,
  feeId: string,
  input: unknown,
): Promise<Account> {
  const staff = requireStaff(session);
  const changes = parseInput(correctFeeSchema, input);
  const charge = isId(feeId)
    ? await db().feeCharge.findUnique({
        where: { id: feeId },
        include: { student: { select: { studentNumber: true } } },
      })
    : null;
  if (!charge) throw new AppError("NOT_FOUND", "There is no such fee charge.");

  // The fee the charge was raised at: the programme's may have changed since.
  const standardFee = charge.standardFeePence;
  const amountPence = changes.amountPence ?? charge.amountPence;
  const dueDate = changes.dueDate ?? fromDbDate(charge.dueDate);
  const note = changes.note === undefined ? charge.note : changes.note;
  if (amountPence !== standardFee && !note) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      note: [
        `Explain why the amount differs from the standard fee of ${formatMoney(standardFee)}`,
      ],
    });
  }
  const dueDateWrong =
    changes.dueDate && dueDateProblem(charge.academicYear, changes.dueDate);
  if (dueDateWrong) {
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      dueDate: [dueDateWrong],
    });
  }
  // Saving the form unchanged corrects nothing, so the trail records nothing.
  if (
    amountPence === charge.amountPence &&
    dueDate === fromDbDate(charge.dueDate) &&
    note === charge.note
  ) {
    return getAccount(session, charge.student.studentNumber);
  }

  await db().$transaction(async (tx) => {
    const corrected = await tx.feeCharge.update({
      where: { id: charge.id },
      data: { amountPence, dueDate: toDbDate(dueDate), note },
    });
    await recordEvent(tx, staff, {
      action: "fee.corrected",
      studentId: charge.studentId,
      details: {
        academicYear: corrected.academicYear,
        amountPence: corrected.amountPence,
        dueDate: fromDbDate(corrected.dueDate),
        from: {
          amountPence: charge.amountPence,
          dueDate: fromDbDate(charge.dueDate),
        },
        note: corrected.note,
      },
    });
  });
  return getAccount(session, charge.student.studentNumber);
}

/**
 * Reverses a payment entered by mistake (staff only). The payment stays on
 * record, marked reversed with the reason, and no longer counts towards the
 * balance. A payment can be reversed only once.
 *
 * @throws AppError: NOT_FOUND, VALIDATION, or CONFLICT if already reversed.
 */
export async function reversePayment(
  session: Session | null,
  paymentId: string,
  input: unknown,
): Promise<Account> {
  const staff = requireStaff(session);
  const { reason } = parseInput(reversePaymentSchema, input);
  const payment = isId(paymentId)
    ? await db().payment.findUnique({
        where: { id: paymentId },
        include: {
          reversal: true,
          student: { select: { studentNumber: true } },
        },
      })
    : null;
  if (!payment) throw new AppError("NOT_FOUND", "There is no such payment.");
  if (payment.reversal) {
    throw new AppError(
      "CONFLICT",
      `This payment was already reversed: ${payment.reversal.reason}`,
    );
  }

  try {
    await db().$transaction(async (tx) => {
      await tx.paymentReversal.create({
        data: { paymentId: payment.id, reason },
      });
      await recordEvent(tx, staff, {
        action: "payment.reversed",
        studentId: payment.studentId,
        details: {
          amountPence: payment.amountPence,
          reference: payment.reference,
          reason,
        },
      });
    });
  } catch (error) {
    // Two reversals at the same moment: the unique constraint lets one win.
    if (
      violatedUniqueConstraint(error) === "payment_reversals_payment_id_key"
    ) {
      throw new AppError("CONFLICT", "This payment was already reversed.");
    }
    throw error;
  }
  return getAccount(session, payment.student.studentNumber);
}

/** The account standing and figures for one student, for lists. */
export interface AccountBrief {
  standing: AccountStanding;
  summary: AccountSummary;
}

/**
 * Summarises many students' accounts at once, in two queries whatever the
 * number of students. The caller has already checked permissions.
 *
 * @param studentIds - Internal student IDs.
 * @returns Each student's standing and figures, keyed by ID.
 */
export async function summariseAccounts(
  studentIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, AccountBrief>> {
  const ids = [...studentIds];
  const [charges, payments] = await Promise.all([
    db().feeCharge.findMany({
      where: { studentId: { in: ids } },
      select: {
        studentId: true,
        academicYear: true,
        amountPence: true,
        dueDate: true,
      },
    }),
    db().payment.findMany({
      where: { studentId: { in: ids } },
      select: {
        studentId: true,
        amountPence: true,
        reversal: { select: { id: true } },
      },
    }),
  ]);

  const briefs = new Map<string, AccountBrief>();
  for (const id of ids) {
    const summary = summariseAccount(
      charges
        .filter((charge) => charge.studentId === id)
        .map((charge) => ({
          academicYear: charge.academicYear,
          amountPence: charge.amountPence,
          dueDate: fromDbDate(charge.dueDate),
        })),
      payments
        .filter((payment) => payment.studentId === id)
        .map((payment) => ({
          amountPence: payment.amountPence,
          reversed: payment.reversal !== null,
        })),
      today,
    );
    briefs.set(id, { standing: accountStanding(summary), summary });
  }
  return briefs;
}

async function findStudent(studentNumber: string) {
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: { id: true, academicYear: true, programme: true },
  });
  if (!student) throw studentNotFound(number);
  return student;
}

function studentNotFound(studentNumber: string): AppError {
  return new AppError(
    "NOT_FOUND",
    `There is no student with ID ${studentNumber}.`,
  );
}

/**
 * @param own - Whether the student is looking at their own account. They
 *   see only the payments that count: a reversed one may be another payer's
 *   transfer, keyed against them by mistake, with staff's reason.
 */
function toAccount(
  student: StudentWithAccount,
  today: CalendarDate,
  own: boolean,
): Account {
  const charges: FeeChargeView[] = student.feeCharges.map((charge) => ({
    id: charge.id,
    academicYear: charge.academicYear,
    description: charge.description,
    amountPence: charge.amountPence,
    standardFeePence: charge.standardFeePence,
    dueDate: fromDbDate(charge.dueDate),
    note: charge.note,
  }));
  const payments: PaymentView[] = student.payments.map((payment) => ({
    id: payment.id,
    amountPence: payment.amountPence,
    paidOn: fromDbDate(payment.paidOn),
    reference: payment.reference,
    recordedAt: payment.recordedAt,
    reversal: payment.reversal && {
      reason: payment.reversal.reason,
      reversedAt: payment.reversal.reversedAt,
    },
  }));
  const paymentLines = payments.map((payment) => ({
    amountPence: payment.amountPence,
    reversed: payment.reversal !== null,
  }));
  const shownPayments = own
    ? payments.filter((payment) => payment.reversal === null)
    : payments;
  const summary = summariseAccount(charges, paymentLines, today);

  return {
    studentNumber: student.studentNumber,
    academicYear: student.academicYear,
    standardFeePence: student.programme.annualFeePence,
    charges: allocatePayments(charges, totalPaid(paymentLines), today),
    payments: shownPayments,
    summary,
    standing: accountStanding(summary),
    // Only an enrolled student is charged for their year: a deferred entry
    // or a withdrawn student isn't owed a prompt to bill them.
    currentYearUncharged:
      student.status === "ENROLLED" &&
      !charges.some((charge) => charge.academicYear === student.academicYear),
  };
}
