// Demo data for local development and end-to-end tests. Every person and
// reference is fictitious, and dates are relative to the day the seed runs, so
// recent enrolments, deferrals, withdrawals and deadlines always look recent.
// Running the seed replaces all existing data, uploaded files included.
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import {
  academicYearOn,
  formatAcademicYear,
  startYearOf,
} from "@/domain/academic-year";
import type { AuditEventInput } from "@/domain/audit";
import {
  addDays,
  type CalendarDate,
  fromDbDate,
  todayIn,
  toDbDate,
  wallTimeToInstant,
} from "@/domain/college-time";
import type { EnrolmentStatus } from "@/domain/enrolment";
import { feeDescription } from "@/domain/fees";
import { OUTSTANDING_FEES_REASON } from "@/domain/results";
import { formatStudentNumber } from "@/domain/student-number";
import { ACCEPTED_DOCUMENTS } from "@/domain/submissions";
import { type Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEMO_PASSWORD, DEMO_STAFF, DEMO_STUDENTS } from "@/lib/demo-accounts";

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
  /**
   * Their sign-in account, made when they enrolled. Unless stated, they have
   * activated it with the demo password. "pending": not activated yet.
   * "disabled": staff turned sign-in off when they left.
   */
  login?: "pending" | "disabled";
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
    login: "disabled",
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
    login: "pending",
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
    const logins = await seedLogins(prisma, students, now);
    const events = await seedAuditTrail(prisma, now);
    console.log(
      `Seeded ${PROGRAMMES.length} programmes, ${Object.keys(students).length} students, ${accounts.charges} fee charges, ${accounts.payments} payments, ${work.assessments} assessments, ${work.submissions} submissions, ${work.marks} marks and ${events} audit events.`,
    );
    console.log(
      `Sign-in: ${logins.staff} staff and ${logins.active} students use the password "${DEMO_PASSWORD}". Accounts awaiting activation: ${logins.pending}; turned off: ${logins.disabled}.`,
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

/**
 * Creates the sign-in accounts: the staff, and every student's account, made
 * when they enrolled. Everyone who has activated their account uses the demo
 * password.
 */
async function seedLogins(
  prisma: PrismaClient,
  students: Record<CastKey, SeededStudent>,
  now: Date,
): Promise<{
  staff: number;
  active: number;
  pending: number;
  disabled: number;
}> {
  const cast = Object.entries(CAST) as [CastKey, CastMember][];
  // The sign-in page lists these, so they must be able to sign in.
  for (const { email } of DEMO_STUDENTS) {
    const member = cast.find(([, m]) => m.email === email)?.[1];
    if (!member || member.login) {
      throw new Error(`Demo student ${email} has no active account.`);
    }
  }

  const daysAgo = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);
  // Better Auth's own hashing (scrypt), so the password works for sign-in.
  const password = await hashPassword(DEMO_PASSWORD);

  async function createLogin(data: Prisma.UserUncheckedCreateInput) {
    const user = await prisma.user.create({ data });
    if (data.emailVerified) {
      // Better Auth's credential accounts use the user's ID as the account ID.
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password,
        },
      });
    }
  }

  for (const { name, email } of DEMO_STAFF) {
    await createLogin({ name, email, role: "staff", emailVerified: true });
  }
  for (const [key, member] of cast) {
    await createLogin({
      name: member.fullName,
      email: member.email,
      role: "student",
      studentNumber: students[key].studentNumber,
      // Activating an account is what verifies its email address.
      emailVerified: member.login !== "pending",
      disabledAt:
        member.login === "disabled"
          ? daysAgo(member.history.at(-1)?.daysAgo ?? 0)
          : null,
      createdAt: daysAgo(member.history[0]?.daysAgo ?? 0),
    });
  }

  const count = (login: CastMember["login"]) =>
    cast.filter(([, member]) => member.login === login).length;
  return {
    staff: DEMO_STAFF.length,
    active: count(undefined),
    pending: count("pending"),
    disabled: count("disabled"),
  };
}

/**
 * Writes the audit trail the demo data would have left: who enrolled each
 * student and changed their status, charged, corrected and reversed fees and
 * payments, set assessments, entered and published marks, withheld results
 * and turned sign-in off, at the times the data says. Jane Okafor looks after
 * enrolment, Tom Reid fees, and Elena Petrova assessments and results; each
 * student submits their own work.
 */
