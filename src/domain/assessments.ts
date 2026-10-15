// Assessments: the work staff set for a module, and its deadline. Deadlines are
// entered as wall-clock times in the college's time zone and stored as
// instants.
import { z } from "zod";

import {
  type WallTime,
  wallTimeSchema,
  wallTimeToInstant,
} from "./college-time";

export const assessmentTitleSchema = z
  .string({ error: "Enter a title" })
  .trim()
  .min(1, "Enter a title")
  .max(120, "Use 120 characters or fewer");

const moduleCodeSchema = z
  .string({ error: "Choose a module" })
  .trim()
  .min(1, "Choose a module");

/**
 * Resolves a deadline typed as a wall-clock time in the college's time zone.
 * The deadline must be in the future: one already past would make every
 * submission late.
 */
function resolveDeadline(
  wallTime: WallTime,
  timeZone: string,
  now: Date,
): { instant: Date } | { problem: string } {
  const instant = wallTimeToInstant(wallTime, timeZone);
  if (!instant) {
    return {
      problem:
        "The clocks go forward at that time, so it never happens. Choose another time.",
    };
  }
  if (instant <= now) return { problem: "The deadline must be in the future" };
  return { instant };
}

/**
 * A deadline typed as a wall-clock time in the college's time zone, e.g.
 * "2026-11-20T17:00". Outputs the instant it denotes.
 *
 * @param timeZone - The college's IANA time zone.
 * @param now - The current instant.
 */
export function deadlineSchema(timeZone: string, now: Date) {
  return wallTimeSchema.transform((wallTime, ctx) => {
    const deadline = resolveDeadline(wallTime, timeZone, now);
    if ("problem" in deadline) {
      ctx.addIssue({ code: "custom", message: deadline.problem });
      return z.NEVER;
    }
    return deadline.instant;
  });
}

/**
 * The deadline field of a form: the same checks as deadlineSchema, made when
 * the form is submitted, but the value stays the wall-clock time as typed,
 * because that is what the API takes.
 */
export function deadlineFieldSchema(timeZone: string) {
  return wallTimeSchema.superRefine((wallTime, ctx) => {
    const deadline = resolveDeadline(wallTime, timeZone, new Date());
    if ("problem" in deadline) {
      ctx.addIssue({ code: "custom", message: deadline.problem });
    }
  });
}

/** Input for setting an assessment. */
export function createAssessmentSchema(timeZone: string, now: Date) {
  return z.object({
    moduleCode: moduleCodeSchema,
    title: assessmentTitleSchema,
    deadline: deadlineSchema(timeZone, now),
  });
}

/** The set-an-assessment form: the API's rules, with the deadline as typed. */
export function assessmentFormSchema(timeZone: string) {
  return z.object({
    moduleCode: moduleCodeSchema,
    title: assessmentTitleSchema,
    deadline: deadlineFieldSchema(timeZone),
  });
}

/**
 * Input for changing an assessment: a new title or deadline, or `closed` to
 * stop (true) or resume (false) accepting submissions.
 */
export function updateAssessmentSchema(timeZone: string, now: Date) {
  return z
    .object({
      title: assessmentTitleSchema.optional(),
      deadline: deadlineSchema(timeZone, now).optional(),
      closed: z.boolean({ error: "Use true or false" }).optional(),
    })
    .refine(
      (changes) =>
        changes.title !== undefined ||
        changes.deadline !== undefined ||
        changes.closed !== undefined,
      { error: "Nothing to update" },
    );
}

export type CreateAssessmentInput = z.infer<
  ReturnType<typeof createAssessmentSchema>
>;
export type UpdateAssessmentInput = z.infer<
  ReturnType<typeof updateAssessmentSchema>
>;
