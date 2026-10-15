// Builders for test data, written straight to the database so each test can
// set up exactly the state it needs. Values are valid unless overridden.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

let sequence = 0;

/** A number unique within the test run, for codes and emails. */
function next(): number {
  sequence += 1;
  return sequence;
}

/** Creates a programme (with no modules). */
export async function createProgramme(
  overrides: Partial<Prisma.ProgrammeUncheckedCreateInput> = {},
) {
  const n = next();
  return db().programme.create({
    data: {
      code: `PROG-${n}`,
      title: `Programme ${n}`,
      annualFeePence: 953_500,
      ...overrides,
    },
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
  const moduleId =
    overrides.moduleId ??
    (
      await db().module.create({
        data: {
          code: `MOD-${n}`,
          title: `Module ${n}`,
          programmeId: (await createProgramme()).id,
        },
      })
    ).id;
  return db().assessment.create({
    data: {
      title: `Assessment ${n}`,
      deadline: new Date("2026-11-20T17:00:00.000Z"),
      ...overrides,
      moduleId,
    },
  });
}
