// Prisma CLI configuration: where the schema and migrations live, how to seed,
// and which database to use.
import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma 7's CLI no longer reads .env by itself. Variables already set in the
// environment (CI, test runs) take precedence over the file.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read directly rather than with Prisma's env() helper, which throws when
    // the variable is missing and would break `prisma generate` on a fresh
    // install. Commands that need a database still fail with a clear message.
    url: process.env.DATABASE_URL,
  },
});
