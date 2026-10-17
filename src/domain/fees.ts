// Student accounts: fee charges, payments, the balance and what is overdue.
// Balances are always computed from the charges and payments, never stored.
import { z } from "zod";

import { academicYearSchema, academicYearSpan } from "./academic-year";
import {
  addDays,
  type CalendarDate,
  calendarDateSchema,
  daysBetween,
} from "./college-time";
import { chargeAmountSchema, paymentAmountSchema } from "./money";

/** A new fee charge is due this many days after it is raised. */
export const DEFAULT_FEE_DUE_DAYS = 30;

/**
 * When a newly charged fee falls due unless staff say otherwise: 30 days
 * on, counted from today, or from the start of its academic year if that is
 * later, so a fee charged ahead for next year isn't overdue before the year
 * begins.
 */
export function defaultDueDate(
  today: CalendarDate,
  academicYear: string,
): CalendarDate {
  const { first } = academicYearSpan(academicYear);
  return addDays(today > first ? today : first, DEFAULT_FEE_DUE_DAYS);
}

export interface ChargeLine {
  amountPence: number;
  dueDate: CalendarDate;
  /** The year it is for, e.g. "2026/27": payments clear the oldest first. */
  academicYear?: string;
}

export interface PaymentLine {
  amountPence: number;
  /** A reversed payment stays on record but no longer counts. */
  reversed: boolean;
}

export interface AccountSummary {
  chargedPence: number;
  paidPence: number;
  /** Charged minus paid. Negative means the student is in credit. */
  balancePence: number;
  /** What is still unpaid on charges whose due date has passed. */
  overduePence: number;
  /** Due date of the oldest charge that is past due and not fully paid. */
  overdueSince: CalendarDate | null;
  daysOverdue: number;
}

/** A charge with the share of payments applied to it. */
export type AllocatedCharge<Charge extends ChargeLine> = Charge & {
  paidPence: number;
  outstandingPence: number;
  /** Past its due date and not fully paid. */
  overdue: boolean;
};

/**
 * Applies payments to charges, oldest academic year first, so whatever is
 * still outstanding is the newest debt. A charge due today is not yet
 * overdue.
 *
 * @param charges - The student's fee charges, in any order.
 * @param paidPence - The total of the student's valid payments.
 * @param today - The college's current date.
 * @returns The charges, oldest due date first, with what is paid of each.
 */
export function allocatePayments<Charge extends ChargeLine>(
  charges: readonly Charge[],
  paidPence: number,
  today: CalendarDate,
): AllocatedCharge<Charge>[] {
  let unallocated = paidPence;
  // The oldest academic year first, then the earliest due date. By year,
  // because correcting a charge's due date mustn't move payments between
  // years; a student has one charge a year, so the order is always the same.
  return [...charges]
    .sort(
      (a, b) =>
        (a.academicYear ?? "").localeCompare(b.academicYear ?? "") ||
        a.dueDate.localeCompare(b.dueDate),
    )
    .map((charge) => {
      const covered = Math.max(0, Math.min(unallocated, charge.amountPence));
      unallocated -= covered;
      const outstandingPence = charge.amountPence - covered;
      return {
        ...charge,
        paidPence: covered,
        outstandingPence,
        overdue: outstandingPence > 0 && charge.dueDate < today,
      };
    });
}

/**
 * The next charge to pay before it becomes overdue: the earliest due date
 * with something still unpaid, among charges not yet overdue.
 *
 * @param charges - Charges with payments applied (see allocatePayments).
 */
export function nextChargeDue<Charge extends ChargeLine>(
  charges: readonly AllocatedCharge<Charge>[],
): AllocatedCharge<Charge> | null {
  return (
    [...charges]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .find((charge) => charge.outstandingPence > 0 && !charge.overdue) ?? null
  );
}

/** The total of the payments that count (not reversed). */
export function totalPaid(payments: readonly PaymentLine[]): number {
  return sum(
    payments
      .filter((payment) => !payment.reversed)
      .map((payment) => payment.amountPence),
  );
}

/**
 * Summarises an account on a given day: balance, and what is overdue and since
 * when. Payments clear the oldest charge first (see allocatePayments).
 *
 * @param charges - The student's fee charges, in any order.
 * @param payments - The student's payments, including reversed ones.
 * @param today - The college's current date.
 */
export function summariseAccount(
  charges: readonly ChargeLine[],
  payments: readonly PaymentLine[],
  today: CalendarDate,
): AccountSummary {
  const chargedPence = sum(charges.map((charge) => charge.amountPence));
  const paidPence = totalPaid(payments);
  const overdue = allocatePayments(charges, paidPence, today).filter(
    (charge) => charge.overdue,
  );
  const overdueSince = overdue[0]?.dueDate ?? null;

  return {
    chargedPence,
    paidPence,
    balancePence: chargedPence - paidPence,
    overduePence: sum(overdue.map((charge) => charge.outstandingPence)),
    overdueSince,
    daysOverdue: overdueSince ? daysBetween(overdueSince, today) : 0,
  };
}

