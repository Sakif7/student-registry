// Builders for test data, written straight to the database so each test can
// set up exactly the state it needs. Values are valid unless overridden.
import { hashPassword } from "better-auth/crypto";

import { academicYearSpan } from "@/domain/academic-year";
import { toDbDate } from "@/domain/college-time";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

let sequence = 0;

/** A number unique within the test run, for codes and emails. */
function next(): number {
  sequence += 1;
  return sequence;
}

/** Creates a programme (with no modules): three years of 120 credits. */
export async function createProgramme(
  overrides: Partial<Prisma.ProgrammeUncheckedCreateInput> = {},
) {
  const n = next();
  return db().programme.create({
    data: {
      code: `PROG-${n}`,
      title: `Programme ${n}`,
      annualFeePence: 953_500,
      years: 3,
      creditsPerYear: 120,
      ...overrides,
    },
  });
}

/**
 * Creates a 15-credit, first-semester module: in no programme, unless one is
 * given, when it joins the programme's first year as core unless the year
 * and kind are given too.
 */
export async function createModule({
  programmeId,
  yearOfStudy = 1,
  kind = "CORE",
  ...overrides
}: Partial<Prisma.ModuleCreateInput> & {
  programmeId?: string;
  yearOfStudy?: number;
  kind?: "CORE" | "OPTIONAL";
} = {}) {
  const n = next();
  return db().module.create({
    data: {
      code: `MOD-${n}`,
      title: `Module ${n}`,
      credits: 15,
      semester: "FIRST",
      ...overrides,
      programmes: programmeId
        ? { create: { programmeId, yearOfStudy, kind } }
        : undefined,
    },
  });
}

/**
 * Registers students on a module for an academic year: 2026/27 unless
 * given, the year of the factories' default deadline. They are registered as
 * the year begins, so before any of its deadlines.
 */
export async function registerStudents(
  moduleId: string,
  studentIds: readonly string[],
  academicYear = "2026/27",
) {
  await db().moduleRegistration.createMany({
    data: studentIds.map((studentId) => ({
      studentId,
      moduleId,
      academicYear,
      registeredAt: toDbDate(academicYearSpan(academicYear).first),
    })),
  });
}

/** Creates a student, and a programme for them unless one is given. */
export async function createStudent(
  overrides: Partial<Prisma.StudentUncheckedCreateInput> = {},
) {
  const n = next();
  const programmeId = overrides.programmeId ?? (await createProgramme()).id;
  return db().student.create({
    data: {
      studentNumber: `SMS-2026-${String(n).padStart(4, "0")}`,
      fullName: `Test Student ${n}`,
      email: `student${n}@example.ac.uk`,
      dateOfBirth: new Date("2004-05-17T00:00:00.000Z"),
      academicYear: "2026/27",
      ...overrides,
      programmeId,
    },
  });
}

/** Creates an assessment, with a module and programme unless one is given. */
export async function createAssessment(
  overrides: Partial<Prisma.AssessmentUncheckedCreateInput> = {},
) {
  const n = next();
  const moduleId = overrides.moduleId ?? (await createModule()).id;
  return db().assessment.create({
    data: {
      title: `Assessment ${n}`,
      deadline: new Date("2026-11-20T17:00:00.000Z"),
      ...overrides,
      moduleId,
    },
  });
}

/** Records a submission (metadata only; no file is stored). */
export async function createSubmission(
  overrides: Partial<Prisma.SubmissionUncheckedCreateInput> & {
    studentId: string;
    assessmentId: string;
  },
) {
  const n = next();
  return db().submission.create({
    data: {
      fileName: `essay-${n}.pdf`,
      storageKey: `test-${n}-${Date.now()}`,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      submittedAt: new Date("2026-11-13T10:00:00.000Z"),
      ...overrides,
    },
  });
}

/**
 * Creates a user (staff unless overridden) who can sign in with the password,
 * as the seed does: Better Auth's credential account holds its hash.
 */
export async function createUser({
  password,
  ...overrides
}: Partial<Prisma.UserUncheckedCreateInput> & { password: string }) {
  const n = next();
  const user = await db().user.create({
    data: {
      name: `Staff Member ${n}`,
      email: `staff${n}@college.example`,
      role: "staff",
      emailVerified: true,
      ...overrides,
    },
  });
  await db().account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(password),
    },
  });
  return user;
}
