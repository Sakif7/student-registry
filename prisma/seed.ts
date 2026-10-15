// Demo data for local development and end-to-end tests. Every person and
// reference is fictitious, and dates are relative to the day the seed runs, so
// recent enrolments, deferrals and withdrawals always look recent. Running the
// seed replaces all existing data.
import { PrismaPg } from "@prisma/adapter-pg";

import {
  academicYearOn,
  formatAcademicYear,
  startYearOf,
} from "@/domain/academic-year";
import { todayIn, toDbDate } from "@/domain/college-time";
import type { EnrolmentStatus } from "@/domain/enrolment";
import { formatStudentNumber } from "@/domain/student-number";
import { PrismaClient } from "@/generated/prisma/client";

const MS_PER_DAY = 86_400_000;

/** Programmes with their modules. Fees are the standard annual tuition fee. */
const PROGRAMMES = [
  {
    code: "BSC-CS",
    title: "BSc (Hons) Computer Science",
    annualFeePence: 953_500,
    modules: [
      { code: "CS4001", title: "Programming Fundamentals" },
      { code: "CS4002", title: "Databases" },
      { code: "CS5003", title: "Web Development" },
    ],
  },
  {
    code: "BA-BM",
    title: "BA (Hons) Business Management",
    annualFeePence: 953_500,
    modules: [
      { code: "BM4001", title: "Principles of Management" },
      { code: "BM4002", title: "Financial Accounting" },
    ],
  },
  {
    code: "MSC-DS",
    title: "MSc Data Science",
    annualFeePence: 1_195_000,
    modules: [
      { code: "DS7001", title: "Machine Learning" },
      { code: "DS7002", title: "Data Engineering" },
    ],
  },
] as const;

type ProgrammeCode = (typeof PROGRAMMES)[number]["code"];

interface CastMember {
  fullName: string;
  email: string;
  dateOfBirth: string;
  programme: ProgrammeCode;
  /** Academic years before the current one in which they first enrolled. */
  intakeYearsAgo: number;
  /** Academic years before the current one of their current session. */
  sessionYearsAgo: number;
  /** Status changes, oldest first; the first is the status at creation. */
  history: { status: EnrolmentStatus; daysAgo: number; reason?: string }[];
}

/**
 * The students, keyed by a short handle that later sections of the seed and
 * the manual test guide (.docs/TESTING.md) refer to.
 */
const CAST = {
  amelia: {
    fullName: "Amelia Hart",
    email: "amelia.hart@student.example",
    dateOfBirth: "2003-04-11",
    programme: "BSC-CS",
    intakeYearsAgo: 1,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 400 }],
  },
  kwame: {
    fullName: "Kwame Mensah",
    email: "kwame.mensah@student.example",
    dateOfBirth: "2004-08-30",
    programme: "BA-BM",
    intakeYearsAgo: 1,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 395 }],
  },
  mohammed: {
    fullName: "Mohammed Al-Farsi",
    email: "mohammed.al-farsi@student.example",
    dateOfBirth: "2002-01-25",
    programme: "BSC-CS",
    intakeYearsAgo: 3,
    sessionYearsAgo: 1,
    history: [
      { status: "ENROLLED", daysAgo: 1135 },
      { status: "COMPLETED", daysAgo: 110 },
    ],
  },
  oliver: {
    fullName: "Oliver Bennett",
    email: "oliver.bennett@student.example",
    dateOfBirth: "2007-02-23",
    programme: "BSC-CS",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 40 }],
  },
  priya: {
    fullName: "Priya Natarajan",
    email: "priya.natarajan@student.example",
    dateOfBirth: "2006-11-02",
    programme: "BSC-CS",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 40 }],
  },
  sofia: {
    fullName: "Sofia Rossi",
    email: "sofia.rossi@student.example",
    dateOfBirth: "2006-06-19",
    programme: "BA-BM",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [
      { status: "ENROLLED", daysAgo: 38 },
      {
        status: "DEFERRED",
        daysAgo: 12,
        reason: "Medical grounds; expects to return next September",
      },
    ],
  },
  liam: {
    fullName: "Liam O'Connor",
    email: "liam.oconnor@student.example",
    dateOfBirth: "1999-03-07",
    programme: "MSC-DS",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 36 }],
  },
  hannah: {
    fullName: "Hannah Kowalski",
    email: "hannah.kowalski@student.example",
    dateOfBirth: "2001-12-14",
    programme: "MSC-DS",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [
      { status: "ENROLLED", daysAgo: 36 },
      {
        status: "WITHDRAWN",
        daysAgo: 8,
        reason: "Accepted a full-time job offer",
      },
    ],
  },
  chloe: {
    fullName: "Chloé Dubois",
    email: "chloe.dubois@student.example",
    dateOfBirth: "2006-09-05",
    programme: "BA-BM",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 37 }],
  },
  arjun: {
    fullName: "Arjun Mehta",
    email: "arjun.mehta@student.example",
    dateOfBirth: "2000-07-21",
    programme: "MSC-DS",
    intakeYearsAgo: 0,
    sessionYearsAgo: 0,
    history: [{ status: "ENROLLED", daysAgo: 35 }],
  },
} satisfies Record<string, CastMember>;

