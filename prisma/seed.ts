// Demo data for local development and end-to-end tests. Every person and
// reference is fictitious. Running the seed replaces all existing data.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

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
    await deleteEverything(prisma);
    await seedProgrammes(prisma);
    console.log(`Seeded ${PROGRAMMES.length} programmes.`);
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

async function seedProgrammes(prisma: PrismaClient): Promise<void> {
  for (const { modules, ...programme } of PROGRAMMES) {
    await prisma.programme.create({
      data: { ...programme, modules: { create: [...modules] } },
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
