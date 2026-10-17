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

/** Every classification, lowest first. */
export const CLASSIFICATIONS = [
  "FAIL",
  "PASS",
  "MERIT",
  "DISTINCTION",
] as const satisfies readonly Classification[];

/** Classifies a mark from 0 to 100. Boundaries are inclusive (40 is a Pass). */
export function classify(mark: number): Classification {
  if (mark >= CLASSIFICATION_BOUNDARIES.DISTINCTION) return "DISTINCTION";
  if (mark >= CLASSIFICATION_BOUNDARIES.MERIT) return "MERIT";
  if (mark >= CLASSIFICATION_BOUNDARIES.PASS) return "PASS";
  return "FAIL";
}

/** How many of the marks fall in each classification. */
export function countByClassification(
  marks: readonly number[],
): Record<Classification, number> {
  const counts = { FAIL: 0, PASS: 0, MERIT: 0, DISTINCTION: 0 };
  for (const mark of marks) counts[classify(mark)] += 1;
  return counts;
}

/** A mark: a whole number from 0 to 100. */
const markValueSchema = z
  .number({ error: "Enter a mark from 0 to 100" })
  .int("Marks are whole numbers")
  .min(0, "Marks run from 0 to 100")
  .max(100, "Marks run from 0 to 100");

/** Input for entering or changing a mark. */
export const markSchema = z.object({ mark: markValueSchema });

/**
 * Input for saving an assessment's marksheet: the marks that changed, keyed by
 * student ID. A null mark removes the student's mark, e.g. one entered
 * against the wrong student.
 */
export const marksheetSchema = z.object({
  marks: z
    .record(
      z.string().regex(/^SMS-\d{4}-\d{4,}$/i),
      markValueSchema.nullable(),
      {
        error: (issue) =>
          issue.code === "invalid_key" ? "Not a student ID" : undefined,
      },
    )
    .refine((marks) => Object.keys(marks).length > 0, {
      error: "There are no marks to save",
    })
    .transform((marks) =>
      Object.fromEntries(
        Object.entries(marks).map(([number, mark]) => [
          number.toUpperCase(),
          mark,
        ]),
      ),
    ),
});

/**
 * A mark as typed into the marksheet: blank for no mark, or a whole number
 * from 0 to 100.
 */
export const markFieldSchema = z
  .string()
  .trim()
  .regex(/^\d*$/, "Enter a whole number from 0 to 100")
  .transform((text) => (text === "" ? null : Number(text)))
  .pipe(markValueSchema.nullable());

/** The usual reason for withholding results, offered as a preset. */
export const OUTSTANDING_FEES_REASON = "Outstanding tuition fees";

/**
 * Input for publishing a student's marks: how many the person publishing
 * saw waiting. If that has changed (a colleague saved another), nothing is
 * published, as a published mark can't be taken back.
 */
export const publishResultsSchema = z.object({
  expected: z.number().int().min(0).optional(),
});

/** Input for withholding a student's results. */
export const withholdResultsSchema = z.object({
  reason: z
    .string({ error: "Give a reason" })
    .trim()
    .min(3, "Give a reason")
    .max(200, "Use 200 characters or fewer"),
});

/**
 * Whether an assessment can be marked yet: once its deadline has passed, or
 * once staff close it. Before then, students can still submit or replace
 * their work, so a mark (and a published one above all) could describe work
 * that is about to change.
 */
export function canEnterMarks(
  assessment: {
    deadline: Date;
    closedAt: Date | null;
  },
  now: Date,
): boolean {
  return assessment.closedAt !== null || now > assessment.deadline;
}

export const MARKS_NOT_YET_MESSAGE =
  "Marks can be entered once the deadline has passed, or once the assessment is closed to submissions: until then, students can still submit or replace their work.";

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