type CastKey = keyof typeof CAST;

/** What the seed knows about a seeded student. */
interface SeededStudent {
  id: string;
  studentNumber: string;
  academicYear: string;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const now = new Date();
    const today = todayIn(process.env.APP_TIME_ZONE ?? "Europe/London", now);
    const currentYear = startYearOf(academicYearOn(today));

    await deleteEverything(prisma);
    const programmeIds = await seedProgrammes(prisma);
    const students = await seedStudents(prisma, programmeIds, currentYear, now);
    console.log(
      `Seeded ${PROGRAMMES.length} programmes and ${Object.keys(students).length} students.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Empties every table except Prisma's migration history. */
async function deleteEverything(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // Table names come from the database catalogue, not from user input.
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

async function seedProgrammes(
  prisma: PrismaClient,
): Promise<Record<ProgrammeCode, string>> {
  const ids = {} as Record<ProgrammeCode, string>;
  for (const { modules, ...programme } of PROGRAMMES) {
    const created = await prisma.programme.create({
      data: { ...programme, modules: { create: [...modules] } },
    });
    ids[programme.code] = created.id;
  }
  return ids;
}

/**
 * Creates the cast with their status histories. Student numbers follow the
 * cast order within each intake year, and the counters are left where the
 * app's own enrolment would continue from.
 */
async function seedStudents(
  prisma: PrismaClient,
  programmeIds: Record<ProgrammeCode, string>,
  currentYear: number,
  now: Date,
): Promise<Record<CastKey, SeededStudent>> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);
  const lastSequence = new Map<number, number>();
  const seeded = {} as Record<CastKey, SeededStudent>;

  for (const [key, member] of Object.entries(CAST) as [CastKey, CastMember][]) {
    const intakeYear = currentYear - member.intakeYearsAgo;
    const sequence = (lastSequence.get(intakeYear) ?? 0) + 1;
    lastSequence.set(intakeYear, sequence);
    const createdDaysAgo = member.history[0]?.daysAgo ?? 0;
    const finalStatus = member.history.at(-1)?.status ?? "ENROLLED";
    const academicYear = formatAcademicYear(
      currentYear - member.sessionYearsAgo,
    );

    const student = await prisma.student.create({
      data: {
        studentNumber: formatStudentNumber(intakeYear, sequence),
        fullName: member.fullName,
        email: member.email,
        dateOfBirth: toDbDate(member.dateOfBirth),
        programmeId: programmeIds[member.programme],
        academicYear,
        status: finalStatus,
        createdAt: daysAgo(createdDaysAgo),
        statusChanges: {
          create: member.history.map((step, index) => ({
            fromStatus: index === 0 ? null : member.history[index - 1]?.status,
            toStatus: step.status,
            reason: step.reason,
            changedAt: daysAgo(step.daysAgo),
          })),
        },
      },
    });
    seeded[key] = {
      id: student.id,
      studentNumber: student.studentNumber,
      academicYear,
    };
  }

  for (const [year, lastValue] of lastSequence) {
    await prisma.studentNumberCounter.create({ data: { year, lastValue } });
  }
  return seeded;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
