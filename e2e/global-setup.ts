// Runs once before the end-to-end tests: checks that the target is a
// disposable *_test database, then applies every migration to it. Each test
// file loads the demo data itself (see support/demo-data.ts).
import { execSync } from "node:child_process";

import { assertTestDatabaseUrl } from "../tests/helpers/test-database";

export default function globalSetup(): void {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