async function seedAuditTrail(
  prisma: PrismaClient,
  now: Date,
): Promise<number> {
  const [jane, tom, elena] = await Promise.all(
    DEMO_STAFF.map(async ({ email }) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      return user.id;
    }),
  );
  if (!jane || !tom || !elena) throw new Error("The demo staff are missing.");
  const events: Prisma.AuditEventCreateManyInput[] = [];
  const add = (actorId: string, occurredAt: Date, event: AuditEventInput) => {
    events.push({
      actorId,
      occurredAt,
      action: event.action,
      studentId: event.studentId ?? null,
      details: event.details,
    });
  };

  const students = await prisma.student.findMany({
    include: {
      programme: true,
      statusChanges: { orderBy: { changedAt: "asc" } },
      feeCharges: true,
      payments: { include: { reversal: true } },
      submissions: { include: { assessment: true } },
      results: { include: { assessment: true } },
      user: true,
    },
  });
  for (const student of students) {
    const studentId = student.id;
    const [first, ...changes] = student.statusChanges;
    add(jane, student.createdAt, {
      action: "student.enrolled",
      studentId,
      details: {
        studentNumber: student.studentNumber,
        status: first?.toStatus ?? student.status,
      },
    });
    for (const change of changes) {
      if (!change.fromStatus) continue;
      add(jane, change.changedAt, {
        action: "student.status_changed",
        studentId,
        details: {
          from: change.fromStatus,
          to: change.toStatus,
          reason: change.reason,
        },
      });
    }

    // A fee other than the standard one was charged at the standard fee,
    // then corrected: on deferral, if the student deferred.
    const deferredAt = changes.find(
      ({ toStatus }) => toStatus === "DEFERRED",
    )?.changedAt;
    for (const charge of student.feeCharges) {
      const standardFee = student.programme.annualFeePence;
      add(tom, charge.createdAt, {
        action: "fee.charged",
        studentId,
        details: {
          academicYear: charge.academicYear,
          amountPence: standardFee,
        },
      });
      if (charge.amountPence !== standardFee) {
        add(
          tom,
          deferredAt ?? new Date(charge.createdAt.getTime() + MS_PER_DAY),
          {
            action: "fee.corrected",
            studentId,
            details: {
              academicYear: charge.academicYear,
              amountPence: charge.amountPence,
              dueDate: fromDbDate(charge.dueDate),
            },
          },
        );
      }
    }
    for (const payment of student.payments) {
      const details = {
        amountPence: payment.amountPence,
        reference: payment.reference,
      };
      add(tom, payment.recordedAt, {
        action: "payment.recorded",
        studentId,
        details,
      });
      if (payment.reversal) {
        add(tom, payment.reversal.reversedAt, {
          action: "payment.reversed",
          studentId,
          details: { ...details, reason: payment.reversal.reason },
        });
      }
    }

    for (const submission of student.submissions) {
      if (!student.user) continue;
      add(student.user.id, submission.submittedAt, {
        action: "work.submitted",
        studentId,
        details: {
          assessmentId: submission.assessmentId,
          title: submission.assessment.title,
          fileName: submission.fileName,
          late: submission.submittedAt > submission.assessment.deadline,
          attempt: submission.attempt,
        },
      });
    }

    // Marks are entered the day before they are published, or two days
    // after the deadline if they aren't published yet.
    const publications = new Map<number, number>();
    for (const result of student.results) {
      const enteredAt = result.publishedAt
        ? new Date(result.publishedAt.getTime() - MS_PER_DAY)
        : new Date(
            Math.min(
              now.getTime() - 60 * 60 * 1000,
              result.assessment.deadline.getTime() + 2 * MS_PER_DAY,
            ),
          );
      add(elena, enteredAt, {
        action: "mark.saved",
        studentId,
        details: {
          assessmentId: result.assessmentId,
          title: result.assessment.title,
          from: null,
          to: result.mark,
        },
      });
      if (result.publishedAt) {
        const at = result.publishedAt.getTime();
        publications.set(at, (publications.get(at) ?? 0) + 1);
      }
    }
    for (const [at, marks] of publications) {
      add(elena, new Date(at), {
        action: "results.published",
        studentId,
        details: { marks },
      });
    }
    if (student.resultsWithheldAt && student.resultsWithheldReason) {
      add(elena, student.resultsWithheldAt, {
        action: "results.withheld",
        studentId,
        details: { reason: student.resultsWithheldReason },
      });
    }
    if (student.user?.disabledAt) {
      add(jane, student.user.disabledAt, {
        action: "sign_in.turned_off",
        studentId,
        details: {},
      });
    }
  }

  const assessments = await prisma.assessment.findMany({
    include: { module: true },
  });
  for (const assessment of assessments) {
    const details = { assessmentId: assessment.id, title: assessment.title };
    add(elena, assessment.createdAt, {
      action: "assessment.set",
      details: { ...details, moduleCode: assessment.module.code },
    });
    if (assessment.closedAt) {
      add(elena, assessment.closedAt, { action: "assessment.closed", details });
    }
  }

  await prisma.auditEvent.createMany({ data: events });
  return events.length;
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
