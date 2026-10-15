// Demo data for local development and end-to-end tests. Every person and
// reference is fictitious, and dates are relative to the day the seed runs, so
// recent enrolments, deferrals, withdrawals and deadlines always look recent.
// Running the seed replaces all existing data, uploaded files included.
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  academicYearOn,
  formatAcademicYear,
  startYearOf,
} from "@/domain/academic-year";
import {
  addDays,
  type CalendarDate,
  todayIn,
  toDbDate,
  wallTimeToInstant,
} from "@/domain/college-time";
import type { EnrolmentStatus } from "@/domain/enrolment";
import { feeDescription } from "@/domain/fees";
import { OUTSTANDING_FEES_REASON } from "@/domain/results";
import { formatStudentNumber } from "@/domain/student-number";
import { ACCEPTED_DOCUMENTS } from "@/domain/submissions";
import { PrismaClient } from "@/generated/prisma/client";

import { sampleDocx, samplePdf } from "./sample-documents";

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
  programme: ProgrammeCode;
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
    const timeZone = process.env.APP_TIME_ZONE ?? "Europe/London";
    const today = todayIn(timeZone, now);
    const currentYear = startYearOf(academicYearOn(today));
    const uploadDir = resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");

    await deleteStoredFiles(prisma, uploadDir);
    await deleteEverything(prisma);
    const programmeIds = await seedProgrammes(prisma);
    const students = await seedStudents(prisma, programmeIds, currentYear, now);
    const accounts = await seedAccounts(
      prisma,
      students,
      currentYear,
      today,
      now,
    );
    const work = await seedAssessments(prisma, students, {
      today,
      now,
      timeZone,
      uploadDir,
    });
    await seedHolds(prisma, students, now);
    console.log(
      `Seeded ${PROGRAMMES.length} programmes, ${Object.keys(students).length} students, ${accounts.charges} fee charges, ${accounts.payments} payments, ${work.assessments} assessments, ${work.submissions} submissions and ${work.marks} marks.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Stored files are named with random UUIDs; anything else is left alone.
const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Deletes the stored files of the submissions about to be removed. */
async function deleteStoredFiles(
  prisma: PrismaClient,
  uploadDir: string,
): Promise<void> {
  const submissions = await prisma.submission.findMany({
    select: { storageKey: true },
  });
  for (const { storageKey } of submissions) {
    if (STORAGE_KEY.test(storageKey)) {
      await rm(join(uploadDir, storageKey), { force: true });
    }
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
      programme: member.programme,
    };
  }

  for (const [year, lastValue] of lastSequence) {
    await prisma.studentNumberCounter.create({ data: { year, lastValue } });
  }
  return seeded;
}

interface SeedAccount {
  /** One charge per academic year; yearsAgo 0 is the current year. */
  charges: {
    yearsAgo: number;
    /** Days from today; negative means the due date has passed. */
    dueInDays: number;
    /** Defaults to the programme's standard fee. */
    amountPence?: number;
    note?: string;
  }[];
  payments: {
    amountPence: number;
    daysAgo: number;
    reference: string;
    reversed?: { reason: string; daysAgo: number };
  }[];
}

/**
 * Each account shows a different situation: overdue (by different amounts and
 * for different lengths of time), paid in full, in credit, due but not yet
 * overdue, a fee corrected to zero for a deferral, and a reversed payment.
 */
const ACCOUNTS: Record<CastKey, SeedAccount> = {
  amelia: {
    charges: [
      { yearsAgo: 1, dueInDays: -380 },
      { yearsAgo: 0, dueInDays: -20 },
    ],
    payments: [
      { amountPence: 476_750, daysAgo: 385, reference: "BACS AH 2025-1" },
      { amountPence: 476_750, daysAgo: 300, reference: "BACS AH 2025-2" },
    ],
  },
  kwame: {
    charges: [
      { yearsAgo: 1, dueInDays: -375 },
      { yearsAgo: 0, dueInDays: -10 },
    ],
    payments: [
      { amountPence: 953_500, daysAgo: 376, reference: "SLC KM 2025" },
      { amountPence: 500_000, daysAgo: 15, reference: "CARD KM 0001" },
    ],
  },
  mohammed: {
    charges: [{ yearsAgo: 1, dueInDays: -390 }],
    payments: [
      { amountPence: 953_500, daysAgo: 395, reference: "BACS MAF 2025" },
    ],
  },
  oliver: {
    charges: [{ yearsAgo: 0, dueInDays: -10 }],
    payments: [{ amountPence: 953_500, daysAgo: 25, reference: "SLC OB 2026" }],
  },
  priya: {
    charges: [{ yearsAgo: 0, dueInDays: -10 }],
    payments: [
      { amountPence: 953_500, daysAgo: 12, reference: "BACS PN 0001" },
    ],
  },
  sofia: {
    charges: [
      {
        yearsAgo: 0,
        dueInDays: -8,
        amountPence: 0,
        note: "Deferred on medical grounds: fee moved to next year",
      },
    ],
    payments: [],
  },
  liam: {
    charges: [{ yearsAgo: 0, dueInDays: -6 }],
    payments: [
      { amountPence: 1_195_000, daysAgo: 30, reference: "BACS LO 0001" },
      { amountPence: 25_000, daysAgo: 5, reference: "BACS LO 0002" },
    ],
  },
  hannah: {
    charges: [{ yearsAgo: 0, dueInDays: -6 }],
    payments: [
      { amountPence: 200_000, daysAgo: 35, reference: "CARD HK 0001" },
    ],
  },
  chloe: {
    charges: [{ yearsAgo: 0, dueInDays: -7 }],
    payments: [
      {
        amountPence: 953_500,
        daysAgo: 20,
        reference: "BACS CD 0001",
        reversed: { reason: "Payment recalled by the bank", daysAgo: 3 },
      },
      { amountPence: 953_500, daysAgo: 1, reference: "BACS CD 0002" },
    ],
  },
  arjun: {
    charges: [{ yearsAgo: 0, dueInDays: 5 }],
    payments: [],
  },
};

async function seedAccounts(
  prisma: PrismaClient,
  students: Record<CastKey, SeededStudent>,
  currentYear: number,
  today: CalendarDate,
  now: Date,
): Promise<{ charges: number; payments: number }> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);
  const programmes = Object.fromEntries(
    PROGRAMMES.map((programme) => [programme.code, programme]),
  ) as Record<ProgrammeCode, (typeof PROGRAMMES)[number]>;
  let charges = 0;
  let payments = 0;

  for (const [key, account] of Object.entries(ACCOUNTS) as [
    CastKey,
    SeedAccount,
  ][]) {
    const student = students[key];
    const programme = programmes[student.programme];
    for (const charge of account.charges) {
      const academicYear = formatAcademicYear(currentYear - charge.yearsAgo);
      await prisma.feeCharge.create({
        data: {
          studentId: student.id,
          academicYear,
          description: feeDescription(academicYear, programme.title),
          amountPence: charge.amountPence ?? programme.annualFeePence,
          dueDate: toDbDate(addDays(today, charge.dueInDays)),
          note: charge.note,
          createdAt: daysAgo(Math.max(0, 30 - charge.dueInDays)),
        },
      });
      charges += 1;
    }
    for (const payment of account.payments) {
      await prisma.payment.create({
        data: {
          studentId: student.id,
          amountPence: payment.amountPence,
          paidOn: toDbDate(addDays(today, -payment.daysAgo)),
          reference: payment.reference,
          recordedAt: daysAgo(payment.daysAgo),
          reversal: payment.reversed && {
            create: {
              reason: payment.reversed.reason,
              reversedAt: daysAgo(payment.reversed.daysAgo),
            },
          },
        },
      });
      payments += 1;
    }
  }
  return { charges, payments };
}

type ModuleCode = (typeof PROGRAMMES)[number]["modules"][number]["code"];

interface SeedAssessment {
  module: ModuleCode;
  title: string;
  /** Days from today to the deadline, at 17:00 college time; negative = past. */
  deadlineInDays: number;
  /** How many days ago staff closed it to submissions, if they have. */
  closedDaysAgo?: number;
  submissions: {
    student: CastKey;
    /** Hours after the deadline the current file arrived; negative = before. */
    hoursAfterDeadline: number;
    format: "pdf" | "docx";
    /** Uploads so far, replacements included. */
    attempt?: number;
  }[];
  marks: {
    student: CastKey;
    mark: number;
    /** How many days ago the mark was published; unpublished if absent. */
    publishedDaysAgo?: number;
  }[];
}

/**
 * Assessments in every state: closed, past the deadline but still accepting
 * late work, and open. Submissions are on time, late and replaced, and the
 * marks cover every classification, published and not.
 */
const ASSESSMENTS: SeedAssessment[] = [
  {
    module: "CS4001",
    title: "Algorithms coursework",
    deadlineInDays: -14,
    closedDaysAgo: 3,
    submissions: [
      { student: "oliver", hoursAfterDeadline: -48, format: "pdf" },
      { student: "priya", hoursAfterDeadline: 26, format: "docx" },
      { student: "amelia", hoursAfterDeadline: -30, format: "pdf", attempt: 2 },
    ],
    marks: [
      { student: "oliver", mark: 74, publishedDaysAgo: 2 },
      { student: "priya", mark: 58, publishedDaysAgo: 2 },
      { student: "amelia", mark: 66, publishedDaysAgo: 2 },
    ],
  },
  {
    module: "CS4002",
    title: "Database design report",
    deadlineInDays: -2,
    submissions: [
      { student: "oliver", hoursAfterDeadline: -5, format: "docx" },
    ],
    marks: [{ student: "oliver", mark: 81 }],
  },
  {
    module: "CS5003",
    title: "Web project proposal",
    deadlineInDays: 10,
    submissions: [
      { student: "priya", hoursAfterDeadline: -264, format: "pdf" },
    ],
    marks: [],
  },
  {
    module: "CS5003",
    title: "Final year project",
    deadlineInDays: -200,
    closedDaysAgo: 190,
    submissions: [
      { student: "mohammed", hoursAfterDeadline: -24, format: "pdf" },
    ],
    marks: [{ student: "mohammed", mark: 68, publishedDaysAgo: 180 }],
  },
  {
    module: "BM4001",
    title: "Management essay",
    deadlineInDays: -7,
    submissions: [
      { student: "kwame", hoursAfterDeadline: -20, format: "docx" },
      { student: "chloe", hoursAfterDeadline: 50, format: "pdf" },
    ],
    marks: [
      { student: "kwame", mark: 35, publishedDaysAgo: 1 },
      { student: "chloe", mark: 62 },
    ],
  },
  {
    module: "BM4002",
    title: "Accounting test",
    deadlineInDays: 20,
    submissions: [],
    marks: [],
  },
  {
    module: "DS7001",
    title: "Machine learning report",
    deadlineInDays: -5,
    closedDaysAgo: 1,
    submissions: [
      // Submitted before withdrawing, so still on the marksheet.
      { student: "hannah", hoursAfterDeadline: -100, format: "pdf" },
      { student: "liam", hoursAfterDeadline: -3, format: "pdf" },
      { student: "arjun", hoursAfterDeadline: 20, format: "docx" },
    ],
    marks: [
      { student: "liam", mark: 71, publishedDaysAgo: 1 },
      { student: "arjun", mark: 45 },
    ],
  },
  {
    module: "DS7002",
    title: "Data pipeline design",
    deadlineInDays: 14,
    submissions: [],
    marks: [],
  },
];

/** Results withheld by staff, with the reason the student is shown. */
const HOLDS: Partial<Record<CastKey, { reason: string; daysAgo: number }>> = {
  amelia: { reason: OUTSTANDING_FEES_REASON, daysAgo: 5 },
};

async function seedAssessments(
  prisma: PrismaClient,
  students: Record<CastKey, SeededStudent>,
  clock: {
    today: CalendarDate;
    now: Date;
    timeZone: string;
    uploadDir: string;
  },
): Promise<{ assessments: number; submissions: number; marks: number }> {
  const { today, now, timeZone, uploadDir } = clock;
  const daysAgo = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);
  const modules = new Map(
    (await prisma.module.findMany({ select: { id: true, code: true } })).map(
      (row) => [row.code, row.id],
    ),
  );
  await mkdir(uploadDir, { recursive: true });
  let submissions = 0;
  let marks = 0;

  for (const seed of ASSESSMENTS) {
    const deadline = wallTimeToInstant(
      `${addDays(today, seed.deadlineInDays)}T17:00`,
      timeZone,
    );
    const moduleId = modules.get(seed.module);
    if (!deadline || !moduleId) {
      throw new Error(`Can't seed "${seed.title}".`);
    }
    const assessment = await prisma.assessment.create({
      data: {
        moduleId,
        title: seed.title,
        deadline,
        closedAt:
          seed.closedDaysAgo === undefined ? null : daysAgo(seed.closedDaysAgo),
        createdAt: new Date(deadline.getTime() - 28 * MS_PER_DAY),
      },
    });

    for (const submission of seed.submissions) {
      const member = CAST[submission.student];
      const bytes =
        submission.format === "pdf"
          ? samplePdf(seed.title, [
              member.fullName,
              students[submission.student].studentNumber,
              "Demo submission with fictitious content.",
            ])
          : sampleDocx(seed.title, [
              `${member.fullName} (${students[submission.student].studentNumber})`,
              "Demo submission with fictitious content.",
            ]);
      const storageKey = randomUUID();
      await writeFile(join(uploadDir, storageKey), bytes, { flag: "wx" });
      await prisma.submission.create({
        data: {
          studentId: students[submission.student].id,
          assessmentId: assessment.id,
          fileName: `${slug(member.fullName)}-${slug(seed.title)}.${submission.format}`,
          storageKey,
          mimeType: ACCEPTED_DOCUMENTS[submission.format].mimeType,
          sizeBytes: bytes.length,
          attempt: submission.attempt ?? 1,
          submittedAt: new Date(
            deadline.getTime() + submission.hoursAfterDeadline * 3_600_000,
          ),
        },
      });
      submissions += 1;
    }

    for (const result of seed.marks) {
      await prisma.assessmentResult.create({
        data: {
          studentId: students[result.student].id,
          assessmentId: assessment.id,
          mark: result.mark,
          publishedAt:
            result.publishedDaysAgo === undefined
              ? null
              : daysAgo(result.publishedDaysAgo),
        },
      });
      marks += 1;
    }
  }
  return { assessments: ASSESSMENTS.length, submissions, marks };
}

async function seedHolds(
  prisma: PrismaClient,
  students: Record<CastKey, SeededStudent>,
  now: Date,
): Promise<void> {
  for (const [key, hold] of Object.entries(HOLDS) as [
    CastKey,
    { reason: string; daysAgo: number },
  ][]) {
    await prisma.student.update({
      where: { id: students[key].id },
      data: {
        resultsWithheldAt: new Date(now.getTime() - hold.daysAgo * MS_PER_DAY),
        resultsWithheldReason: hold.reason,
      },
    });
  }
}

/** "Chloé Dubois" → "chloe-dubois", for file names. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
