// Runs once before the integration tests: checks that the target is a
// disposable *_test database, then applies every migration to it. Prisma
// creates the database on first use.
import { execSync } from "node:child_process";

import { assertTestDatabaseUrl } from "./test-database";

export default function setup(): void {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const output =
      error instanceof Error && "stderr" in error
        ? String(error.stderr)
        : String(error);
    throw new Error(
      `Could not migrate the test database. Is PostgreSQL running? Try \`npm run db:up\`.\n${output}`,
    );
  }
}
