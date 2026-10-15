// Who is viewing the registry: the list the role picker offers, and starting
// a session as staff or as a particular student.
import "server-only";

import { z } from "zod";

import type { EnrolmentStatus } from "@/domain/enrolment";
import { isStudentNumber } from "@/domain/student-number";

import { db } from "../db";
import { AppError, parseInput } from "../errors";
import type { Session } from "../session";

/** A student the role picker offers. */
export interface ViewerOption {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
}

const sessionInputSchema = z.discriminatedUnion(
  "role",
  [
    z.object({ role: z.literal("staff") }),
    z.object({
      role: z.literal("student"),
      studentNumber: z
        .string({ error: "Choose a student" })
        .trim()
        .toUpperCase()
        .refine(isStudentNumber, {
          error: "Enter a student ID such as SMS-2026-0001",
        }),
    }),
  ],
  { error: "Choose Registry staff or a student" },
);

/** Students to offer in the role picker, by name. */
export async function listViewers(): Promise<ViewerOption[]> {
  return db().student.findMany({
    select: { studentNumber: true, fullName: true, status: true },
    orderBy: [{ fullName: "asc" }, { studentNumber: "asc" }],
  });
}

/**
 * Validates a request to view the registry as staff or as a student.
 *
 * @throws AppError: VALIDATION for bad input, NOT_FOUND for an unknown student.
 */
export async function startSession(input: unknown): Promise<Session> {
  const parsed = parseInput(sessionInputSchema, input);
  if (parsed.role === "staff") return { role: "staff" };

  const student = await db().student.findUnique({
    where: { studentNumber: parsed.studentNumber },
    select: { studentNumber: true },
  });
  if (!student) {
    throw new AppError(
      "NOT_FOUND",
      `There is no student with ID ${parsed.studentNumber}.`,
    );
  }
  return { role: "student", studentNumber: student.studentNumber };
}

/** The name to show for the viewer, or null if their record no longer exists. */
export async function describeViewer(session: Session): Promise<string | null> {
  if (session.role === "staff") return "Registry staff";
  const student = await db().student.findUnique({
    where: { studentNumber: session.studentNumber },
    select: { fullName: true },
  });
  return student ? `${student.fullName} (${session.studentNumber})` : null;
}