/** One academic year's fees across students' accounts. */
export interface YearFees {
  chargedPence: number;
  paidPence: number;
  /** Unpaid on charges past their due date. */
  overduePence: number;
  /** Unpaid on charges not yet past their due date. */
  notYetDuePence: number;
}

/**
 * Totals one academic year's charges across students' accounts: how much of
 * them is paid, overdue and not yet due. Each student's payments clear their
 * oldest charges first (see allocatePayments), so a payment counts towards
 * the year only once the student's older debts are paid, and credit left over
 * counts towards nothing.
 *
 * @param accounts - Each student's charges, with the year each is for, and
 *   payments.
 * @param academicYear - The year to total, e.g. "2026/27".
 * @param today - The college's current date.
 */
export function summariseYearFees(
  accounts: readonly {
    charges: readonly (ChargeLine & { academicYear: string })[];
    payments: readonly PaymentLine[];
  }[],
  academicYear: string,
  today: CalendarDate,
): YearFees {
  const lines = accounts.flatMap(({ charges, payments }) =>
    allocatePayments(charges, totalPaid(payments), today).filter(
      (charge) => charge.academicYear === academicYear,
    ),
  );
  const unpaid = (overdue: boolean) =>
    sum(
      lines
        .filter((line) => line.overdue === overdue)
        .map((line) => line.outstandingPence),
    );
  return {
    chargedPence: sum(lines.map((line) => line.amountPence)),
    paidPence: sum(lines.map((line) => line.paidPence)),
    overduePence: unpaid(true),
    notYetDuePence: unpaid(false),
  };
}

/** One word for the state of an account, for badges and filters. */
export type AccountStanding = "OVERDUE" | "DUE" | "PAID" | "CREDIT" | "NONE";

export const ACCOUNT_STANDING_LABELS: Record<AccountStanding, string> = {
  OVERDUE: "Overdue",
  DUE: "Balance due",
  PAID: "Paid in full",
  CREDIT: "In credit",
  NONE: "No fees",
};

/** Classifies a summarised account. */
export function accountStanding(summary: AccountSummary): AccountStanding {
  if (summary.overduePence > 0) return "OVERDUE";
  if (summary.balancePence > 0) return "DUE";
  if (summary.balancePence < 0) return "CREDIT";
  return summary.chargedPence > 0 ? "PAID" : "NONE";
}

/**
 * Normalises a bank or receipt reference so the same transfer can't be
 * entered twice by varying case or spacing.
 */
export function normalisePaymentReference(reference: string): string {
  return reference.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Describes a fee charge, e.g. "Tuition fee 2026/27: MSc Data Science". */
export function feeDescription(
  academicYear: string,
  programmeTitle: string,
): string {
  return `Tuition fee ${academicYear}: ${programmeTitle}`;
}

/** Input for recording a payment; `today` is the college's date. */
export function recordPaymentSchema(today: CalendarDate) {
  return z.object({
    amountPence: paymentAmountSchema,
    paidOn: calendarDateSchema.refine((date) => date <= today, {
      error: "The payment date can't be in the future",
    }),
    reference: z
      .string({ error: "Enter the bank or receipt reference" })
      .trim()
      .min(1, "Enter the bank or receipt reference")
      .max(64, "Use 64 characters or fewer")
      .transform(normalisePaymentReference),
  });
}

/**
 * Input for assigning a fee. Without an amount the programme's standard fee
 * applies; without a due date, the default due date does.
 */
export const assignFeeSchema = z.object({
  academicYear: academicYearSchema,
  amountPence: chargeAmountSchema.optional(),
  dueDate: calendarDateSchema.optional(),
  note: z
    .string()
    .trim()
    .max(200, "Use 200 characters or fewer")
    .optional()
    .transform((value) => value || undefined),
});

/**
 * Input for correcting a fee charge's amount and/or due date. An empty note
 * removes the one on record (null); leaving the note out keeps it.
 */
export const correctFeeSchema = z
  .object({
    amountPence: chargeAmountSchema.optional(),
    dueDate: calendarDateSchema.optional(),
    note: z
      .string()
      .trim()
      .max(200, "Use 200 characters or fewer")
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
  })
  .refine(
    (input) => input.amountPence !== undefined || input.dueDate !== undefined,
    { error: "Change the amount or the due date" },
  );

/** Input for reversing a payment entered by mistake. */
export const reversePaymentSchema = z.object({
  reason: z
    .string({ error: "Give a reason for the reversal" })
    .trim()
    .min(3, "Give a reason for the reversal")
    .max(500, "Use 500 characters or fewer"),
});

export type RecordPaymentInput = z.infer<
  ReturnType<typeof recordPaymentSchema>
>;
export type AssignFeeInput = z.infer<typeof assignFeeSchema>;
export type CorrectFeeInput = z.infer<typeof correctFeeSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
