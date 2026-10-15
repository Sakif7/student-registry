// Money is held as integer pence (GBP) everywhere, never as floating point.
// People type pounds; the API and the database deal only in pence.
import { z } from "zod";

/** Largest single amount accepted (£100,000), to catch a mistyped extra digit. */
export const MAX_AMOUNT_PENCE = 10_000_000;

// Digits with optional thousands separators, then up to two decimal places.
const POUNDS = /^£?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses an amount typed in pounds, e.g. "£1,250.50" or "1250.5", into pence.
 * Uses string arithmetic, so floating-point rounding can't creep in.
 *
 * @returns The amount in pence, or null if the input isn't a valid amount.
 */
export function parsePounds(input: string): number | null {
  const match = POUNDS.exec(input.trim());
  if (!match) return null;
  const pounds = Number(match[1].replaceAll(",", ""));
  const pence = Number((match[2] ?? "").padEnd(2, "0"));
  const total = pounds * 100 + pence;
  return Number.isSafeInteger(total) ? total : null;
}

/** Pence as a plain pounds value for a form field, e.g. 125050 → "1250.50". */
export function penceToPoundsInput(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const absolute = Math.abs(pence);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * A form field where a person types pounds, e.g. "1,250.50". It validates the
 * text and outputs pence, then applies the given amount rules.
 */
export function poundsField<Rules extends z.ZodType<number, number>>(
  rules: Rules,
) {
  return z
    .string({ error: "Enter an amount" })
    .transform((value, ctx) => {
      const pence = parsePounds(value);
      if (pence === null) {
        ctx.addIssue({
          code: "custom",
          message: "Enter an amount in pounds, e.g. 1250.00",
        });
        return z.NEVER;
      }
      return pence;
    })
    .pipe(rules);
}

/** An amount of money received: at least 1p. */
export const paymentAmountSchema = z
  .number({ error: "Enter an amount" })
  .int("Amounts are in whole pence")
  .min(1, "The amount must be more than £0.00")
  .max(MAX_AMOUNT_PENCE, "The amount must be £100,000.00 or less");

/** An amount charged: zero is allowed, e.g. for a full scholarship. */
export const chargeAmountSchema = z
  .number({ error: "Enter an amount" })
  .int("Amounts are in whole pence")
  .min(0, "The amount can't be negative")
  .max(MAX_AMOUNT_PENCE, "The amount must be £100,000.00 or less");
