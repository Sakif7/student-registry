// Student accounts: fee charges, payments, and the balance and overdue amount
// derived from them. Balances are computed on every read, never stored, so a
// recorded payment shows in the balance immediately and can never drift.
import "server-only";

import {
  addDays,
  type CalendarDate,
  fromDbDate,
  toDbDate,
} from "@/domain/college-time";
import {
  type AccountStanding,
  accountStanding,
  type AccountSummary,
  type AllocatedCharge,
  allocatePayments,
  assignFeeSchema,
  DEFAULT_FEE_DUE_DAYS,
  feeDescription,
  recordPaymentSchema,
  summariseAccount,
  totalPaid,
} from "@/domain/fees";
import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";

import { collegeToday } from "../college";
import { db } from "../db";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { requireStaff, requireStaffOrSelf, type Session } from "../session";

export interface FeeChargeView {
  id: string;
  academicYear: string;
  description: string;
  amountPence: number;
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
  requireStaffOrSelf(session, number);
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    include: accountInclude,
  });
  if (!student) throw studentNotFound(number);
  return toAccount(student, collegeToday());
}

/**
 * Charges a student the fee for an academic year (staff only). The amount
 * defaults to the programme's standard fee; a different amount needs a note
 * saying why (e.g. a scholarship).
 *
 * @throws AppError: VALIDATION, NOT_FOUND, or CONFLICT if that academic year
 *   is already charged.
 */
export async function assignFee(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<Account> {
  requireStaff(session);
  const fee = parseInput(assignFeeSchema, input);
  const student = await findStudent(studentNumber);
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
    await db().feeCharge.create({
      data: {
        studentId: student.id,
        academicYear: fee.academicYear,
        description: feeDescription(fee.academicYear, student.programme.title),
        amountPence,
        dueDate: toDbDate(
          fee.dueDate ?? addDays(collegeToday(), DEFAULT_FEE_DUE_DAYS),
        ),
        note: fee.note,
      },
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
  requireStaff(session);
  const payment = parseInput(recordPaymentSchema(collegeToday()), input);
  const student = await findStudent(studentNumber);

  try {
    await db().payment.create({
      data: {
        studentId: student.id,
        amountPence: payment.amountPence,
        paidOn: toDbDate(payment.paidOn),
        reference: payment.reference,
      },
    });
  } catch (error) {
    if (violatedUniqueConstraint(error) === "payments_reference_key") {
      throw new AppError("CONFLICT", "Some fields need correcting.", {
        reference: [
          `A payment with reference ${payment.reference} is already recorded`,
        ],
      });
    }
    throw error;
  }
  return getAccount(session, studentNumber);
}

async function findStudent(studentNumber: string) {
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: { id: true, programme: true },
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

function toAccount(student: StudentWithAccount, today: CalendarDate): Account {
  const charges: FeeChargeView[] = student.feeCharges.map((charge) => ({
    id: charge.id,
    academicYear: charge.academicYear,
    description: charge.description,
    amountPence: charge.amountPence,
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
  const summary = summariseAccount(charges, paymentLines, today);

  return {
    studentNumber: student.studentNumber,
    academicYear: student.academicYear,
    standardFeePence: student.programme.annualFeePence,
    charges: allocatePayments(charges, totalPaid(paymentLines), today),
    payments,
    summary,
    standing: accountStanding(summary),
    currentYearUncharged: !charges.some(
      (charge) => charge.academicYear === student.academicYear,
    ),
  };
}
