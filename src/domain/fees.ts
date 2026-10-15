// Student accounts: fee charges, payments, the balance and what is overdue.
// Balances are always computed from the charges and payments, never stored.
import { z } from "zod";

import { academicYearSchema } from "./academic-year";
import {
  type CalendarDate,
  calendarDateSchema,
  daysBetween,
} from "./college-time";
import { chargeAmountSchema, paymentAmountSchema } from "./money";

/** A new fee charge is due this many days after it is raised. */
export const DEFAULT_FEE_DUE_DAYS = 30;

export interface ChargeLine {
  amountPence: number;
  dueDate: CalendarDate;
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

/**
 * Summarises an account on a given day. Payments clear the oldest charge
 * first, so whatever is overdue is the oldest debt. A charge due today is not
 * yet overdue.
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
  const paidPence = sum(
    payments
      .filter((payment) => !payment.reversed)
      .map((payment) => payment.amountPence),
  );

  let unallocated = paidPence;
  let overduePence = 0;
  let overdueSince: CalendarDate | null = null;
  const oldestFirst = [...charges].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  for (const charge of oldestFirst) {
    const covered = Math.min(unallocated, charge.amountPence);
    unallocated -= covered;
    const unpaid = charge.amountPence - covered;
    if (unpaid > 0 && charge.dueDate < today) {
      overduePence += unpaid;
      overdueSince ??= charge.dueDate;
    }
  }

  return {
    chargedPence,
    paidPence,
    balancePence: chargedPence - paidPence,
    overduePence,
    overdueSince,
    daysOverdue: overdueSince ? daysBetween(overdueSince, today) : 0,
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

/** Input for correcting a fee charge's amount and/or due date. */
export const correctFeeSchema = z
  .object({
    amountPence: chargeAmountSchema.optional(),
    dueDate: calendarDateSchema.optional(),
    note: z
      .string()
      .trim()
      .max(200, "Use 200 characters or fewer")
      .optional()
      .transform((value) => value || undefined),
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
