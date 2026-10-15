// Marks and results: classification, and what a student is allowed to see.
import { z } from "zod";

export type Classification = "FAIL" | "PASS" | "MERIT" | "DISTINCTION";

/** Lowest mark for each classification; anything below Pass is a Fail. */
export const CLASSIFICATION_BOUNDARIES = {
  PASS: 40,
  MERIT: 60,
  DISTINCTION: 70,
} as const;

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  FAIL: "Fail",
  PASS: "Pass",
  MERIT: "Merit",
  DISTINCTION: "Distinction",
};

/** Classifies a mark from 0 to 100. Boundaries are inclusive (40 is a Pass). */
export function classify(mark: number): Classification {
  if (mark >= CLASSIFICATION_BOUNDARIES.DISTINCTION) return "DISTINCTION";
  if (mark >= CLASSIFICATION_BOUNDARIES.MERIT) return "MERIT";
  if (mark >= CLASSIFICATION_BOUNDARIES.PASS) return "PASS";
  return "FAIL";
}

/** Input for entering or changing a mark. */
export const markSchema = z.object({
  mark: z
    .number({ error: "Enter a mark from 0 to 100" })
    .int("Marks are whole numbers")
    .min(0, "Marks run from 0 to 100")
    .max(100, "Marks run from 0 to 100"),
});

/** The usual reason for withholding results, offered as a preset. */
export const OUTSTANDING_FEES_REASON = "Outstanding tuition fees";

/** Input for withholding a student's results. */
export const withholdResultsSchema = z.object({
  reason: z
    .string({ error: "Give a reason" })
    .trim()
    .min(3, "Give a reason")
    .max(200, "Use 200 characters or fewer"),
});

/**
 * A student sees a result only once it is published, and only while their
 * results are not withheld.
 */
export function isVisibleToStudent(
  result: { publishedAt: Date | null },
  resultsWithheld: boolean,
): boolean {
  return !resultsWithheld && result.publishedAt !== null;
}

export type MarkInput = z.infer<typeof markSchema>;
export type WithholdResultsInput = z.infer<typeof withholdResultsSchema>;
